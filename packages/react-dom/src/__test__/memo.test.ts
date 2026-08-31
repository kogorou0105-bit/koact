import { describe, expect, it, vi } from "vitest";
import {
  memo,
  startTransition,
  useEffect,
  useState,
  type ReactNode,
} from "@koact/react";
import { createRoot } from "../index";
import { KoactEvents } from "../events";
import { NoLane, SyncLane, TransitionLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import {
  flushWork,
  h,
  mockIdleCallbacks,
  setupRuntimeTests,
} from "./testUtils";

setupRuntimeTests();

describe("memo and Fiber bailouts", () => {
  it("uses Object.is semantics for the default shallow comparison", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const renderedValues: number[] = [];
    const Value = memo((props: { value: number }) => {
      renderedValues.push(props.value);
      return h("span", null, Object.is(props.value, -0) ? "-0" : props.value);
    });

    root.render(h(Value, { value: Number.NaN }));
    await flushWork();
    root.render(h(Value, { value: Number.NaN }));
    await flushWork();
    root.render(h(Value, { value: 0 }));
    await flushWork();
    root.render(h(Value, { value: -0 }));
    await flushWork();

    expect(renderedValues).toHaveLength(3);
    expect(Number.isNaN(renderedValues[0])).toBe(true);
    expect(Object.is(renderedValues[1], 0)).toBe(true);
    expect(Object.is(renderedValues[2], -0)).toBe(true);
    expect(container.textContent).toBe("-0");
  });

  it("compares object props and children without comparing key or ref", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const firstRef = () => {};
    const secondRef = () => {};
    const stableConfig = {};
    const changedConfig = {};
    let renders = 0;
    let receivedProps: Record<string, unknown> = {};
    const View = memo(
      (props: { config: object; children?: ReactNode }) => {
        renders++;
        receivedProps = props;
        return h("span", null, props.children);
      },
    );

    root.render(
      h(View, { key: "stable", ref: firstRef, config: stableConfig }, "same"),
    );
    await flushWork();
    expect(receivedProps).not.toHaveProperty("key");
    expect(receivedProps).not.toHaveProperty("ref");

    root.render(
      h(View, { key: "stable", ref: firstRef, config: stableConfig }, "same"),
    );
    await flushWork();
    expect(renders).toBe(1);

    root.render(
      h(View, { key: "stable", ref: firstRef, config: changedConfig }, "same"),
    );
    await flushWork();
    root.render(
      h(View, { key: "stable", ref: firstRef, config: changedConfig }, "changed"),
    );
    await flushWork();
    root.render(
      h(View, { key: "stable", ref: secondRef, config: changedConfig }, "changed"),
    );
    await flushWork();

    expect(renders).toBe(4);
    expect(container.textContent).toBe("changed");
  });

  it("supports a custom comparator", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const compare = vi.fn(
      (previous: { id: number; label: string }, next: { id: number; label: string }) =>
        previous.id === next.id,
    );
    const View = memo(
      (props: { id: number; label: string }) => h("span", null, props.label),
      compare,
    );

    root.render(h(View, { id: 1, label: "first" }));
    await flushWork();
    root.render(h(View, { id: 1, label: "ignored" }));
    await flushWork();
    expect(container.textContent).toBe("first");

    root.render(h(View, { id: 2, label: "second" }));
    await flushWork();
    expect(container.textContent).toBe("second");
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it("compares against props from the last component execution", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const comparedValues: Array<[number, number]> = [];
    let renders = 0;
    const Value = memo(
      (props: { value: number }) => {
        renders++;
        return h("span", null, props.value);
      },
      (previous, next) => {
        comparedValues.push([previous.value, next.value]);
        return next.value - previous.value === 1;
      },
    );

    root.render(h(Value, { value: 0 }));
    await flushWork();
    root.render(h(Value, { value: 1 }));
    await flushWork();
    root.render(h(Value, { value: 2 }));
    await flushWork();

    expect(comparedValues).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(renders).toBe(2);
    expect(container.textContent).toBe("2");
  });

  it("does not hide a memo component's own state updates", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    let renders = 0;
    let setCount!: (value: number) => void;
    const Counter = memo(
      () => {
        renders++;
        const [count, updateCount] = useState(0);
        setCount = updateCount;
        return h("span", null, count);
      },
      () => true,
    );

    root.render(h(Counter, null));
    await flushWork();
    setCount(1);
    await flushWork();

    expect(container.textContent).toBe("1");
    expect(renders).toBe(2);
  });

  it("skips a memo parent while rendering and rebinding an updated child", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let parentRenders = 0;
    let childRenders = 0;
    let siblingRenders = 0;
    let setCount!: (value: number) => void;

    function Child() {
      childRenders++;
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    function StableSibling() {
      siblingRenders++;
      return h("span", null, "stable");
    }

    const Parent = memo(() => {
      parentRenders++;
      return [
        h(Child, { key: "child" }),
        h(StableSibling, { key: "stable" }),
      ];
    });

    root.render(h(Parent, null));
    await flushWork();
    const firstParent = internalRoot.current!.child!;
    const firstChild = firstParent.child!;
    const queue = firstChild.memoizedState!.queue!;

    root.render(h(Parent, null));
    await flushWork();
    const clonedParent = internalRoot.current!.child!;
    const clonedChild = clonedParent.child!;

    expect(parentRenders).toBe(1);
    expect(childRenders).toBe(1);
    expect(siblingRenders).toBe(1);
    expect(clonedParent).not.toBe(firstParent);
    expect(clonedChild).not.toBe(firstChild);
    expect(clonedChild.parent).toBe(clonedParent);
    expect(queue.fiber).toBe(clonedChild);

    setCount(1);
    await flushWork();
    expect(container.textContent).toBe("1stable");
    expect(parentRenders).toBe(1);
    expect(childRenders).toBe(2);
    expect(siblingRenders).toBe(1);
  });

  it("reduces component execution and Begin Work for 5,000 stable rows", async () => {
    const plainContainer = document.createElement("div");
    const memoContainer = document.createElement("div");
    const plainInternalRoot = getOrCreateRoot(plainContainer);
    const memoInternalRoot = getOrCreateRoot(memoContainer);
    const plainRoot = createRoot(plainContainer);
    const memoRoot = createRoot(memoContainer);
    const processedFibers = new Map<number, number[]>();
    const ids = Array.from({ length: 5000 }, (_, id) => id);
    let plainRenders = 0;
    let memoRenders = 0;
    const unsubscribe = KoactEvents.on("commit", (event) => {
      const values = processedFibers.get(event.rootId) || [];
      values.push(event.processedFibers);
      processedFibers.set(event.rootId, values);
    });
    const PlainLeaf = (props: { id: number }) => {
      plainRenders++;
      return h("span", null, props.id);
    };
    const MemoLeaf = memo((props: { id: number }) => {
      memoRenders++;
      return h("span", null, props.id);
    });

    function PlainForest() {
      return h(
        "section",
        null,
        ids.map((id) => h(PlainLeaf, { key: id, id })),
      );
    }

    function MemoForest() {
      return h(
        "section",
        null,
        ids.map((id) => h(MemoLeaf, { key: id, id })),
      );
    }

    try {
      plainRoot.render(h(PlainForest, null));
      await flushWork();
      plainRoot.render(h(PlainForest, null));
      await flushWork();
      memoRoot.render(h(MemoForest, null));
      await flushWork();
      memoRoot.render(h(MemoForest, null));
      await flushWork();

      const plainPasses = processedFibers.get(plainInternalRoot.id);
      const memoPasses = processedFibers.get(memoInternalRoot.id);
      expect(plainRenders).toBe(10_000);
      expect(memoRenders).toBe(5_000);
      expect(plainPasses).toEqual([15_003, 15_003]);
      expect(memoPasses).toEqual([15_003, 5_003]);
      expect(memoContainer.querySelectorAll("span")).toHaveLength(5_000);
    } finally {
      unsubscribe();
    }
  }, 15_000);

  it("preserves state and DOM identity when keyed memo components move", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const renders = new Map<string, number>();
    let setFirst!: (value: number) => void;

    const Item = memo((props: { id: string }) => {
      renders.set(props.id, (renders.get(props.id) || 0) + 1);
      const [count, setCount] = useState(0);
      if (props.id === "a") setFirst = setCount;
      return h("span", { "data-id": props.id }, `${props.id}:${count}`);
    });
    const list = (ids: string[]) =>
      h(
        "div",
        null,
        ids.map((id) => h(Item, { key: id, id })),
      );

    root.render(list(["a", "b"]));
    await flushWork();
    const firstNode = container.querySelector('[data-id="a"]');
    setFirst(1);
    await flushWork();
    const rendersBeforeMove = new Map(renders);

    root.render(list(["b", "a"]));
    await flushWork();

    expect(container.textContent).toBe("b:0a:1");
    expect(container.querySelector('[data-id="a"]')).toBe(firstNode);
    expect(renders).toEqual(rendersBeforeMove);
  });

  it("does not publish pending props before an interrupted render commits", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let setValue!: (value: number) => void;
    const Value = memo((props: { value: number }) =>
      h("span", null, props.value),
    );

    function App() {
      const [value, updateValue] = useState(0);
      setValue = updateValue;
      return h(Value, { value });
    }

    root.render(h(App, null));
    await vi.advanceTimersByTimeAsync(0);
    setValue(1);
    await vi.advanceTimersByTimeAsync(0);

    let deadlineChecks = 0;
    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => (deadlineChecks++ < 2 ? 100 : 0),
    });

    const currentMemo = internalRoot.current!.child!.child!;
    const pendingMemo = internalRoot.workInProgress!.child!.child!;
    expect(currentMemo.memoizedProps?.value).toBe(0);
    expect(pendingMemo.pendingProps.value).toBe(1);
    expect(pendingMemo.memoizedProps?.value).toBe(0);
    expect(container.textContent).toBe("0");

    idleCallbacks.shift()!({
      didTimeout: false,
      timeRemaining: () => 100,
    });
    expect(container.textContent).toBe("1");
    expect(internalRoot.current!.child!.child!.memoizedProps?.value).toBe(1);
  });

  it("preserves a deferred child lane through a higher-priority bailout", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    let parentRenders = 0;
    let childRenders = 0;
    let setCount!: (value: number) => void;

    function Child() {
      childRenders++;
      const [count, updateCount] = useState(0);
      setCount = updateCount;
      return h("span", null, count);
    }

    const Parent = memo(() => {
      parentRenders++;
      return h(Child, null);
    });

    root.render(h(Parent, null));
    await vi.advanceTimersByTimeAsync(0);
    startTransition(() => setCount(10));
    await vi.advanceTimersByTimeAsync(0);

    root.render(h(Parent, null));
    await vi.advanceTimersByTimeAsync(0);

    expect(container.textContent).toBe("0");
    expect(parentRenders).toBe(1);
    expect(childRenders).toBe(1);
    expect(internalRoot.finishedLanes).toBe(SyncLane);
    expect(internalRoot.pendingLanes).toBe(TransitionLane);
    expect(internalRoot.current!.child!.childLanes).toBe(TransitionLane);

    while (idleCallbacks.length > 0) {
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });
    }

    expect(container.textContent).toBe("10");
    expect(parentRenders).toBe(1);
    expect(childRenders).toBe(2);
    expect(internalRoot.pendingLanes).toBe(NoLane);
  });

  it("does not repeat refs or effects for a bailed-out subtree", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const ref = vi.fn();
    const cleanup = vi.fn();
    let renders = 0;
    const Stable = memo(() => {
      renders++;
      useEffect(() => cleanup, []);
      return h("div", { ref }, "stable");
    });

    root.render(h(Stable, null));
    await flushWork();
    root.render(h(Stable, null));
    await flushWork();

    expect(renders).toBe(1);
    expect(ref).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();

    root.unmount();
    await flushWork();
    expect(ref).toHaveBeenCalledTimes(2);
    expect(ref).toHaveBeenLastCalledWith(null);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("aborts a throwing comparator without publishing its props", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const reportError = vi.fn();
    let shouldThrow = true;
    globalThis.reportError = reportError;
    const Value = memo(
      (props: { value: number }) => h("span", null, props.value),
      () => {
        if (shouldThrow) throw new Error("compare failed");
        return false;
      },
    );

    root.render(h(Value, { value: 0 }));
    await flushWork();
    root.render(h(Value, { value: 1 }));
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("0");
    expect(internalRoot.current!.child!.memoizedProps?.value).toBe(0);

    shouldThrow = false;
    root.render(h(Value, { value: 1 }));
    await flushWork();
    expect(container.textContent).toBe("1");
    expect(internalRoot.current!.child!.memoizedProps?.value).toBe(1);
  });
});
