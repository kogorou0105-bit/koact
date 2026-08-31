import { describe, expect, it, vi } from "vitest";
import { useEffect, useRef, useState } from "@koact/react";
import { createRoot } from "../index";
import { DefaultLane, NoLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("reconciliation lifecycle", () => {
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
      Array.from(
        container.querySelectorAll("span"),
        (node) => node.textContent,
      ),
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
});
