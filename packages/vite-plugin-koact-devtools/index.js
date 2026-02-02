// 注意：去掉了 import { Plugin } from 'vite'; 因为 JS 不需要类型导入
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 去掉了函数的类型注解 (: Plugin)
export default function koactDevTools() {
  const clientPath = path.resolve(__dirname, "client.js");
  // 确保读取文件时不出错，这里最好加个容错或确认路径正确
  const clientCode = fs.readFileSync(clientPath, "utf-8");

  return {
    name: "vite-plugin-koact-devtools",
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: "script",
            children: clientCode,
            injectTo: "body",
          },
        ],
      };
    },
  };
}
