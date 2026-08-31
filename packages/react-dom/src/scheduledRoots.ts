import {
  getHighestPriorityLane,
  isHigherPriorityLane,
  NoLane,
  type Lane,
} from "./lanes";
import type { FiberRoot } from "./types";

const scheduledRoots: FiberRoot[] = [];
const scheduledRootSet = new Set<FiberRoot>();

export function enqueueScheduledRoot(root: FiberRoot) {
  if (root.status === "unmounted" || root.pendingLanes === NoLane) return false;

  root.callbackPriority = getHighestPriorityLane(root.pendingLanes);
  if (!scheduledRootSet.has(root)) {
    scheduledRootSet.add(root);
    scheduledRoots.push(root);
  }
  return true;
}

export function getHighestScheduledLane() {
  let highestLane: Lane = NoLane;
  for (const root of scheduledRoots) {
    const lane = getHighestPriorityLane(root.pendingLanes);
    if (isHigherPriorityLane(lane, highestLane)) highestLane = lane;
  }
  return highestLane;
}

export function takeNextScheduledRoot() {
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

export function hasScheduledRoots() {
  return scheduledRoots.length > 0;
}

export function resetScheduledRoots() {
  scheduledRoots.length = 0;
  scheduledRootSet.clear();
}
