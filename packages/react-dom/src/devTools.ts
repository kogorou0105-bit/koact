// packages/react-dom/src/devtools.ts
import { KoactEvents } from "./events";

declare global {
  interface Window {
    __KOACT_DEVTOOLS_HOOK__?: {
      emit: (event: string, data: unknown) => void;
    };
  }
}

// 初始化 DevTools 连接
export function initDevTools() {
  KoactEvents.on("commit", (fiberRoot) => {
    if (typeof window === "undefined") return;
    const hook = window.__KOACT_DEVTOOLS_HOOK__;

    if (hook && typeof hook.emit === "function") {
      hook.emit("commit", fiberRoot);
    }
  });
}
