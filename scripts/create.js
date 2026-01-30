import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import readline from "readline";

// 获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 创建交互式接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 封装 Promise 风格的提问函数
const ask = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
};

async function main() {
  console.log("\n🚀 欢迎使用 Koact 项目生成器\n");

  // 1. 询问项目名称
  let projectName = "";
  while (!projectName) {
    projectName = await ask("👉 请输入项目名称 (例如 my-app): ");
    if (!projectName) {
      console.log("   ⚠️ 项目名称不能为空，请重新输入。");
    }
  }

  // 检查目录是否存在
  const targetDir = path.resolve(__dirname, `../examples/${projectName}`);
  if (fs.existsSync(targetDir)) {
    console.error(`\n❌ 目录已存在: ${targetDir}`);
    console.error("   请换个名字或者先删除旧目录。");
    rl.close();
    process.exit(1);
  }

  // 2. 询问模版类型
  console.log("\n👉 请选择模版类型:");
  console.log("   1. TypeScript (默认, 推荐)");
  console.log("   2. JavaScript (用于快速调试)");

  const answer = await ask("   请输入序号 [1/2]: ");
  const isJs = answer === "2" || answer.toLowerCase() === "js";

  const templateName = isJs ? "_template_js" : "_template";
  const templateDir = path.resolve(__dirname, `../examples/${templateName}`);

  // 检查模版是否存在
  if (!fs.existsSync(templateDir)) {
    console.error(`\n❌ 模版目录不存在: ${templateDir}`);
    console.error(
      "   请确保 examples/_template 或 examples/_template_js 存在。",
    );
    rl.close();
    process.exit(1);
  }

  console.log(`\n🛠  正在创建项目: ${projectName}`);
  console.log(`   模版: ${isJs ? "JavaScript" : "TypeScript"}`);

  // 3. 复制文件
  copyRecursiveSync(templateDir, targetDir);

  // 4. 修改 package.json
  const pkgPath = path.join(targetDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  pkg.name = projectName;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  console.log("📦 正在安装依赖...");
  rl.close(); // 关闭输入流，把控制权交给子进程

  // 5. 安装依赖
  const installProcess = spawn("pnpm", ["install", "--filter", projectName], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  });

  installProcess.on("close", (code) => {
    if (code === 0) {
      console.log(`\n✅ 项目创建成功！快去试试吧：`);
      console.log(`   pnpm --filter ${projectName} dev`);
    } else {
      console.error(`\n❌ 依赖安装失败，退出码: ${code}`);
    }
  });
}

// 递归复制工具函数
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    fs.mkdirSync(dest);
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(
        path.join(src, childItemName),
        path.join(dest, childItemName),
      );
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

main();
