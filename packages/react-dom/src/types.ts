import type { ReactElement, ReactNode } from "@koact/react";

export type EffectTag = "PLACEMENT" | "UPDATE" | "DELETION";
export type RootStatus = "active" | "unmounting" | "unmounted";
export type StateAction<T> = T | ((previousState: T) => T);
export type StateDispatch<T> = (action: StateAction<T>) => void;

export interface FiberRoot {
  container: HTMLElement;
  element: ReactNode;
  current: Fiber | null;
  workInProgress: Fiber | null;
  nextUnitOfWork: Fiber | null;
  deletions: Fiber[];
  updateVersion: number;
  renderVersion: number;
  status: RootStatus;
  schedule: () => void;
}

export interface Fiber {
  type?: string | Function | symbol;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
  root: FiberRoot;
  dom?: HTMLElement | Text | null;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber | null;
  effectTag?: EffectTag;
  key?: null | string | number;
  index?: number;
  memoizedState?: Hook | null;
}

export interface StateQueue<T = unknown> {
  pending: StateAction<T>[];
  dispatch: StateDispatch<T> | null;
  root: FiberRoot | null;
  mounted: boolean;
}

export interface Hook {
  tag: "STATE" | "EFFECT" | "MEMO" | "REF";
  initialized?: boolean;
  state?: unknown;
  queue?: StateQueue<any>;
  processedCount?: number;
  callback?: () => void | (() => void);
  deps?: readonly unknown[];
  cleanup?: (() => void) | void;
  hasChanged?: boolean;
  next?: Hook | null;
}
