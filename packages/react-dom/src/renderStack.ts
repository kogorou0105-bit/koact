import { getEventTimestamp, KoactEvents } from "./events";
import { resetWorkInProgressStateQueues } from "./hooks";
import {
  getHighestPriorityLane,
  isHigherPriorityLane,
  NoLane,
  type Lane,
} from "./lanes";
import type { FiberRoot } from "./types";

type RenderAbortReason =
  | "error"
  | "higher-priority-update"
  | "same-priority-update";

export function getRenderRestartLane(root: FiberRoot) {
  const updatedLane = getHighestPriorityLane(root.interleavedUpdatedLanes);
  return updatedLane !== NoLane &&
    (updatedLane === root.renderLanes ||
      isHigherPriorityLane(updatedLane, root.renderLanes))
    ? updatedLane
    : NoLane;
}

export function emitRenderAbort(
  root: FiberRoot,
  nextLane: Lane,
  reason: RenderAbortReason,
) {
  const timestamp = getEventTimestamp();
  KoactEvents.emit("render-abort", {
    rootId: root.id,
    lane: root.renderLanes,
    nextLane,
    reason,
    timestamp,
    elapsedTime: Math.max(0, timestamp - root.renderStartTime),
    processedFibers: root.processedFibers,
  });
}

export function discardWorkInProgress(root: FiberRoot) {
  resetWorkInProgressStateQueues(root.workInProgress || undefined);
  root.workInProgress = null;
  root.nextUnitOfWork = null;
  root.renderLanes = NoLane;
  root.deletions = [];
}

export function prepareFreshStack(root: FiberRoot) {
  root.renderVersion = root.updateVersion;
  root.renderLanes = getHighestPriorityLane(root.pendingLanes);
  root.finishedLanes = NoLane;
  root.interleavedUpdatedLanes = NoLane;
  root.renderStartTime = getEventTimestamp();
  root.processedFibers = 0;
  root.deletions = [];
  root.workInProgress = {
    root,
    lanes: root.current?.lanes ?? NoLane,
    childLanes: root.current?.childLanes ?? NoLane,
    dom: root.container,
    pendingProps: {
      children: root.element,
    },
    memoizedProps: root.current?.memoizedProps ?? null,
    ref: null,
    alternate: root.current,
  };
  root.nextUnitOfWork = root.workInProgress;
  KoactEvents.emit("render-start", {
    rootId: root.id,
    lane: root.renderLanes,
    timestamp: root.renderStartTime,
    processedFibers: 0,
  });
}
