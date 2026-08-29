import { describe, expect, it, vi } from "vitest";
import {
  DefaultLane,
  getHighestPriorityLane,
  includesSomeLane,
  isHigherPriorityLane,
  markUpdateLaneFromFiberToRoot,
  mergeLanes,
  NoLane,
  removeLanes,
  SyncLane,
  TransitionLane,
} from "../lanes";
import type { Fiber, FiberRoot } from "../types";

function createRoot(): FiberRoot {
  return {
    container: document.createElement("div"),
    element: null,
    current: null,
    workInProgress: null,
    nextUnitOfWork: null,
    deletions: [],
    pendingLanes: NoLane,
    renderLanes: NoLane,
    finishedLanes: NoLane,
    callbackPriority: NoLane,
    updateVersion: 0,
    renderVersion: 0,
    status: "active",
    schedule: vi.fn(),
    flush: vi.fn(),
  };
}

function createFiber(root: FiberRoot, parent?: Fiber): Fiber {
  return {
    root,
    parent,
    props: { children: [] },
    lanes: NoLane,
    childLanes: NoLane,
  };
}

describe("lanes", () => {
  it("uses one bit for each update priority", () => {
    expect(SyncLane).toBe(0b0001);
    expect(DefaultLane).toBe(0b0010);
    expect(TransitionLane).toBe(0b0100);
    expect(SyncLane & DefaultLane).toBe(NoLane);
    expect(DefaultLane & TransitionLane).toBe(NoLane);
  });

  it("merges and removes lanes without affecting other priorities", () => {
    const pending = mergeLanes(
      mergeLanes(SyncLane, DefaultLane),
      TransitionLane,
    );

    expect(pending).toBe(0b0111);
    expect(removeLanes(pending, DefaultLane)).toBe(
      mergeLanes(SyncLane, TransitionLane),
    );
    expect(removeLanes(pending, NoLane)).toBe(pending);
  });

  it("detects whether two lane sets overlap", () => {
    const pending = mergeLanes(DefaultLane, TransitionLane);

    expect(includesSomeLane(pending, DefaultLane)).toBe(true);
    expect(includesSomeLane(pending, SyncLane)).toBe(false);
    expect(includesSomeLane(pending, NoLane)).toBe(false);
  });

  it("selects the least significant bit as the highest priority", () => {
    expect(getHighestPriorityLane(NoLane)).toBe(NoLane);
    expect(getHighestPriorityLane(TransitionLane)).toBe(TransitionLane);
    expect(
      getHighestPriorityLane(mergeLanes(DefaultLane, TransitionLane)),
    ).toBe(DefaultLane);
    expect(
      getHighestPriorityLane(mergeLanes(SyncLane, TransitionLane)),
    ).toBe(SyncLane);
  });

  it("compares lane priorities and handles the empty lane", () => {
    expect(isHigherPriorityLane(SyncLane, DefaultLane)).toBe(true);
    expect(isHigherPriorityLane(DefaultLane, TransitionLane)).toBe(true);
    expect(isHigherPriorityLane(TransitionLane, DefaultLane)).toBe(false);
    expect(isHigherPriorityLane(DefaultLane, NoLane)).toBe(true);
    expect(isHigherPriorityLane(NoLane, DefaultLane)).toBe(false);
    expect(isHigherPriorityLane(DefaultLane, DefaultLane)).toBe(false);
  });

  it("marks an update from its source fiber through the root", () => {
    const root = createRoot();
    const rootFiber = createFiber(root);
    const parent = createFiber(root, rootFiber);
    const source = createFiber(root, parent);
    root.current = rootFiber;
    rootFiber.child = parent;
    parent.child = source;

    expect(markUpdateLaneFromFiberToRoot(source, TransitionLane)).toBe(root);
    expect(source.lanes).toBe(TransitionLane);
    expect(parent.childLanes).toBe(TransitionLane);
    expect(rootFiber.childLanes).toBe(TransitionLane);
    expect(root.pendingLanes).toBe(TransitionLane);

    markUpdateLaneFromFiberToRoot(source, DefaultLane);
    const pending = mergeLanes(DefaultLane, TransitionLane);
    expect(source.lanes).toBe(pending);
    expect(parent.childLanes).toBe(pending);
    expect(rootFiber.childLanes).toBe(pending);
    expect(root.pendingLanes).toBe(pending);
  });
});
