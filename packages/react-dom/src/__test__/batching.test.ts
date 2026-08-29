import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetBatchingForTests,
  batchedUpdates,
  scheduleBatchedRoot,
} from "../batching";
import { NoLane } from "../lanes";
import type { FiberRoot } from "../types";

function createTestRoot(flush: () => void): FiberRoot {
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
    interleavedUpdatedLanes: NoLane,
    callbackPriority: NoLane,
    updateVersion: 0,
    renderVersion: 0,
    status: "active",
    schedule: vi.fn(),
    flush,
  };
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

describe("automatic batching", () => {
  afterEach(() => {
    __resetBatchingForTests();
  });

  it("waits for the outer batch and flushes each root once", async () => {
    const flush = vi.fn();
    const root = createTestRoot(flush);

    batchedUpdates(() => {
      scheduleBatchedRoot(root);
      batchedUpdates(() => {
        scheduleBatchedRoot(root);
      });
      expect(flush).not.toHaveBeenCalled();
    });

    expect(flush).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("restores the batch boundary when the scope throws", async () => {
    const flush = vi.fn();
    const root = createTestRoot(flush);

    expect(() =>
      batchedUpdates(() => {
        scheduleBatchedRoot(root);
        throw new Error("batch failed");
      }),
    ).toThrow("batch failed");

    await flushMicrotasks();
    expect(flush).toHaveBeenCalledTimes(1);

    scheduleBatchedRoot(root);
    await flushMicrotasks();
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("invalidates pending callbacks when batching is reset", async () => {
    const staleFlush = vi.fn();
    const nextFlush = vi.fn();

    scheduleBatchedRoot(createTestRoot(staleFlush));
    __resetBatchingForTests();
    scheduleBatchedRoot(createTestRoot(nextFlush));
    await flushMicrotasks();

    expect(staleFlush).not.toHaveBeenCalled();
    expect(nextFlush).toHaveBeenCalledTimes(1);
  });
});
