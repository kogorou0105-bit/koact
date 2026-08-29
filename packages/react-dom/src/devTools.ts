// packages/react-dom/src/devtools.ts
import { KoactEvents, type KoactEventMap } from "./events";

declare global {
  interface Window {
    __KOACT_DEVTOOLS_HOOK__?: {
      emit: (event: string, data: unknown) => void;
    };
  }
}

let removeDevToolsListeners: (() => void) | null = null;

export function initDevTools() {
  removeDevToolsListeners?.();
  const unsubscribers: Array<() => void> = [];
  const forward = <Event extends keyof KoactEventMap>(event: Event) => {
    unsubscribers.push(
      KoactEvents.on(event, (data) => {
        if (typeof window === "undefined") return;
        const hook = window.__KOACT_DEVTOOLS_HOOK__;

        if (hook && typeof hook.emit === "function") {
          hook.emit(event, data);
        }
      }),
    );
  };

  forward("update-scheduled");
  forward("render-start");
  forward("render-yield");
  forward("render-abort");
  forward("commit");

  const removeListeners = () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    if (removeDevToolsListeners === removeListeners) {
      removeDevToolsListeners = null;
    }
  };
  removeDevToolsListeners = removeListeners;
  return removeListeners;
}
