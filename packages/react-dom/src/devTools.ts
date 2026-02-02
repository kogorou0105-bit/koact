// packages/react-dom/src/devtools.ts
import { KoactEvents } from "./events";

// 初始化 DevTools 连接
export function initDevTools() {
  // 监听内核的 commit 事件
  KoactEvents.on("commit", (fiberRoot) => {
    const hook = window.__KOACT_DEVTOOLS_HOOK__;

    if (hook && typeof hook.emit === "function") {
      hook.emit("commit", fiberRoot);
    }
  });

  console.log("[Koact] DevTools integration initialized.");
}
