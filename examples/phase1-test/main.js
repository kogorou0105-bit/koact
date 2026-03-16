// 测试相对路径导入 (浏览器原生支持)
import { message } from "./utils.js";

console.log("Main.js is running!");
document.getElementById("app").innerText = message;
