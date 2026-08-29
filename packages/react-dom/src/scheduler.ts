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
import {
  getHighestPriorityLane,
  isHigherPriorityLane,
  mergeLanes,
  NoLane,
  SyncLane,
  type Lane,
} from "./lanes";

type HostCallbackHandle =
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> };

const scheduledRoots: FiberRoot[] = [];
const scheduledRootSet = new Set<FiberRoot>();
const allRoots = new Set<FiberRoot>();
let rootsByContainer = new WeakMap<HTMLElement, FiberRoot>();
let hostCallback: HostCallbackHandle | null = null;

function reportError(error: unknown) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

function enqueueRoot(root: FiberRoot) {
  if (
    root.status === "unmounted" ||
    root.pendingLanes === NoLane ||
    scheduledRootSet.has(root)
  ) {
    return;
  }

  scheduledRootSet.add(root);
  scheduledRoots.push(root);
  requestHostCallback();
}

function dequeueRoot() {
  const root = scheduledRoots.shift() || null;
  if (root) scheduledRootSet.delete(root);
  return root;
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

function performWorkUntilDeadline(deadline: IdleDeadline) {
  hostCallback = null;
  let didPerformWork = false;

  while (
    scheduledRoots.length > 0 &&
    (!didPerformWork || deadline.timeRemaining() >= 1)
  ) {
    const root = dequeueRoot();
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
  if (hostCallback) return;

  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback((deadline) => {
      performWorkUntilDeadline(
        deadline || { didTimeout: false, timeRemaining: () => 5 },
      );
    });
    hostCallback = { kind: "idle", id };
    return;
  }

  const id = globalThis.setTimeout(() => {
    const start = performance.now();
    performWorkUntilDeadline({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 5 - (performance.now() - start)),
    });
  }, 0);
  hostCallback = { kind: "timeout", id };
}

function cancelHostCallback() {
  if (!hostCallback) return;

  if (
    hostCallback.kind === "idle" &&
    typeof globalThis.cancelIdleCallback === "function"
  ) {
    globalThis.cancelIdleCallback(hostCallback.id);
  } else if (hostCallback.kind === "timeout") {
    globalThis.clearTimeout(hostCallback.id);
  }
  hostCallback = null;
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
