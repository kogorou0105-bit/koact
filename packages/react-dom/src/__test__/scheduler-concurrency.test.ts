import { describe, expect, it, vi } from "vitest";
import { startTransition, useEffect, useState } from "@koact/react";
import { createRoot } from "../index";
import { DefaultLane, NoLane, TransitionLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import {
  flushWork,
  h,
  mockIdleCallbacks,
  setupRuntimeTests,
} from "./testUtils";

setupRuntimeTests();

describe("scheduler concurrency", () => {
  it("commits a later sync root before an earlier transition root", async () => {
    const { pendingCallbacks: idleCallbacks, cancelIdleCallback } =
      mockIdleCallbacks();
    const transitionContainer = document.createElement("div");
    const syncContainer = document.createElement("div");
    const transitionRoot = createRoot(transitionContainer);
    const syncRoot = createRoot(syncContainer);
    const commitOrder: string[] = [];
    let setTransitionCount!: (value: number) => void;

    function TransitionCounter() {
      const [count, setCount] = useState(0);
      setTransitionCount = setCount;
      useEffect(() => {
        commitOrder.push(`transition:${count}`);
      }, [count]);
      return h("span", null, count);
    }

    function SyncValue(props: { value: number }) {
      useEffect(() => {
        commitOrder.push(`sync:${props.value}`);
      }, [props.value]);
      return h("span", null, props.value);
    }

    transitionRoot.render(h(TransitionCounter, null));
    syncRoot.render(h(SyncValue, { value: 0 }));
    await vi.advanceTimersByTimeAsync(0);
    commitOrder.length = 0;

    startTransition(() => setTransitionCount(1));
    await vi.advanceTimersByTimeAsync(0);
    let deadlineChecks = 0;
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => (deadlineChecks++ === 0 ? 100 : 0),
    });

    expect(commitOrder).toEqual([]);
    expect(transitionContainer.textContent).toBe("0");

    syncRoot.render(h(SyncValue, { value: 1 }));
    await vi.advanceTimersByTimeAsync(0);

    expect(commitOrder).toEqual(["sync:1"]);
    expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });
    expect(commitOrder).toEqual(["sync:1"]);

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(commitOrder).toEqual(["sync:1", "transition:1"]);
    expect(syncContainer.textContent).toBe("1");
    expect(transitionContainer.textContent).toBe("1");
  });

  it("round-robins roots with equal lanes after yielding", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    const firstInternalRoot = getOrCreateRoot(firstContainer);
    const secondInternalRoot = getOrCreateRoot(secondContainer);
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);
    const commitOrder: string[] = [];
    let setFirst!: (value: number) => void;
    let setSecond!: (value: number) => void;

    function Counter(props: { name: string }) {
      const [count, setCount] = useState(0);
      if (props.name === "first") setFirst = setCount;
      else setSecond = setCount;
      useEffect(() => {
        commitOrder.push(props.name);
      }, [count]);
      return h("span", null, count);
    }

    firstRoot.render(h(Counter, { name: "first" }));
    secondRoot.render(h(Counter, { name: "second" }));
    await vi.advanceTimersByTimeAsync(0);
    commitOrder.length = 0;

    setFirst(1);
    setSecond(1);
    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });

    expect(firstInternalRoot.workInProgress).not.toBeNull();
    expect(secondInternalRoot.workInProgress).not.toBeNull();
    expect(commitOrder).toEqual([]);

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(commitOrder).toEqual(["first", "second"]);
    expect(firstContainer.textContent).toBe("1");
    expect(secondContainer.textContent).toBe("1");
  });

  it("restarts a yielded render when a same-lane update arrives", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const renderedStates: number[] = [];
    let setCount!: (update: (count: number) => number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      renderedStates.push(count);
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe("0");

    setCount((count) => count + 1);
    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });
    expect(renderedStates).toEqual([0, 1]);

    setCount((count) => count + 1);
    await vi.advanceTimersByTimeAsync(0);
    let deadlineChecks = 0;
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => (deadlineChecks++ === 0 ? 100 : 0),
    });

    expect(internalRoot.workInProgress).not.toBeNull();
    expect(internalRoot.renderLanes).toBe(DefaultLane);
    expect(internalRoot.interleavedUpdatedLanes).toBe(NoLane);
    expect(renderedStates).toEqual([0, 1, 2]);

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("2");
    expect(renderedStates).toEqual([0, 1, 2]);
  });

  it("preempts a transition render when a default update arrives", async () => {
    const { pendingCallbacks: idleCallbacks, cancelIdleCallback } =
      mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const renderedStates: number[] = [];
    const committedStates: number[] = [];
    let setCount!: (update: (count: number) => number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      renderedStates.push(count);
      useEffect(() => {
        committedStates.push(count);
      }, [count]);
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await vi.advanceTimersByTimeAsync(0);

    startTransition(() => setCount((count) => count + 10));
    await vi.advanceTimersByTimeAsync(0);
    let deadlineChecks = 0;
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => (deadlineChecks++ === 0 ? 100 : 0),
    });

    expect(container.textContent).toBe("0");
    expect(renderedStates).toEqual([0, 10]);
    expect(committedStates).toEqual([0]);
    expect(internalRoot.renderLanes).toBe(TransitionLane);
    expect(internalRoot.workInProgress).not.toBeNull();

    setCount((count) => count + 1);
    expect(internalRoot.interleavedUpdatedLanes).toBe(DefaultLane);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelIdleCallback).toHaveBeenCalledTimes(1);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });
    expect(container.textContent).toBe("0");

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("1");
    expect(renderedStates).toEqual([0, 10, 1]);
    expect(committedStates).toEqual([0, 1]);
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
    expect(internalRoot.pendingLanes).toBe(TransitionLane);
    expect(internalRoot.current!.childLanes).toBe(TransitionLane);
    expect(internalRoot.current!.child!.lanes).toBe(TransitionLane);

    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("11");
    expect(renderedStates).toEqual([0, 10, 1, 11]);
    expect(committedStates).toEqual([0, 1, 11]);
    expect(internalRoot.finishedLanes).toBe(TransitionLane);
    expect(internalRoot.pendingLanes).toBe(NoLane);
  });

  it("continues a default render when a transition update arrives", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const renderedStates: number[] = [];
    const committedStates: number[] = [];
    let setCount!: (update: (count: number) => number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      renderedStates.push(count);
      useEffect(() => {
        committedStates.push(count);
      }, [count]);
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await vi.advanceTimersByTimeAsync(0);

    setCount((count) => count + 1);
    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });

    expect(container.textContent).toBe("0");
    expect(renderedStates).toEqual([0]);
    expect(internalRoot.renderLanes).toBe(DefaultLane);

    startTransition(() => setCount((count) => count + 10));
    expect(internalRoot.interleavedUpdatedLanes).toBe(TransitionLane);
    expect(internalRoot.nextUnitOfWork!.lanes).toBe(
      DefaultLane | TransitionLane,
    );
    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 0,
    });

    expect(container.textContent).toBe("0");
    expect(renderedStates).toEqual([0, 1]);

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("1");
    expect(renderedStates).toEqual([0, 1]);
    expect(committedStates).toEqual([0, 1]);
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
    expect(internalRoot.pendingLanes).toBe(TransitionLane);
    expect(internalRoot.current!.childLanes).toBe(TransitionLane);
    expect(internalRoot.current!.child!.lanes).toBe(TransitionLane);

    await vi.advanceTimersByTimeAsync(0);
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });

    expect(container.textContent).toBe("11");
    expect(renderedStates).toEqual([0, 1, 11]);
    expect(committedStates).toEqual([0, 1, 11]);
    expect(internalRoot.pendingLanes).toBe(NoLane);
  });

  it("falls back when requestIdleCallback is unavailable", async () => {
    Reflect.deleteProperty(globalThis, "requestIdleCallback");
    Reflect.deleteProperty(globalThis, "cancelIdleCallback");

    const container = document.createElement("div");
    const root = createRoot(container);
    let setCount!: (value: number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, `fallback:${count}`);
    }

    root.render(h(Counter, null));
    await flushWork();
    setCount(1);
    await flushWork();
    expect(container.textContent).toBe("fallback:1");
  });
});
