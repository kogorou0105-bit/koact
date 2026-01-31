// packages/react-dom/src/hooks.ts
import { Globals } from "./globals";
import { Hook } from "./types";

export function useState<T>(
  initial: T,
): [T, (action: T | ((prevState: T) => T)) => void] {
  if (!Globals.wipFiber) {
    throw new Error("useState must be used within a component.");
  }

  const oldHook =
    Globals.wipFiber.alternate &&
    Globals.wipFiber.alternate.hooks &&
    Globals.wipFiber.alternate.hooks[Globals.hookIndex];

  const hook: Hook = {
    tag: "STATE",
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions?.forEach((action) => {
    if (action instanceof Function) {
      hook.state = action(hook.state);
    } else {
      hook.state = action;
    }
  });

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

  Globals.wipFiber.hooks!.push(hook);
  Globals.hookIndex++;
  return [hook.state, setState];
}

function hasDepsChanged(prevDeps?: any[], nextDeps?: any[]) {
  if (!prevDeps || !nextDeps) return true;
  if (prevDeps.length !== nextDeps.length) return true;
  return nextDeps.some((dep, i) => dep !== prevDeps[i]);
}

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
  if (!Globals.wipFiber) {
    throw new Error("useEffect must be used within a component.");
  }

  const oldHook =
    Globals.wipFiber.alternate &&
    Globals.wipFiber.alternate.hooks &&
    Globals.wipFiber.alternate.hooks[Globals.hookIndex];

  const hasChanged = hasDepsChanged(oldHook?.deps, deps);

  const hook: Hook = {
    tag: "EFFECT",
    callback: callback,
    deps: deps,
    cleanup: oldHook?.cleanup,
    hasChanged: hasChanged,
  };

  Globals.wipFiber.hooks!.push(hook);
  Globals.hookIndex++;
}

export function useMemo<T>(factory: () => T, deps: any[]): T {
  if (!Globals.wipFiber)
    throw new Error("useMemo must be used within a component.");

  const oldHook =
    Globals.wipFiber.alternate &&
    Globals.wipFiber.alternate.hooks &&
    Globals.wipFiber.alternate.hooks[Globals.hookIndex];

  const hasChanged = hasDepsChanged(oldHook?.deps, deps);

  const hook: Hook = {
    tag: "MEMO",
    deps: deps,
    state: hasChanged ? factory() : oldHook?.state,
  };

  Globals.wipFiber.hooks!.push(hook);
  Globals.hookIndex++;

  return hook.state;
}

export function useCallback<T extends Function>(callback: T, deps: any[]): T {
  // useCallback 其实就是 useMemo 的语法糖
  return useMemo(() => callback, deps);
}
