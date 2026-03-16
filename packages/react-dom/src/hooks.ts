// packages/react-dom/src/hooks.ts
import { Globals } from "./globals";
import { Hook } from "./types";

function updateWorkInProgressHook(
  tag: "STATE" | "EFFECT" | "MEMO" | "REF",
): Hook {
  let hook: Hook;

  if (Globals.currentHook) {
    // 【更新阶段】：从老链表克隆 Hook
    hook = {
      tag: Globals.currentHook.tag,
      state: Globals.currentHook.state,
      queue: Globals.currentHook.queue,
      callback: Globals.currentHook.callback,
      deps: Globals.currentHook.deps,
      cleanup: Globals.currentHook.cleanup,
      hasChanged: Globals.currentHook.hasChanged,
      next: null, // 断开老链接
    };
    // 指针往后走一步
    Globals.currentHook = Globals.currentHook.next || null;
  } else {
    // 【挂载阶段】：新建空白 Hook
    hook = {
      tag,
      queue: [],
      next: null,
    };
  }

  // 将构造好的 hook 挂载到当前 Fiber 的链表上
  if (Globals.workInProgressHook === null) {
    Globals.wipFiber!.memoizedState = Globals.workInProgressHook = hook;
  } else {
    Globals.workInProgressHook.next = hook;
    Globals.workInProgressHook = hook;
  }

  return Globals.workInProgressHook;
}

export function useState<T>(
  initial: T,
): [T, (action: T | ((prevState: T) => T)) => void] {
  if (!Globals.wipFiber) {
    throw new Error("useState must be used within a component.");
  }
  const hook = updateWorkInProgressHook("STATE");

  if (hook.state === undefined) {
    hook.state = initial;
  }

  const actions = hook.queue;
  actions?.forEach((action) => {
    if (action instanceof Function) {
      hook.state = action(hook.state);
    } else {
      hook.state = action;
    }
  });

  hook.queue = []; // 清空处理过的队列

  const setState = (action: any) => {
    hook.queue!.push(action);
    if (Globals.currentRoot) {
      Globals.wipRoot = {
        dom: Globals.currentRoot.dom,
        props: Globals.currentRoot.props,
        alternate: Globals.currentRoot,
      };
      Globals.nextUnitOfWork = Globals.wipRoot;
      Globals.deletions = [];
    }
  };

  return [hook.state, setState];
}

function hasDepsChanged(prevDeps?: any[], nextDeps?: any[]) {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((dep, i) => dep !== prevDeps[i]);
}

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
  if (!Globals.wipFiber)
    throw new Error("useEffect must be used within a component.");

  const hook = updateWorkInProgressHook("EFFECT");
  // 注意：因为上面 clone 了老 hook，此时 hook.deps 就是旧的 deps
  const hasChanged = hasDepsChanged(hook.deps, deps);

  hook.callback = callback;
  hook.deps = deps;
  hook.hasChanged = hasChanged;
}

export function useMemo<T>(factory: () => T, deps: any[]): T {
  if (!Globals.wipFiber)
    throw new Error("useMemo must be used within a component.");

  const hook = updateWorkInProgressHook("MEMO");
  const hasChanged = hasDepsChanged(hook.deps, deps);

  hook.deps = deps;
  if (hasChanged || hook.state === undefined) {
    hook.state = factory();
  }

  return hook.state;
}

export function useCallback<T extends Function>(callback: T, deps: any[]): T {
  // useCallback 其实就是 useMemo 的语法糖
  return useMemo(() => callback, deps);
}

export function useRef<T>(initial: T): { current: T } {
  if (!Globals.wipFiber)
    throw new Error("useRef must be used within a component.");

  const hook = updateWorkInProgressHook("REF");

  if (hook.state === undefined) {
    hook.state = { current: initial };
  }

  return hook.state;
}
