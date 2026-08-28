import type { ReactElement, ReactNode } from "@koact/react";
import type { Lane } from "./lanes";

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
  flush: () => void;
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
  pending: StateUpdate<T> | null;
  dispatch: StateDispatch<T> | null;
  root: FiberRoot | null;
  fiber: Fiber | null;
  mounted: boolean;
}

export interface StateUpdate<T = unknown> {
  lane: Lane;
  action: StateAction<T>;
  next: StateUpdate<T>;
}

export interface Hook {
  tag: "STATE" | "EFFECT" | "MEMO" | "REF";
  initialized?: boolean;
  state?: unknown;
  baseState?: unknown;
  baseQueue?: StateUpdate<any> | null;
  queue?: StateQueue<any>;
  callback?: () => void | (() => void);
  deps?: readonly unknown[];
  cleanup?: (() => void) | void;
  hasChanged?: boolean;
  next?: Hook | null;
}
