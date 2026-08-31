import { describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "@koact/react";
import { createRoot } from "../index";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("batching integration", () => {
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
});
