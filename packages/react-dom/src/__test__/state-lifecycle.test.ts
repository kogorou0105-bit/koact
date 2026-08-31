import { describe, expect, it, vi } from "vitest";
import { useMemo, useState } from "@koact/react";
import ReactDOM, { createRoot } from "../index";
import { NoLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("state lifecycle", () => {
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
});
