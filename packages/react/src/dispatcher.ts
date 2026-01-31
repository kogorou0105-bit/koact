// packages/react/src/dispatcher.ts
import { ReactElement } from "./index";

export interface Dispatcher {
  useState<T>(initial: T): [T, (action: T | ((prevState: T) => T)) => void];
  useEffect(callback: () => void | (() => void), deps?: any[]): void;
  useLayoutEffect?(callback: () => void | (() => void), deps?: any[]): void; //以此类推
  useMemo<T>(factory: () => T, deps: any[]): T;
  useCallback<T extends Function>(callback: T, deps: any[]): T;
  useRef<T>(initial: T): { current: T };
}

export const SharedInternals = {
  currentDispatcher: null as Dispatcher | null,
};

export function resolveDispatcher() {
  const dispatcher = SharedInternals.currentDispatcher;
  if (!dispatcher) {
    throw new Error(
      "Invalid hook call. Hooks can only be called inside of the body of a function component.\n" +
        "原因可能是：\n" +
        "1. 你没有引入 @koact/react-dom\n" +
        "2. 你在组件外部调用了 Hook",
    );
  }
  return dispatcher;
}
