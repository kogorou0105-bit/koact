import {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  type ReactNode,
} from "@koact/react";
import type { FiberRoot } from "./types";
import {
  __resetBatchingForTests,
  scheduleBatchedRoot,
} from "./batching";
import { performUnitOfWork } from "./reconciler";
import { commitRoot } from "./commit";
import { resetWorkInProgressStateQueues } from "./hooks";
import {
  getHighestPriorityLane,
  isHigherPriorityLane,
  mergeLanes,
  NoLane,
  SyncLane,
  type Lane,
} from "./lanes";

type HostCallbackHandle =
  | { kind: "microtask"; generation: number }
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> };

const scheduledRoots: FiberRoot[] = [];
const scheduledRootSet = new Set<FiberRoot>();
const allRoots = new Set<FiberRoot>();
let rootsByContainer = new WeakMap<HTMLElement, FiberRoot>();
let hostCallback: HostCallbackHandle | null = null;
let hostCallbackPriority: Lane = NoLane;
let hostCallbackGeneration = 0;

function reportError(error: unknown) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

function enqueueRoot(root: FiberRoot) {
  if (root.status === "unmounted" || root.pendingLanes === NoLane) return;

  root.callbackPriority = getHighestPriorityLane(root.pendingLanes);
  if (!scheduledRootSet.has(root)) {
    scheduledRootSet.add(root);
    scheduledRoots.push(root);
  }
  requestHostCallback();
}

function getHighestScheduledLane() {
  let highestLane: Lane = NoLane;
  for (const root of scheduledRoots) {
    const lane = getHighestPriorityLane(root.pendingLanes);
    if (isHigherPriorityLane(lane, highestLane)) highestLane = lane;
  }
  return highestLane;
}

function getNextRoot() {
  if (scheduledRoots.length === 0) return null;

  let nextIndex = 0;
  let nextLane = getHighestPriorityLane(scheduledRoots[0].pendingLanes);
  for (let index = 1; index < scheduledRoots.length; index++) {
    const lane = getHighestPriorityLane(scheduledRoots[index].pendingLanes);
    if (isHigherPriorityLane(lane, nextLane)) {
      nextIndex = index;
      nextLane = lane;
    }
  }

  const [root] = scheduledRoots.splice(nextIndex, 1);
  if (root) {
    scheduledRootSet.delete(root);
    root.callbackPriority = NoLane;
  }
  return root || null;
}

function scheduleUpdateOnRoot(root: FiberRoot, lane: Lane) {
  if (root.workInProgress) {
    root.interleavedUpdatedLanes = mergeLanes(
      root.interleavedUpdatedLanes,
      lane,
    );
  }
  root.updateVersion++;
  scheduleBatchedRoot(root);
}

function shouldRestartRender(root: FiberRoot) {
  const updatedLane = getHighestPriorityLane(root.interleavedUpdatedLanes);
  return (
    updatedLane !== NoLane &&
    (updatedLane === root.renderLanes ||
      isHigherPriorityLane(updatedLane, root.renderLanes))
  );
}

function discardWorkInProgress(root: FiberRoot) {
  resetWorkInProgressStateQueues(root.workInProgress || undefined);
  root.workInProgress = null;
  root.nextUnitOfWork = null;
  root.renderLanes = NoLane;
  root.deletions = [];
}

function prepareFreshStack(root: FiberRoot) {
  const { normalizeChildren } =
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  root.renderVersion = root.updateVersion;
  root.renderLanes = getHighestPriorityLane(root.pendingLanes);
  root.finishedLanes = NoLane;
  root.interleavedUpdatedLanes = NoLane;
  root.deletions = [];
  root.workInProgress = {
    root,
    lanes: root.current?.lanes ?? NoLane,
    childLanes: root.current?.childLanes ?? NoLane,
    dom: root.container,
    props: {
      children: normalizeChildren(root.element),
    },
    alternate: root.current,
  };
  root.nextUnitOfWork = root.workInProgress;
}

function abortRoot(root: FiberRoot, error: unknown) {
  discardWorkInProgress(root);
  root.finishedLanes = NoLane;
  root.interleavedUpdatedLanes = NoLane;
  reportError(error);
}

function performWorkUntilDeadline(
  deadline: IdleDeadline,
  callbackPriority: Lane,
) {
  let didPerformWork = false;

  while (
    scheduledRoots.length > 0 &&
    !isHigherPriorityLane(callbackPriority, getHighestScheduledLane()) &&
    (!didPerformWork || deadline.timeRemaining() >= 1)
  ) {
    const root = getNextRoot();
    if (!root || root.status === "unmounted") continue;

    let didError = false;
    try {
      if (root.nextUnitOfWork && shouldRestartRender(root)) {
        discardWorkInProgress(root);
      }
      if (!root.nextUnitOfWork) prepareFreshStack(root);

      while (
        root.nextUnitOfWork &&
        (!didPerformWork || deadline.timeRemaining() >= 1)
      ) {
        root.nextUnitOfWork = performUnitOfWork(root, root.nextUnitOfWork);
        didPerformWork = true;
      }
    } catch (error) {
      didError = true;
      abortRoot(root, error);
    }

    if (didError) continue;

    if (root.nextUnitOfWork) {
      enqueueRoot(root);
      continue;
    }

    if (!root.workInProgress) continue;

    if (shouldRestartRender(root)) {
      discardWorkInProgress(root);
      enqueueRoot(root);
      continue;
    }

    try {
      commitRoot(root);
    } catch (error) {
      abortRoot(root, error);
      continue;
    }

    if (
      root.status === "unmounting" &&
      root.renderVersion === root.updateVersion
    ) {
      root.status = "unmounted";
      root.current = null;
      root.pendingLanes = NoLane;
      root.interleavedUpdatedLanes = NoLane;
      root.callbackPriority = NoLane;
      rootsByContainer.delete(root.container);
      allRoots.delete(root);
    } else if (
      root.renderVersion !== root.updateVersion ||
      root.pendingLanes !== NoLane
    ) {
      scheduleBatchedRoot(root);
    }
  }

  if (scheduledRoots.length > 0) requestHostCallback();
}

function requestHostCallback() {
  const nextPriority = getHighestScheduledLane();
  if (nextPriority === NoLane) return;

  if (hostCallback) {
    if (!isHigherPriorityLane(nextPriority, hostCallbackPriority)) return;
    cancelHostCallback();
  }

  const generation = ++hostCallbackGeneration;
  hostCallbackPriority = nextPriority;

  if (nextPriority === SyncLane) {
    hostCallback = { kind: "microtask", generation };
    enqueueMicrotask(() => {
      runHostCallback(generation, nextPriority, {
        didTimeout: true,
        timeRemaining: () => Number.POSITIVE_INFINITY,
      });
    });
    return;
  }

  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback((deadline) => {
      runHostCallback(
        generation,
        nextPriority,
        deadline || { didTimeout: false, timeRemaining: () => 5 },
      );
    });
    hostCallback = { kind: "idle", id };
    return;
  }

  const id = globalThis.setTimeout(() => {
    const start = performance.now();
    runHostCallback(generation, nextPriority, {
      didTimeout: false,
      timeRemaining: () => Math.max(0, 5 - (performance.now() - start)),
    });
  }, 0);
  hostCallback = { kind: "timeout", id };
}

function enqueueMicrotask(callback: () => void) {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}

function runHostCallback(
  generation: number,
  priority: Lane,
  deadline: IdleDeadline,
) {
  if (generation !== hostCallbackGeneration) return;

  hostCallback = null;
  hostCallbackPriority = NoLane;
  performWorkUntilDeadline(deadline, priority);
}

function cancelHostCallback() {
  if (!hostCallback) return;

  hostCallbackGeneration++;
  if (
    hostCallback.kind === "idle" &&
    typeof globalThis.cancelIdleCallback === "function"
  ) {
    globalThis.cancelIdleCallback(hostCallback.id);
  } else if (hostCallback.kind === "timeout") {
    globalThis.clearTimeout(hostCallback.id);
  }
  hostCallback = null;
  hostCallbackPriority = NoLane;
}

export function getOrCreateRoot(container: HTMLElement): FiberRoot {
  const existingRoot = rootsByContainer.get(container);
  if (existingRoot && existingRoot.status !== "unmounted") return existingRoot;

  let root: FiberRoot;
  root = {
    container,
    element: null,
    current: null,
    workInProgress: null,
    nextUnitOfWork: null,
    deletions: [],
    pendingLanes: NoLane,
    renderLanes: NoLane,
    finishedLanes: NoLane,
    interleavedUpdatedLanes: NoLane,
    callbackPriority: NoLane,
    updateVersion: 0,
    renderVersion: 0,
    status: "active",
    schedule: (lane) => scheduleUpdateOnRoot(root, lane),
    flush: () => enqueueRoot(root),
  };

  rootsByContainer.set(container, root);
  allRoots.add(root);
  return root;
}

export function updateContainer(element: ReactNode, root: FiberRoot) {
  if (root.status !== "active") {
    throw new Error("Cannot update an unmounted Koact root.");
  }

  root.element = element;
  root.pendingLanes = mergeLanes(root.pendingLanes, SyncLane);
  root.schedule(SyncLane);
}

export function unmountContainer(root: FiberRoot) {
  if (root.status !== "active") return;

  root.status = "unmounting";
  root.element = null;
  root.pendingLanes = mergeLanes(root.pendingLanes, SyncLane);
  root.schedule(SyncLane);
}

export function __resetSchedulerForTests() {
  __resetBatchingForTests();
  cancelHostCallback();
  scheduledRoots.length = 0;
  scheduledRootSet.clear();
  allRoots.forEach((root) => {
    resetWorkInProgressStateQueues(root.workInProgress || undefined);
    root.status = "unmounted";
    root.current = null;
    root.workInProgress = null;
    root.nextUnitOfWork = null;
    root.pendingLanes = NoLane;
    root.renderLanes = NoLane;
    root.finishedLanes = NoLane;
    root.interleavedUpdatedLanes = NoLane;
    root.callbackPriority = NoLane;
    root.deletions = [];
  });
  allRoots.clear();
  rootsByContainer = new WeakMap();
}
