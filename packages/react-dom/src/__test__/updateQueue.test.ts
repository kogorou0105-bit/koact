import { describe, expect, it } from "vitest";
import { DefaultLane, NoLane, TransitionLane } from "../lanes";
import type { StateQueue } from "../types";
import {
  enqueueUpdate,
  mergeUpdateQueues,
  processUpdateQueue,
} from "../updateQueue";

function createQueue<State>(): StateQueue<State> {
  return {
    pending: null,
    dispatch: null,
    root: null,
    fiber: null,
    mounted: true,
  };
}

describe("state update queue", () => {
  it("enqueues updates in a circular list and preserves insertion order", () => {
    const queue = createQueue<number>();
    expect(processUpdateQueue(1, null, DefaultLane)).toEqual({
      memoizedState: 1,
      baseState: 1,
      baseQueue: null,
    });

    const first = enqueueUpdate(queue, (state) => state + 1, DefaultLane);
    expect(queue.pending).toBe(first);
    expect(first.next).toBe(first);

    const second = enqueueUpdate(queue, (state) => state * 3, DefaultLane);

    expect(queue.pending).toBe(second);
    expect(second.next).toBe(first);
    expect(first.next).toBe(second);

    const result = processUpdateQueue(1, queue.pending, DefaultLane);
    expect(result.memoizedState).toBe(6);
    expect(result.baseState).toBe(6);
    expect(result.baseQueue).toBeNull();
  });

  it("merges circular queues without changing their update order", () => {
    const base = createQueue<number>();
    const pending = createQueue<number>();
    enqueueUpdate(base, 1, DefaultLane);
    enqueueUpdate(base, (state) => state + 1, DefaultLane);
    enqueueUpdate(pending, (state) => state * 2, DefaultLane);

    const merged = mergeUpdateQueues(base.pending, pending.pending);
    const result = processUpdateQueue(0, merged, DefaultLane);

    expect(result.memoizedState).toBe(4);
  });

  it("rebases skipped updates without duplicating committed work", () => {
    const queue = createQueue<number>();
    enqueueUpdate(queue, (state) => state + 1, DefaultLane);
    enqueueUpdate(queue, (state) => state * 10, TransitionLane);
    enqueueUpdate(queue, (state) => state + 1, DefaultLane);

    const defaultResult = processUpdateQueue(
      0,
      queue.pending,
      DefaultLane,
    );
    expect(defaultResult.memoizedState).toBe(2);
    expect(defaultResult.baseState).toBe(1);
    expect(defaultResult.baseQueue).not.toBeNull();
    expect(defaultResult.baseQueue?.lane).toBe(NoLane);

    const rebasedResult = processUpdateQueue(
      defaultResult.baseState,
      defaultResult.baseQueue,
      TransitionLane,
    );
    expect(rebasedResult.memoizedState).toBe(11);
    expect(rebasedResult.baseQueue).toBeNull();
  });

  it("preserves deferred updates when no lane can be processed", () => {
    const queue = createQueue<number>();
    enqueueUpdate(queue, (state) => state + 1, TransitionLane);
    enqueueUpdate(queue, (state) => state * 2, TransitionLane);

    const skippedResult = processUpdateQueue(
      3,
      queue.pending,
      DefaultLane,
    );
    expect(skippedResult.memoizedState).toBe(3);
    expect(skippedResult.baseState).toBe(3);
    expect(skippedResult.baseQueue).not.toBeNull();

    const replayedResult = processUpdateQueue(
      skippedResult.baseState,
      skippedResult.baseQueue,
      TransitionLane,
    );
    expect(replayedResult.memoizedState).toBe(8);
    expect(replayedResult.baseQueue).toBeNull();
  });

  it("appends new pending updates after an existing base queue", () => {
    const base = createQueue<number>();
    const pending = createQueue<number>();
    enqueueUpdate(base, (state) => state + 1, TransitionLane);
    enqueueUpdate(pending, (state) => state * 3, DefaultLane);

    const merged = mergeUpdateQueues(base.pending, pending.pending);
    const defaultResult = processUpdateQueue(2, merged, DefaultLane);

    expect(defaultResult.memoizedState).toBe(6);
    expect(defaultResult.baseState).toBe(2);
    expect(defaultResult.baseQueue).not.toBeNull();

    const replayedResult = processUpdateQueue(
      defaultResult.baseState,
      defaultResult.baseQueue,
      TransitionLane,
    );
    expect(replayedResult.memoizedState).toBe(9);
  });
});
