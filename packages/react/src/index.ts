// packages/react/src/index.ts
import { IGNORABLE_CHILDREN } from "./constant/constant";
import { resolveDispatcher, SharedInternals } from "./dispatcher";

export const Fragment = Symbol.for("koact.fragment");

export interface ReactElement {
  type: string | Function | symbol;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
}

export function createElement(
  type: string | Function,
  props: any,
  ...children: any[]
): ReactElement {
  return {
    type,
    props: {
      ...props,
      children: children
        .flat(Infinity)
        .filter((child) => !IGNORABLE_CHILDREN.includes(child))
        .map((child) => {
          if (typeof child === "object") {
            return child;
          }
          return createTextElement(child);
        }),
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

// ========== 新增 Hooks 导出  ==========

export function useState<T>(initial: T) {
  return resolveDispatcher().useState(initial);
}

export function useEffect(callback: () => void | (() => void), deps?: any[]) {
  return resolveDispatcher().useEffect(callback, deps);
}

export function useMemo<T>(factory: () => T, deps: any[]) {
  return resolveDispatcher().useMemo(factory, deps);
}

export function useCallback<T extends Function>(callback: T, deps: any[]) {
  return resolveDispatcher().useCallback(callback, deps);
}

export function useRef<T>(initial: T) {
  return resolveDispatcher().useRef(initial);
}

export const __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = {
  SharedInternals,
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
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
};

export default React;
