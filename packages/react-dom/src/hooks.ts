import type {
  DependencyList,
  Dispatch,
  Dispatcher,
  RefObject,
  SetStateAction,
} from "@koact/react";
import { DefaultLane, markUpdateLaneFromFiberToRoot } from "./lanes";
import type { Fiber, FiberRoot, Hook, StateQueue } from "./types";
import {
  enqueueUpdate,
  mergeUpdateQueues,
  processUpdateQueue,
} from "./updateQueue";

interface HookRenderContext {
  root: FiberRoot;
  fiber: Fiber;
  currentHook: Hook | null;
  workInProgressHook: Hook | null;
  isMount: boolean;
}

let currentContext: HookRenderContext | null = null;

function requireContext() {
  if (!currentContext) {
    throw new Error("Hooks can only be used while rendering a component.");
  }
  return currentContext;
}

export function prepareToUseHooks(root: FiberRoot, fiber: Fiber) {
  fiber.memoizedState = null;
  currentContext = {
    root,
    fiber,
    currentHook: fiber.alternate?.memoizedState || null,
    workInProgressHook: null,
    isMount: !fiber.alternate,
  };
}

export function finishHooks() {
  const context = requireContext();
  if (context.currentHook) {
    throw new Error("Rendered fewer hooks than during the previous render.");
  }
}

export function resetHooksAfterRender() {
  currentContext = null;
}

function updateWorkInProgressHook(
  tag: "STATE" | "EFFECT" | "MEMO" | "REF",
): { hook: Hook; currentHook: Hook | null } {
  const context = requireContext();
  const currentHook = context.currentHook;
  let hook: Hook;

  if (currentHook) {
    if (currentHook.tag !== tag) {
      throw new Error(
        `Hook order changed: expected ${currentHook.tag}, received ${tag}.`,
      );
    }

    hook = {
      ...currentHook,
      next: null,
    };
    context.currentHook = currentHook.next || null;
  } else {
    if (!context.isMount) {
      throw new Error("Rendered more hooks than during the previous render.");
    }
    hook = { tag, next: null };
  }

  if (!context.workInProgressHook) {
    context.fiber.memoizedState = hook;
  } else {
    context.workInProgressHook.next = hook;
  }
  context.workInProgressHook = hook;

  return { hook, currentHook };
}

export function useState<T>(
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const context = requireContext();
  const { hook, currentHook } = updateWorkInProgressHook("STATE");

  if (!hook.initialized) {
    hook.state =
      typeof initial === "function" ? (initial as () => T)() : initial;
    hook.baseState = hook.state;
    hook.baseQueue = null;
    const queue: StateQueue<T> = {
      pending: null,
      dispatch: null,
      root: context.root,
      fiber: null,
      mounted: false,
    };
    queue.dispatch = (action) => {
      if (currentContext) {
        throw new Error("State updates during render are not supported.");
      }
      if (
        !queue.mounted ||
        !queue.root ||
        !queue.fiber ||
        queue.root.status !== "active"
      ) {
        return;
      }
      enqueueUpdate(queue, action, DefaultLane);
      markUpdateLaneFromFiberToRoot(queue.fiber, DefaultLane);
      queue.root.schedule();
    };
    hook.queue = queue;
    hook.initialized = true;
  }

  const queue = hook.queue as StateQueue<T>;
  queue.root = context.root;
  let baseQueue = hook.baseQueue || null;
  const pendingQueue = queue.pending;

  if (pendingQueue) {
    baseQueue = mergeUpdateQueues(baseQueue, pendingQueue);
    hook.baseQueue = baseQueue;
    if (currentHook) currentHook.baseQueue = baseQueue;
    queue.pending = null;
  }

  const result = processUpdateQueue(
    hook.baseState as T,
    baseQueue,
    context.root.renderLanes,
  );
  hook.state = result.memoizedState;
  hook.baseState = result.baseState;
  hook.baseQueue = result.baseQueue;

  return [
    result.memoizedState,
    queue.dispatch as Dispatch<SetStateAction<T>>,
  ];
}

function haveDepsChanged(
  previousDeps?: DependencyList,
  nextDeps?: DependencyList,
) {
  if (!previousDeps || !nextDeps) return true;
  if (previousDeps.length !== nextDeps.length) return true;
  return nextDeps.some(
    (dependency, index) => !Object.is(dependency, previousDeps[index]),
  );
}

export function useEffect(
  callback: () => void | (() => void),
  deps?: DependencyList,
) {
  const { hook } = updateWorkInProgressHook("EFFECT");
  hook.hasChanged = !hook.initialized || haveDepsChanged(hook.deps, deps);
  hook.callback = callback;
  hook.deps = deps;
  hook.initialized = true;
}

export function useMemo<T>(factory: () => T, deps: DependencyList): T {
  const { hook } = updateWorkInProgressHook("MEMO");

  if (!hook.initialized || haveDepsChanged(hook.deps, deps)) {
    hook.state = factory();
  }
  hook.deps = deps;
  hook.initialized = true;

  return hook.state as T;
}

export function useCallback<T extends (...args: any[]) => unknown>(
  callback: T,
  deps: DependencyList,
): T {
  return useMemo(() => callback, deps);
}

export function useRef<T>(initial: T): RefObject<T> {
  const { hook } = updateWorkInProgressHook("REF");

  if (!hook.initialized) {
    hook.state = { current: initial };
    hook.initialized = true;
  }

  return hook.state as RefObject<T>;
}

export const HooksDispatcher: Dispatcher = {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
};
