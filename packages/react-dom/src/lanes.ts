import type { Fiber, FiberRoot } from "./types";

export type Lane = number;
export type Lanes = number;

export const NoLane: Lane = 0b0000;
export const SyncLane: Lane = 0b0001;
export const DefaultLane: Lane = 0b0010;
export const TransitionLane: Lane = 0b0100;

export function mergeLanes(first: Lanes, second: Lanes): Lanes {
  return first | second;
}

export function removeLanes(set: Lanes, subset: Lanes): Lanes {
  return set & ~subset;
}

export function includesSomeLane(set: Lanes, subset: Lanes): boolean {
  return (set & subset) !== NoLane;
}

export function getHighestPriorityLane(lanes: Lanes): Lane {
  return lanes & -lanes;
}

export function isHigherPriorityLane(first: Lane, second: Lane): boolean {
  if (first === NoLane) return false;
  if (second === NoLane) return true;
  return first < second;
}

export function markUpdateLaneFromFiberToRoot(
  sourceFiber: Fiber,
  lane: Lane,
): FiberRoot {
  sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);

  let parent = sourceFiber.parent;
  while (parent) {
    parent.childLanes = mergeLanes(parent.childLanes, lane);
    parent = parent.parent;
  }

  const root = sourceFiber.root;
  root.pendingLanes = mergeLanes(root.pendingLanes, lane);
  return root;
}
