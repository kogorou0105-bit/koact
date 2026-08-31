import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { useEffect, useState } from "@koact/react";
import { createRoot } from "../index";
import { KoactEvents } from "../events";
import { NoLane, SyncLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("commit failure recovery", () => {
  let reportError = vi.fn<(error: unknown) => void>();

  beforeEach(() => {
    reportError = vi.fn<(error: unknown) => void>();
    globalThis.reportError = reportError;
  });

  it("keeps the committed tree and lane pending after a host update fails", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const effect = vi.fn();

    function App(props: { value: string }) {
      useEffect(() => {
        effect(props.value);
      }, [props.value]);
      return h(
        "div",
        {
          "data-first": props.value,
          "data-second": props.value,
        },
        props.value,
      );
    }

    root.render(h(App, { value: "before" }));
    await flushWork();
    effect.mockClear();

    const committedRoot = internalRoot.current;
    const node = container.firstElementChild as HTMLDivElement;
    const originalSetAttribute = node.setAttribute.bind(node);
    const setAttribute = vi
      .spyOn(node, "setAttribute")
      .mockImplementation((name, value) => {
        if (name === "data-second") throw new Error("attribute failed");
        originalSetAttribute(name, value);
      });
    const commits: unknown[] = [];
    const unsubscribe = KoactEvents.on("commit", (event) => {
      if (event.rootId === internalRoot.id) commits.push(event);
    });

    root.render(h(App, { value: "after" }));
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect((reportError.mock.calls[0][0] as Error).message).toBe(
      "attribute failed",
    );
    expect(node.dataset.first).toBe("after");
    expect(node.dataset.second).toBe("before");
    expect(internalRoot.current).toBe(committedRoot);
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    expect(internalRoot.renderLanes).toBe(NoLane);
    expect(internalRoot.finishedLanes).toBe(NoLane);
    expect(effect).not.toHaveBeenCalled();
    expect(commits).toHaveLength(0);

    setAttribute.mockRestore();
    root.render(h(App, { value: "after" }));
    await flushWork();

    expect(internalRoot.current).not.toBe(committedRoot);
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(node.dataset.first).toBe("after");
    expect(node.dataset.second).toBe("after");
    expect(node.textContent).toBe("after");
    expect(effect).toHaveBeenCalledWith("after");
    expect(commits).toHaveLength(1);
    unsubscribe();
  });

  it("does not publish a placement that throws", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const tree = (includeSecond: boolean) =>
      h(
        "div",
        null,
        h("span", { key: "first" }, "first"),
        includeSecond ? h("strong", { key: "second" }, "second") : null,
      );

    root.render(tree(false));
    await flushWork();

    const committedRoot = internalRoot.current;
    const parent = container.firstElementChild as HTMLDivElement;
    const insertBefore = vi
      .spyOn(parent, "insertBefore")
      .mockImplementationOnce(() => {
        throw new Error("placement failed");
      });

    root.render(tree(true));
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(internalRoot.current).toBe(committedRoot);
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    expect(parent.children).toHaveLength(1);

    insertBefore.mockRestore();
    root.render(tree(true));
    await flushWork();

    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(Array.from(parent.children, (child) => child.textContent)).toEqual([
      "first",
      "second",
    ]);
  });

  it("keeps deleted queues and lifecycle callbacks intact until retry", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const ref = { current: null as HTMLSpanElement | null };
    const cleanup = vi.fn();

    function Removed() {
      const [count] = useState(0);
      useEffect(() => cleanup, []);
      return h("span", { ref }, count);
    }

    function App(props: { visible: boolean }) {
      return h(
        "div",
        null,
        props.visible
          ? h(Removed, { key: "removed" })
          : h("strong", { key: "replacement" }, "replacement"),
      );
    }

    root.render(h(App, { visible: true }));
    await flushWork();

    const committedRoot = internalRoot.current;
    const removedFiber = committedRoot!.child!.child!.child!;
    const queue = removedFiber.memoizedState!.queue!;
    const committedQueueOwner = queue.fiber;
    const parent = container.firstElementChild as HTMLDivElement;
    const removedNode = ref.current;
    const removeChild = vi
      .spyOn(parent, "removeChild")
      .mockImplementationOnce(() => {
        throw new Error("deletion failed");
      });

    root.render(h(App, { visible: false }));
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(internalRoot.current).toBe(committedRoot);
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    expect(queue.mounted).toBe(true);
    expect(queue.root).toBe(internalRoot);
    expect(queue.fiber).toBe(committedQueueOwner);
    expect(ref.current).toBe(removedNode);
    expect(cleanup).not.toHaveBeenCalled();
    expect(parent.textContent).toBe("0");

    removeChild.mockRestore();
    root.render(h(App, { visible: false }));
    await flushWork();

    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(queue.mounted).toBe(false);
    expect(queue.root).toBeNull();
    expect(queue.fiber).toBeNull();
    expect(ref.current).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(parent.textContent).toBe("replacement");
  });

  it("allows an unmount to be retried after its mutation fails", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
    const ref = { current: null as HTMLSpanElement | null };
    const cleanup = vi.fn();

    function App() {
      useEffect(() => cleanup, []);
      return h("span", { ref }, "mounted");
    }

    root.render(h(App, null));
    await flushWork();

    const committedRoot = internalRoot.current;
    const removeChild = vi
      .spyOn(container, "removeChild")
      .mockImplementationOnce(() => {
        throw new Error("unmount failed");
      });

    root.unmount();
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(internalRoot.status).toBe("unmounting");
    expect(internalRoot.current).toBe(committedRoot);
    expect(internalRoot.pendingLanes).toBe(SyncLane);
    expect(container.textContent).toBe("mounted");
    expect(ref.current).toBe(container.firstElementChild);
    expect(cleanup).not.toHaveBeenCalled();

    removeChild.mockRestore();
    root.unmount();
    await flushWork();

    expect(internalRoot.status).toBe("unmounted");
    expect(internalRoot.current).toBeNull();
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(container.textContent).toBe("");
    expect(ref.current).toBeNull();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
