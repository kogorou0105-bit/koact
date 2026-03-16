import connect from "connect";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { init, parse } from "es-module-lexer";
import MagicString from "magic-string";
import resolve from "resolve";
import { transformSync } from "esbuild";

const app = connect();
const root = process.cwd();

await init;

function tryExtensions(dir: string, importPath: string): string | undefined {
  // 允许的后缀列表，顺序很重要 (优先找 TS)
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];

  // 1. 如果本来就有后缀，直接返回 (比如已经写了 .css 或 .png)
  if (path.extname(importPath)) {
    // 这里简单判断，只要有后缀就认为用户写全了
    // 实际上可能还要判断文件是否存在，暂且简化
    return importPath;
  }

  // 2. 尝试拼接后缀
  for (const ext of extensions) {
    const fullPath = path.join(dir, importPath + ext);
    if (fs.existsSync(fullPath)) {
      return importPath + ext; // 找到了！比如 ./constant -> ./constant.ts
    }
  }

  // 3. 处理目录导入 (比如 import App from './App' 其实是 ./App/index.ts)
  const indexExtensions = extensions.map((ext) => `/index${ext}`);
  for (const ext of indexExtensions) {
    const fullPath = path.join(dir, importPath + ext);
    if (fs.existsSync(fullPath)) {
      return importPath + ext;
    }
  }

  return undefined;
}

// --- 工具函数: 核心处理逻辑 (编译 TS -> JS + 重写 Import) ---
function processFile(content: string, filePath: string, url: string) {
  // 1. Esbuild 编译 (处理 TS/JSX)
  // 只要是 TS/TSX/JSX，或者是在 node_modules 里的 JS (可能包含高版本语法)，都建议跑一遍
  const ext = path.extname(filePath).slice(1); // 'ts', 'tsx', 'js'

  // 简单的 Loader 映射
  const loaderMap: Record<string, "js" | "jsx" | "ts" | "tsx"> = {
    js: "js",
    jsx: "jsx",
    ts: "ts",
    tsx: "tsx",
  };

  // 如果是 .ts/.tsx/jsx，必须编译
  // 如果是 .js，为了兼容性也可以编译一下 (可选)
  if (["ts", "tsx", "jsx"].includes(ext)) {
    try {
      const result = transformSync(content, {
        loader: loaderMap[ext] || "js",
        target: "esnext",
        format: "esm",
        sourcemap: false,
      });
      content = result.code;
    } catch (e) {
      console.error(pc.red(`[Esbuild Error] ${filePath}`), e);
      throw e;
    }
  }

  // 2. Import 路径重写 (处理 Bare Import)
  try {
    const [imports] = parse(content);
    const magicString = new MagicString(content);

    // 获取当前文件所在的目录 (用于解析相对路径)
    const currentDir = path.dirname(filePath);

    for (const item of imports) {
      if (item.n) {
        // 情况 A: 裸模块 (比如 'react') -> 改成 /@modules/react
        if (!item.n.startsWith(".") && !item.n.startsWith("/")) {
          const start = item.s;
          const end = item.e;
          magicString.overwrite(start, end, `/@modules/${item.n}`);
        }
        // 情况 B: 相对路径 (比如 './constant') -> 补全后缀
        else if (item.n.startsWith(".")) {
          // 尝试补全后缀
          const resolvedImport = tryExtensions(currentDir, item.n);

          if (resolvedImport) {
            // 如果找到了带后缀的路径 (比如 ./constant.ts)
            // 我们把它重写进去。浏览器请求 ./constant.ts 时，
            // 我们的服务器会拦截 .ts 请求 -> 编译 -> 返回 JS。闭环完成！
            const start = item.s;
            const end = item.e;
            // 注意：这里要保持相对路径的引用，或者转成绝对路径也可
            // 保持相对路径比较简单，浏览器自己会算
            magicString.overwrite(start, end, resolvedImport);
          }
        }
      }
    }
    content = magicString.toString();
  } catch (e) {
    console.error(pc.red(`[Parse Error] ${url}`), e);
  }

  return content;
}

// --- 中间件 1: Module Resolve (处理 /@modules/) ---
app.use((req, res, next) => {
  if (!req.url?.startsWith("/@modules/")) {
    return next();
  }

  const moduleName = req.url.replace("/@modules/", "");

  try {
    // 找到真实文件路径
    const targetPath = resolve.sync(moduleName, {
      basedir: root,
      packageFilter: (pkg) => {
        // 优先用 module (ESM)，其次 main
        if (pkg.module) pkg.main = pkg.module;
        return pkg;
      },
    });

    console.log(pc.yellow(`[Module] ${moduleName} -> ${targetPath}`));

    // 读取文件
    let content = fs.readFileSync(targetPath, "utf-8");

    // ★★★ 关键修改: 对 node_modules 里的文件也进行处理！★★★
    // 因为我们在 Monorepo 里，引用的其实是 src/index.ts (TypeScript)
    content = processFile(content, targetPath, req.url);

    res.setHeader("Content-Type", "application/javascript");
    res.end(content);
  } catch (e) {
    console.error(pc.red(`[Error] Module not found: ${moduleName}`));
    console.error(e);
    res.statusCode = 404;
    res.end("Module not found");
  }
});

// --- 中间件 2: 源码服务 (Source Code Server) ---
app.use((req, res, next) => {
  const url = req.url!;
  let filePath = url === "/" ? "/index.html" : url;
  const absolutePath = path.join(root, filePath);

  if (!fs.existsSync(absolutePath)) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  let content = fs.readFileSync(absolutePath, "utf-8");

  if (filePath.endsWith(".html")) {
    res.setHeader("Content-Type", "text/html");
    res.end(content);
    return;
  }

  const isScript = /\.(js|jsx|ts|tsx)$/.test(filePath);

  if (isScript) {
    res.setHeader("Content-Type", "application/javascript");
    try {
      // ★★★ 使用同样的通用处理函数 ★★★
      content = processFile(content, absolutePath, url);
    } catch (e) {
      res.statusCode = 500;
      res.end("Build Error");
      return;
    }
  } else if (filePath.endsWith(".css")) {
    res.setHeader("Content-Type", "text/css");
  }

  res.end(content);
});

const port = 3000;
http.createServer(app).listen(port, () => {
  console.log(
    pc.green(`\n🚀 Ko-Vite Server running at http://localhost:${port}`),
  );
  console.log(`Root: ${root}\n`);
});
