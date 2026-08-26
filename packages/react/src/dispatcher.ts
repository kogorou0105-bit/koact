// packages/react/src/dispatcher.ts
import type {
  DependencyList,
  Dispatch,
  RefObject,
  SetStateAction,
} from "./index";

export interface Dispatcher {
  useState<T>(initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>];
  useEffect(
    callback: () => void | (() => void),
    deps?: DependencyList,
  ): void;
  useMemo<T>(factory: () => T, deps: DependencyList): T;
  useCallback<T extends (...args: any[]) => unknown>(
    callback: T,
    deps: DependencyList,
  ): T;
  useRef<T>(initial: T): RefObject<T>;
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
