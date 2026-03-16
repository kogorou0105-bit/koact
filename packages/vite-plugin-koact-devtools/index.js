import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
