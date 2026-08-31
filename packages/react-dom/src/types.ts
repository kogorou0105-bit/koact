import type { ElementType, ReactNode, Ref } from "@koact/react";
import type { Lane, Lanes } from "./lanes";

export type EffectTag = "PLACEMENT" | "UPDATE" | "DELETION";
export type RootStatus = "active" | "unmounting" | "unmounted";
export type StateAction<T> = T | ((previousState: T) => T);
export type StateDispatch<T> = (action: StateAction<T>) => void;
export type FiberProps = Record<string, any> & { children?: ReactNode };

export interface FiberRoot {
  id: number;
  container: HTMLElement;
  element: ReactNode;
  current: Fiber | null;
  workInProgress: Fiber | null;
  nextUnitOfWork: Fiber | null;
  deletions: Fiber[];
  pendingLanes: Lanes;
  renderLanes: Lanes;
  finishedLanes: Lanes;
  interleavedUpdatedLanes: Lanes;
  callbackPriority: Lane;
  updateVersion: number;
  renderVersion: number;
  renderStartTime: number;
  processedFibers: number;
  status: RootStatus;
  schedule: (lane: Lane) => void;
  flush: () => void;
}

export interface Fiber {
  type?: ElementType;
  pendingProps: FiberProps;
  memoizedProps: FiberProps | null;
  ref: Ref<any> | null;
  root: FiberRoot;
  lanes: Lanes;
  childLanes: Lanes;
  dom?: HTMLElement | Text | null;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber | null;
  isBailoutClone?: boolean;
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
  workInProgressFiber: Fiber | null;
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
