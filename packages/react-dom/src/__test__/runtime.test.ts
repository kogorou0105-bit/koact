import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import React, {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "@koact/react";
import ReactDOM, { createRoot } from "../index";
import {
  DefaultLane,
  NoLane,
  SyncLane,
  TransitionLane,
} from "../lanes";
import { __resetSchedulerForTests, getOrCreateRoot } from "../scheduler";

const h = React.createElement;

async function flushWork() {
  await vi.runAllTimersAsync();
}

describe("Koact runtime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetSchedulerForTests();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    __resetSchedulerForTests();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps roots and their state updates isolated", async () => {
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    let updateFirst!: (value: number | ((previous: number) => number)) => void;
    let updateSecond!: (value: number | ((previous: number) => number)) => void;

    function Counter(props: { name: string }) {
      const [count, setCount] = useState(0);
      if (props.name === "first") updateFirst = setCount;
      else updateSecond = setCount;
      return h("span", null, `${props.name}:${count}`);
    }

    ReactDOM.render(h(Counter, { name: "first" }), firstContainer);
    ReactDOM.render(h(Counter, { name: "second" }), secondContainer);
    await flushWork();

    updateFirst((count) => count + 1);
    await flushWork();
    expect(firstContainer.textContent).toBe("first:1");
    expect(secondContainer.textContent).toBe("second:0");

    updateSecond(4);
    await flushWork();
    expect(firstContainer.textContent).toBe("first:1");
    expect(secondContainer.textContent).toBe("second:4");
  });

  it("keeps the first state setter valid across later renders", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let firstSetter:
      | ((value: number | ((previous: number) => number)) => void)
      | undefined;

    function Counter() {
      const [count, setCount] = useState(0);
      firstSetter ||= setCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();
    firstSetter!((count) => count + 1);
    await flushWork();
    firstSetter!((count) => count + 1);
    await flushWork();

    expect(container.textContent).toBe("2");
  });

  it("rebinds a state queue to the latest committed fiber", async () => {
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
    const firstFiber = internalRoot.current!.child!;
    const queue = firstFiber.memoizedState!.queue!;
    expect(queue.fiber).toBe(firstFiber);

    setCount(1);
    expect(queue.fiber).toBe(firstFiber);
    await flushWork();
    expect(queue.fiber).toBe(internalRoot.current!.child);
    expect(queue.fiber).not.toBe(firstFiber);

    root.unmount();
    await flushWork();
    expect(queue.fiber).toBeNull();
    expect(queue.root).toBeNull();
    expect(queue.pending).toBeNull();
  });

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
    expect(internalRoot.pendingLanes).toBe(
      DefaultLane | TransitionLane,
    );

    await flushWork();
    expect(committedStates).toEqual([0, 2, 11]);
    expect(container.textContent).toBe("11");
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(TransitionLane);
    expect(queue.pending).toBeNull();
    expect(internalRoot.current!.child!.memoizedState!.baseQueue).toBeNull();
  });

  it("keeps transition work pending between priority commits", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

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
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("recomputes child lanes after removing a pending subtree", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      startTransition(() => setCount(1));
      root.render(h("p", null, "replacement"));
      await vi.advanceTimersByTimeAsync(0);
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      expect(container.textContent).toBe("replacement");
      expect(internalRoot.finishedLanes).toBe(SyncLane);
      expect(internalRoot.pendingLanes).toBe(TransitionLane);
      expect(internalRoot.current!.childLanes).toBe(NoLane);

      await vi.advanceTimersByTimeAsync(0);
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      expect(internalRoot.pendingLanes).toBe(NoLane);
      expect(internalRoot.current!.childLanes).toBe(NoLane);
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
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

  it("automatically batches updates from one native event", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const queueMicrotask = vi.spyOn(globalThis, "queueMicrotask");
    let renderCount = 0;
    let commitCount = 0;

    function Counter() {
      renderCount++;
      const [count, setCount] = useState(0);
      useEffect(() => {
        commitCount++;
      });
      return h(
        "button",
        {
          onClick: () => {
            setCount((value) => value + 1);
            setCount((value) => value + 1);
            setCount((value) => value + 1);
          },
        },
        count,
      );
    }

    root.render(h(Counter, null));
    await flushWork();
    queueMicrotask.mockClear();

    container.querySelector("button")!.dispatchEvent(new MouseEvent("click"));

    expect(queueMicrotask).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("0");
    await flushWork();
    expect(container.textContent).toBe("3");
    expect(renderCount).toBe(2);
    expect(commitCount).toBe(2);
  });

  it("batches updates from one promise callback", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setCount!: (update: (count: number) => number) => void;
    let renderCount = 0;
    let commitCount = 0;

    function Counter() {
      renderCount++;
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      useEffect(() => {
        commitCount++;
      });
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();
    await Promise.resolve().then(() => {
      setCount((count) => count + 1);
      setCount((count) => count + 1);
    });
    await flushWork();

    expect(container.textContent).toBe("2");
    expect(renderCount).toBe(2);
    expect(commitCount).toBe(2);
  });

  it("commits a later task after previous work has flushed", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setCount!: (update: (count: number) => number) => void;
    let commitCount = 0;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      useEffect(() => {
        commitCount++;
      });
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();
    setTimeout(() => {
      setCount((count) => count + 1);
      setCount((count) => count + 1);
    }, 0);
    await flushWork();
    expect(container.textContent).toBe("2");
    expect(commitCount).toBe(2);

    setTimeout(() => setCount((count) => count + 1), 0);
    await flushWork();
    expect(container.textContent).toBe("3");
    expect(commitCount).toBe(3);
  });

  it("batches multiple roots without merging their work", async () => {
    const firstContainer = document.createElement("div");
    const secondContainer = document.createElement("div");
    let updateFirst!: (update: (count: number) => number) => void;
    let updateSecond!: (update: (count: number) => number) => void;
    const renders = [0, 0];
    const commits = [0, 0];

    function Counter(props: { index: number }) {
      renders[props.index]++;
      const [count, setCount] = useState(0);
      if (props.index === 0) updateFirst = setCount;
      else updateSecond = setCount;
      useEffect(() => {
        commits[props.index]++;
      });
      return h("span", null, count);
    }

    createRoot(firstContainer).render(h(Counter, { index: 0 }));
    createRoot(secondContainer).render(h(Counter, { index: 1 }));
    await flushWork();

    updateFirst((count) => count + 1);
    updateFirst((count) => count + 1);
    updateSecond((count) => count + 1);
    updateSecond((count) => count + 1);
    await flushWork();

    expect(firstContainer.textContent).toBe("2");
    expect(secondContainer.textContent).toBe("2");
    expect(renders).toEqual([2, 2]);
    expect(commits).toEqual([2, 2]);
  });

  it("commits a later sync root before an earlier transition root", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      expect(commitOrder).toEqual(["sync:1", "transition:1"]);
      expect(syncContainer.textContent).toBe("1");
      expect(transitionContainer.textContent).toBe("1");
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("round-robins roots with equal lanes after yielding", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });
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
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("restarts a yielded render when a same-lane update arrives", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });
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
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("preempts a transition render when a default update arrives", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

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
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("continues a default render when a transition update arrives", async () => {
    const previousRequestIdleCallback = globalThis.requestIdleCallback;
    const previousCancelIdleCallback = globalThis.cancelIdleCallback;
    const idleCallbacks: IdleRequestCallback[] = [];
    let callbackId = 0;

    globalThis.requestIdleCallback = vi.fn((callback) => {
      idleCallbacks.push(callback);
      return ++callbackId;
    });
    globalThis.cancelIdleCallback = vi.fn();

    try {
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
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

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
    } finally {
      __resetSchedulerForTests();
      if (previousRequestIdleCallback) {
        globalThis.requestIdleCallback = previousRequestIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "requestIdleCallback");
      }
      if (previousCancelIdleCallback) {
        globalThis.cancelIdleCallback = previousCancelIdleCallback;
      } else {
        Reflect.deleteProperty(globalThis, "cancelIdleCallback");
      }
    }
  });

  it("replays consumed state queues after a render error", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const previousReportError = globalThis.reportError;
    const reportError = vi.fn();
    const updateFirst = vi.fn((value: number) => value + 1);
    const updateSecond = vi.fn((value: number) => value + 2);
    let shouldThrow = false;
    let setFirst!: (update: (value: number) => number) => void;
    let setSecond!: (update: (value: number) => number) => void;
    globalThis.reportError = reportError;

    function Counters() {
      const [first, updateFirstState] = useState(0);
      const [second, updateSecondState] = useState(0);
      setFirst = updateFirstState;
      setSecond = updateSecondState;
      return h("span", null, `${first}:${second}`);
    }

    function Bomb() {
      if (shouldThrow) throw new Error("render failed");
      return null;
    }

    function App() {
      return [h(Counters, null), h(Bomb, null)];
    }

    try {
      root.render(h(App, null));
      await flushWork();
      expect(container.textContent).toBe("0:0");

      shouldThrow = true;
      setFirst(updateFirst);
      setSecond(updateSecond);
      await flushWork();

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe("0:0");

      shouldThrow = false;
      root.render(h(App, null));
      await flushWork();

      expect(container.textContent).toBe("1:2");
      expect(updateFirst).toHaveBeenCalledTimes(2);
      expect(updateSecond).toHaveBeenCalledTimes(2);
    } finally {
      if (previousReportError) globalThis.reportError = previousReportError;
      else Reflect.deleteProperty(globalThis, "reportError");
    }
  });

  it("discards queued state updates when the root unmounts", async () => {
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

    setCount(1);
    root.unmount();
    await flushWork();

    expect(container.textContent).toBe("");
    expect(internalRoot.status).toBe("unmounted");
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.interleavedUpdatedLanes).toBe(NoLane);
    setCount(2);
    await flushWork();
    expect(container.textContent).toBe("");
  });

  it("preserves intentionally undefined state and memo values", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const factory = vi.fn(() => undefined);
    let setValue!: (value: string | undefined) => void;

    function Values() {
      const [value, updateValue] = useState<string | undefined>("initial");
      setValue = updateValue;
      useMemo(factory, []);
      return h("span", null, value ?? "missing");
    }

    root.render(h(Values, null));
    await flushWork();
    setValue(undefined);
    await flushWork();

    expect(container.textContent).toBe("missing");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("reorders keyed DOM nodes without replacing them", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const list = (keys: string[]) =>
      h(
        "ul",
        null,
        keys.map((key) => h("li", { key, "data-key": key }, key)),
      );

    root.render(list(["a", "b", "c"]));
    await flushWork();
    const originalNodes = new Map(
      Array.from(container.querySelectorAll("li")).map((node) => [
        node.dataset.key,
        node,
      ]),
    );

    root.render(list(["c", "a", "b"]));
    await flushWork();
    const reorderedNodes = Array.from(container.querySelectorAll("li"));

    expect(reorderedNodes.map((node) => node.dataset.key)).toEqual([
      "c",
      "a",
      "b",
    ]);
    reorderedNodes.forEach((node) => {
      expect(node).toBe(originalNodes.get(node.dataset.key));
    });
  });

  it("reorders keyed components that return multiple host nodes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function Pair(props: { id: string }) {
      return [
        h("span", { "data-id": `${props.id}-1` }, `${props.id}1`),
        h("span", { "data-id": `${props.id}-2` }, `${props.id}2`),
      ];
    }

    const pairs = (keys: string[]) =>
      h(
        "div",
        null,
        keys.map((key) => h(Pair, { key, id: key })),
      );

    root.render(pairs(["a", "b"]));
    await flushWork();
    const firstA = container.querySelector('[data-id="a-1"]');

    root.render(pairs(["b", "a"]));
    await flushWork();

    expect(
      Array.from(container.querySelectorAll("span"), (node) => node.textContent),
    ).toEqual(["b1", "b2", "a1", "a2"]);
    expect(container.querySelector('[data-id="a-1"]')).toBe(firstA);
  });

  it("normalizes component arrays, text and empty output", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function Content(props: { visible: boolean }) {
      return props.visible ? ["value:", [0, null, false]] : null;
    }

    root.render(h(Content, { visible: true }));
    await flushWork();
    expect(container.textContent).toBe("value:0");

    root.render(h(Content, { visible: false }));
    await flushWork();
    expect(container.textContent).toBe("");
  });

  it("cleans only the deleted subtree and only once", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();

    function Item(props: { id: string }) {
      useEffect(
        () => () => {
          if (props.id === "a") cleanupA();
          else cleanupB();
        },
        [],
      );
      return h("span", null, props.id);
    }

    const items = (keys: string[]) =>
      h(
        "div",
        null,
        keys.map((key) => h(Item, { key, id: key })),
      );

    root.render(items(["a", "b"]));
    await flushWork();
    root.render(items(["b"]));
    await flushWork();

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).not.toHaveBeenCalled();

    root.unmount();
    await flushWork();
    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it("preserves live updates scheduled by deletion callbacks", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const cleanup = vi.fn();
    let hide!: () => void;

    function Removed(props: { increment: () => void }) {
      useEffect(
        () => () => {
          cleanup();
          props.increment();
        },
        [],
      );
      return h("span", {
        ref: (node: HTMLElement | null) => {
          if (!node) props.increment();
        },
      });
    }

    function App() {
      const [visible, setVisible] = useState(true);
      const [count, setCount] = useState(0);
      hide = () => setVisible(false);
      const increment = () => setCount((value) => value + 1);
      return h(
        "div",
        null,
        h("strong", null, count),
        visible ? h(Removed, { increment }) : null,
      );
    }

    root.render(h(App, null));
    await flushWork();
    hide();
    await flushWork();

    expect(container.querySelector("span")).toBeNull();
    expect(container.querySelector("strong")?.textContent).toBe("2");
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(DefaultLane);
  });

  it("does not reuse an obsolete effect cleanup", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const cleanup = vi.fn();

    function Effect(props: { version: number }) {
      useEffect(() => {
        if (props.version === 1) return cleanup;
      }, [props.version]);
      return h("span", null, props.version);
    }

    root.render(h(Effect, { version: 1 }));
    await flushWork();
    root.render(h(Effect, { version: 2 }));
    await flushWork();
    root.unmount();
    await flushWork();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("finishes an unmount requested from an effect", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const cleanup = vi.fn();

    function App() {
      useEffect(() => {
        root.unmount();
        return cleanup;
      }, []);
      return h("span", null, "temporary");
    }

    root.render(h(App, null));
    await flushWork();

    expect(container.textContent).toBe("");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("detaches all old refs before attaching new refs", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const sharedRef = { current: null as HTMLDivElement | null };

    root.render(
      h(
        "section",
        null,
        h("div", { key: "a", ref: sharedRef, "data-key": "a" }),
        h("div", { key: "b", "data-key": "b" }),
      ),
    );
    await flushWork();

    root.render(
      h(
        "section",
        null,
        h("div", { key: "b", ref: sharedRef, "data-key": "b" }),
        h("div", { key: "a", "data-key": "a" }),
      ),
    );
    await flushWork();

    expect(sharedRef.current?.dataset.key).toBe("b");
  });

  it("clears object refs when a root unmounts", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const ref = { current: null as HTMLInputElement | null };

    root.render(h("input", { ref }));
    await flushWork();
    expect(ref.current).toBe(container.firstElementChild);

    root.unmount();
    await flushWork();
    expect(ref.current).toBeNull();
  });

  it("ignores stale setters after unmount", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let setCount!: (value: number) => void;

    function Counter() {
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    root.render(h(Counter, null));
    await flushWork();
    root.unmount();
    await flushWork();

    setCount(2);
    await flushWork();
    expect(container.textContent).toBe("");
    expect(() => root.render(h(Counter, null))).toThrow("unmounted");
  });

  it("detaches refs and removes stale styles and attributes", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    function Box(props: { compact: boolean }) {
      const ref = useRef<HTMLDivElement | null>(null);
      return h(
        "div",
        {
          ref,
          "data-active": props.compact ? null : "yes",
          style: props.compact
            ? { color: "blue" }
            : { color: "red", backgroundColor: "black" },
        },
        ref.current ? "updated" : "mounted",
      );
    }

    root.render(h(Box, { compact: false }));
    await flushWork();
    const node = container.firstElementChild as HTMLDivElement;
    expect(node.style.backgroundColor).toBe("black");
    expect(node.dataset.active).toBe("yes");

    root.render(h(Box, { compact: true }));
    await flushWork();
    expect(container.firstElementChild).toBe(node);
    expect(node.style.color).toBe("blue");
    expect(node.style.backgroundColor).toBe("");
    expect(node.hasAttribute("data-active")).toBe(false);
  });

  it("keeps hooks invalid outside component rendering", () => {
    expect(() => useState(0)).toThrow("Invalid hook call");
  });

  it("falls back when requestIdleCallback is unavailable", async () => {
    const requestIdleCallback = globalThis.requestIdleCallback;
    const cancelIdleCallback = globalThis.cancelIdleCallback;
    Reflect.deleteProperty(globalThis, "requestIdleCallback");
    Reflect.deleteProperty(globalThis, "cancelIdleCallback");

    try {
      const container = document.createElement("div");
      ReactDOM.render(h("span", null, "fallback"), container);
      await flushWork();
      expect(container.textContent).toBe("fallback");
    } finally {
      globalThis.requestIdleCallback = requestIdleCallback;
      globalThis.cancelIdleCallback = cancelIdleCallback;
    }
  });

  it("isolates a failed root from other scheduled roots", async () => {
    const brokenContainer = document.createElement("div");
    const healthyContainer = document.createElement("div");
    const previousReportError = globalThis.reportError;
    const reportError = vi.fn();
    globalThis.reportError = reportError;

    try {
      ReactDOM.render({ invalid: true } as never, brokenContainer);
      ReactDOM.render(h("span", null, "healthy"), healthyContainer);
      await flushWork();

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(brokenContainer.textContent).toBe("");
      expect(healthyContainer.textContent).toBe("healthy");
    } finally {
      if (previousReportError) globalThis.reportError = previousReportError;
      else Reflect.deleteProperty(globalThis, "reportError");
    }
  });
});
