// packages/react/src/index.ts
import { IGNORABLE_CHILDREN } from "./constant/constant";
import { resolveDispatcher, SharedInternals } from "./dispatcher";

export type { Dispatcher } from "./dispatcher";

export const Fragment = Symbol.for("koact.fragment");

export type Key = string | number;
export type DependencyList = readonly unknown[];
export type SetStateAction<T> = T | ((previousState: T) => T);
export type Dispatch<T> = (value: T) => void;
export type RefObject<T> = { current: T };
export type Ref<T> = RefObject<T | null> | ((value: T | null) => void);
export type FunctionComponent<P = Record<string, unknown>> = (
  props: P & { children?: ReactNode[] },
) => ReactNode;
export type ElementType = string | FunctionComponent<any> | symbol;
export type ReactNode =
  | ReactElement
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactNode[];

export interface ReactElement {
  type: ElementType;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
}

export function createElement(
  type: ElementType,
  props: any,
  ...children: ReactNode[]
): ReactElement {
  return {
    type,
    props: {
      ...(props || {}),
      children: normalizeChildren(children),
    },
  };
}

function createTextElement(text: string | number): ReactElement {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

export function isValidElement(value: unknown): value is ReactElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    "props" in value
  );
}

export function normalizeChildren(value: ReactNode): ReactElement[] {
  const normalized: ReactElement[] = [];

  const append = (child: ReactNode) => {
    if (Array.isArray(child)) {
      child.forEach(append);
      return;
    }

    if (IGNORABLE_CHILDREN.includes(child as never)) return;

    if (typeof child === "string" || typeof child === "number") {
      normalized.push(createTextElement(child));
      return;
    }

    if (isValidElement(child)) {
      normalized.push(child);
      return;
    }

    throw new TypeError(`Unsupported Koact child: ${String(child)}`);
  };

  append(value);
  return normalized;
}

export function useState<T>(initial: T | (() => T)) {
  return resolveDispatcher().useState(initial);
}

export function useEffect(
  callback: () => void | (() => void),
  deps?: DependencyList,
) {
  return resolveDispatcher().useEffect(callback, deps);
}

export function useMemo<T>(factory: () => T, deps: DependencyList) {
  return resolveDispatcher().useMemo(factory, deps);
}

export function useCallback<T extends (...args: any[]) => unknown>(
  callback: T,
  deps: DependencyList,
) {
  return resolveDispatcher().useCallback(callback, deps);
}

export function useRef<T>(initial: T) {
  return resolveDispatcher().useRef(initial);
}

export function startTransition(scope: () => void): void {
  const previousTransition = SharedInternals.currentTransition;
  SharedInternals.currentTransition = {};
  try {
    scope();
  } finally {
    SharedInternals.currentTransition = previousTransition;
  }
}

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
  SharedInternals,
  normalizeChildren,
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      [elemName: string]: any;
    }
  }
}

const React = {
  createElement,
  Fragment,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  startTransition,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
};

export default React;
