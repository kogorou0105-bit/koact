import type { ReactNode } from "@koact/react";
import type { FiberRoot } from "./types";
import {
  __resetBatchingForTests,
  scheduleBatchedRoot,
} from "./batching";
import { commitRoot } from "./commit";
import { getEventTimestamp, KoactEvents } from "./events";
import { cancelHostCallback, requestHostCallback } from "./hostScheduler";
import { resetWorkInProgressStateQueues } from "./hooks";
import {
  isHigherPriorityLane,
  mergeLanes,
  NoLane,
  SyncLane,
  type Lane,
} from "./lanes";
import { performUnitOfWork } from "./reconciler";
import {
  discardWorkInProgress,
  emitRenderAbort,
  getRenderRestartLane,
  prepareFreshStack,
} from "./renderStack";
import { reportError } from "./reportError";
import {
  enqueueScheduledRoot,
  getHighestScheduledLane,
  hasScheduledRoots,
  resetScheduledRoots,
  takeNextScheduledRoot,
} from "./scheduledRoots";

const trackedRoots = new Set<WeakRef<FiberRoot>>();
let rootsByContainer = new WeakMap<HTMLElement, FiberRoot>();
let nextRootId = 1;

function trackRoot(root: FiberRoot) {
  trackedRoots.forEach((reference) => {
    if (!reference.deref()) trackedRoots.delete(reference);
  });
  trackedRoots.add(new WeakRef(root));
}

function untrackRoot(root: FiberRoot) {
  trackedRoots.forEach((reference) => {
    const trackedRoot = reference.deref();
    if (!trackedRoot || trackedRoot === root) trackedRoots.delete(reference);
  });
}

function enqueueRoot(root: FiberRoot) {
  if (!enqueueScheduledRoot(root)) return;
  requestHostCallback(getHighestScheduledLane(), performWorkUntilDeadline);
}

function scheduleUpdateOnRoot(root: FiberRoot, lane: Lane) {
  if (root.workInProgress) {
    root.interleavedUpdatedLanes = mergeLanes(
      root.interleavedUpdatedLanes,
      lane,
    );
  }
  root.updateVersion++;
  const timestamp = getEventTimestamp();
  KoactEvents.emit("update-scheduled", {
    rootId: root.id,
    lane,
    timestamp,
    processedFibers: 0,
  });
  scheduleBatchedRoot(root);
}

function abortRoot(root: FiberRoot, error: unknown) {
  emitRenderAbort(root, NoLane, "error");
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
    hasScheduledRoots() &&
    !isHigherPriorityLane(callbackPriority, getHighestScheduledLane()) &&
    (!didPerformWork || deadline.timeRemaining() >= 1)
  ) {
    const root = takeNextScheduledRoot();
    if (!root || root.status === "unmounted") continue;

    let didError = false;
    try {
      const restartLane = getRenderRestartLane(root);
      if (root.nextUnitOfWork && restartLane !== NoLane) {
        emitRenderAbort(
          root,
          restartLane,
          restartLane === root.renderLanes
            ? "same-priority-update"
            : "higher-priority-update",
        );
        discardWorkInProgress(root);
      }
      if (!root.nextUnitOfWork) prepareFreshStack(root);

      while (
        root.nextUnitOfWork &&
        (!didPerformWork || deadline.timeRemaining() >= 1)
      ) {
        root.processedFibers++;
        root.nextUnitOfWork = performUnitOfWork(root, root.nextUnitOfWork);
        didPerformWork = true;
      }
    } catch (error) {
      didError = true;
      abortRoot(root, error);
    }

    if (didError) continue;

    if (root.nextUnitOfWork) {
      const timestamp = getEventTimestamp();
      KoactEvents.emit("render-yield", {
        rootId: root.id,
        lane: root.renderLanes,
        timestamp,
        elapsedTime: Math.max(0, timestamp - root.renderStartTime),
        processedFibers: root.processedFibers,
      });
      enqueueRoot(root);
      continue;
    }

    if (!root.workInProgress) continue;

    const restartLane = getRenderRestartLane(root);
    if (restartLane !== NoLane) {
      emitRenderAbort(
        root,
        restartLane,
        restartLane === root.renderLanes
          ? "same-priority-update"
          : "higher-priority-update",
      );
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
      untrackRoot(root);
    } else if (
      root.renderVersion !== root.updateVersion ||
      root.pendingLanes !== NoLane
    ) {
      scheduleBatchedRoot(root);
    }
  }

  if (hasScheduledRoots()) {
    requestHostCallback(getHighestScheduledLane(), performWorkUntilDeadline);
  }
}

export function getOrCreateRoot(container: HTMLElement): FiberRoot {
  const existingRoot = rootsByContainer.get(container);
  if (existingRoot && existingRoot.status !== "unmounted") return existingRoot;

  let root: FiberRoot;
  root = {
    id: nextRootId++,
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
    renderStartTime: 0,
    processedFibers: 0,
    status: "active",
    schedule: (lane) => scheduleUpdateOnRoot(root, lane),
    flush: () => enqueueRoot(root),
  };

  rootsByContainer.set(container, root);
  trackRoot(root);
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
  if (root.status === "unmounted") return;

  if (root.status === "active") {
    root.status = "unmounting";
    root.element = null;
  }
  root.pendingLanes = mergeLanes(root.pendingLanes, SyncLane);
  root.schedule(SyncLane);
}

export function __resetSchedulerForTests() {
  __resetBatchingForTests();
  cancelHostCallback();
  resetScheduledRoots();
  trackedRoots.forEach((reference) => {
    const root = reference.deref();
    if (!root) return;
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
    root.renderStartTime = 0;
    root.processedFibers = 0;
    root.deletions = [];
  });
  trackedRoots.clear();
  rootsByContainer = new WeakMap();
}
