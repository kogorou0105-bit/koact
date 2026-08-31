import { describe, expect, it, vi } from "vitest";
import { startTransition, useEffect, useState } from "@koact/react";
import { createRoot } from "../index";
import { DefaultLane, NoLane, SyncLane, TransitionLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import {
  flushWork,
  h,
  mockIdleCallbacks,
  setupRuntimeTests,
} from "./testUtils";

setupRuntimeTests();

describe("scheduler lanes integration", () => {
  it("tracks and clears lanes for root and state updates", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let setCount!: (value: number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    await flushWork();

    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.renderLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(SyncLane);
    expect(internalRoot.callbackPriority).toBe(NoLane);

    const currentRootFiber = internalRoot.current!;
    const currentCounterFiber = currentRootFiber.child!;
    setCount(1);

    expect(currentCounterFiber.lanes).toBe(DefaultLane);
    expect(currentRootFiber.childLanes).toBe(DefaultLane);
    expect(internalRoot.pendingLanes).toBe(DefaultLane);
    await flushWork();

    expect(container.textContent).toBe("1");
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.renderLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
    expect(internalRoot.current!.lanes).toBe(NoLane);
    expect(internalRoot.current!.childLanes).toBe(NoLane);
    expect(internalRoot.current!.child!.lanes).toBe(NoLane);
  });

  it("assigns transition lanes only to updates inside the scope", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let setCount!: (value: number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();

    const queue = internalRoot.current!.child!.memoizedState!.queue!;
    startTransition(() => setCount(1));

    expect(queue.pending?.lane).toBe(TransitionLane);
    expect(internalRoot.pendingLanes).toBe(TransitionLane);
    await flushWork();
    expect(container.textContent).toBe("1");
    expect(internalRoot.finishedLanes).toBe(TransitionLane);

    setCount(2);
    expect(queue.pending?.lane).toBe(DefaultLane);
    expect(internalRoot.pendingLanes).toBe(DefaultLane);
    await flushWork();
    expect(container.textContent).toBe("2");
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
  });

  it("renders the highest priority lane first and rebases deferred updates", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let updateCount!: (update: (value: number) => number) => void;
    const committedStates: number[] = [];

    function Counter() {
      const [count, setCount] = useState(0);
      updateCount = setCount;
      useEffect(() => {
        committedStates.push(count);
      }, [count]);
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();

    updateCount((value) => value + 1);
    startTransition(() => updateCount((value) => value * 10));
    updateCount((value) => value + 1);

    const queue = internalRoot.current!.child!.memoizedState!.queue!;
    expect(queue.pending?.lane).toBe(DefaultLane);
    expect(queue.pending?.next.lane).toBe(DefaultLane);
    expect(queue.pending?.next.next.lane).toBe(TransitionLane);
    expect(internalRoot.pendingLanes).toBe(DefaultLane | TransitionLane);

    await flushWork();
    expect(committedStates).toEqual([0, 2, 11]);
    expect(container.textContent).toBe("11");
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(TransitionLane);
    expect(queue.pending).toBeNull();
    expect(internalRoot.current!.child!.memoizedState!.baseQueue).toBeNull();
  });

  it("keeps transition work pending between priority commits", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let updateCount!: (update: (value: number) => number) => void;

    function Counter() {
      const [count, setCount] = useState(0);
      updateCount = setCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await vi.advanceTimersByTimeAsync(0);

    updateCount((value) => value + 1);
    startTransition(() => updateCount((value) => value * 10));
    updateCount((value) => value + 1);
    await vi.advanceTimersByTimeAsync(0);

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    const defaultHook = internalRoot.current!.child!.memoizedState!;
    expect(container.textContent).toBe("2");
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
    expect(internalRoot.pendingLanes).toBe(TransitionLane);
    expect(defaultHook.baseState).toBe(1);
    expect(defaultHook.baseQueue?.next.lane).toBe(TransitionLane);
    expect(defaultHook.baseQueue?.lane).toBe(NoLane);

    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("11");
    expect(internalRoot.finishedLanes).toBe(TransitionLane);
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.current!.child!.memoizedState!.baseQueue).toBeNull();
  });

  it("drops pending lanes after removing their only subtree", async () => {
    const { pendingCallbacks: idleCallbacks, cancelIdleCallback } =
      mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let setCount!: (value: number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await vi.advanceTimersByTimeAsync(0);

    startTransition(() => setCount(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(internalRoot.callbackPriority).toBe(TransitionLane);

    root.render(h("p", null, "replacement"));
    await vi.advanceTimersByTimeAsync(0);

    expect(container.textContent).toBe("replacement");
    expect(internalRoot.finishedLanes).toBe(SyncLane);
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.callbackPriority).toBe(NoLane);
    expect(internalRoot.current!.childLanes).toBe(NoLane);
    expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
    expect(idleCallbacks).toHaveLength(1);

    const committedRoot = internalRoot.current;
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });
    setCount(2);
    await vi.advanceTimersByTimeAsync(0);

    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.callbackPriority).toBe(NoLane);
    expect(internalRoot.current!.childLanes).toBe(NoLane);
    expect(internalRoot.current).toBe(committedRoot);
    expect(idleCallbacks).toHaveLength(0);
  });

  it("keeps explicit root updates synchronous inside transitions", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);

    startTransition(() => root.render(h("span", null, "sync")));
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    await flushWork();
    expect(container.textContent).toBe("sync");

    startTransition(() => root.unmount());
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    await flushWork();
    expect(container.textContent).toBe("");
  });

  it("preserves same-lane updates scheduled during commit callbacks", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let commitCount = 0;

    function Counter() {
      const [count, setCount] = useState(0);
      useEffect(() => {
        commitCount++;
        if (count === 0) setCount(1);
      }, [count]);
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();

    expect(container.textContent).toBe("1");
    expect(commitCount).toBe(2);
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
  });
});
