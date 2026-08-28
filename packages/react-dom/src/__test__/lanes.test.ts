import { describe, expect, it } from "vitest";
import {
  DefaultLane,
  getHighestPriorityLane,
  includesSomeLane,
  isHigherPriorityLane,
  mergeLanes,
  NoLane,
  removeLanes,
  SyncLane,
  TransitionLane,
} from "../lanes";

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
});
