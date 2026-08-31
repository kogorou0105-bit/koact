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
  props: P & { children?: ReactNode },
) => ReactNode;
export const MEMO_TYPE = Symbol.for("koact.memo");

export interface MemoComponent<P = Record<string, unknown>> {
  (props: P & { children?: ReactNode }): ReactNode;
  $$typeof: typeof MEMO_TYPE;
  type: FunctionComponent<P>;
  compare: ((previous: P, next: P) => boolean) | null;
  displayName?: string;
}

export type ElementType =
  | string
  | FunctionComponent<any>
  | MemoComponent<any>
  | symbol;
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
  key: Key | null;
  ref: Ref<any> | null;
  props: Record<string, any> & { children?: ReactNode };
}

export function createElement(
  type: ElementType,
  props: any,
  ...children: ReactNode[]
): ReactElement {
  const { key = null, ref = null, ...elementProps } = props || {};

  if (children.length === 1) {
    elementProps.children = children[0];
  } else if (children.length > 1) {
    elementProps.children = children;
  }

  return {
    type,
    key,
    ref,
    props: elementProps,
  };
}

function createTextElement(text: string | number): ReactElement {
  return {
    type: "TEXT_ELEMENT",
    key: null,
    ref: null,
    props: {
      nodeValue: text,
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

export function memo<P>(
  component: FunctionComponent<P> & { $$typeof?: never },
  compare?: (previous: P, next: P) => boolean,
): MemoComponent<P> {
  if (typeof component !== "function") {
    throw new TypeError("memo expects a function component.");
  }
  return {
    $$typeof: MEMO_TYPE,
    type: component,
    compare: compare ?? null,
  } as MemoComponent<P>;
}

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
  SharedInternals,
  normalizeChildren,
};

declare global {
  namespace JSX {
    interface IntrinsicAttributes {
      key?: Key;
    }

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
  memo,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
};

export default React;
