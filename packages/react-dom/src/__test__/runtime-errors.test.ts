import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "@koact/react";
import ReactDOM, { createRoot } from "../index";
import { DefaultLane, NoLane } from "../lanes";
import { getOrCreateRoot } from "../scheduler";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("runtime errors", () => {
  it("preserves failed updates for an explicit retry after a render error", async () => {
    const container = document.createElement("div");
    const internalRoot = getOrCreateRoot(container);
    const root = createRoot(container);
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

    root.render(h(App, null));
    await flushWork();
    expect(container.textContent).toBe("0:0");

    shouldThrow = true;
    setFirst(updateFirst);
    setSecond(updateSecond);
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("0:0");
    expect(internalRoot.pendingLanes).toBe(DefaultLane);
    expect(internalRoot.callbackPriority).toBe(NoLane);

    shouldThrow = false;
    root.render(h(App, null));
    await flushWork();

    expect(container.textContent).toBe("1:2");
    expect(internalRoot.pendingLanes).toBe(NoLane);
    expect(updateFirst).toHaveBeenCalledTimes(2);
    expect(updateSecond).toHaveBeenCalledTimes(2);
  });

  it("keeps hooks invalid outside component rendering", () => {
    expect(() => useState(0)).toThrow("Invalid hook call");
  });

  it.each([
    [
      "fewer hooks",
      "count" as const,
      true,
      false,
      "Rendered fewer hooks than during the previous render.",
    ],
    [
      "more hooks",
      "count" as const,
      false,
      true,
      "Rendered more hooks than during the previous render.",
    ],
    [
      "a different hook type",
      "type" as const,
      true,
      false,
      "Hook order changed: expected STATE, received REF.",
    ],
  ])(
    "rejects %s between renders",
    async (_name, mode, initialVariant, nextVariant, message) => {
      const container = document.createElement("div");
      const root = createRoot(container);
      const reportError = vi.fn();
      globalThis.reportError = reportError;

      function ChangingHooks(props: { label: string; variant: boolean }) {
        if (mode === "type") {
          if (props.variant) useState(0);
          else useRef(0);
        } else {
          useState(0);
          if (props.variant) useRef(0);
        }
        return h("span", null, props.label);
      }

      root.render(
        h(ChangingHooks, { label: "committed", variant: initialVariant }),
      );
      await flushWork();

      root.render(
        h(ChangingHooks, { label: "rejected", variant: nextVariant }),
      );
      await flushWork();

      expect(container.textContent).toBe("committed");
      expect(reportError).toHaveBeenCalledTimes(1);
      expect((reportError.mock.calls[0][0] as Error).message).toBe(message);
    },
  );

  it("isolates a failed root from other scheduled roots", async () => {
    const brokenContainer = document.createElement("div");
    const healthyContainer = document.createElement("div");
    const reportError = vi.fn();
    globalThis.reportError = reportError;

    ReactDOM.render({ invalid: true } as never, brokenContainer);
    ReactDOM.render(h("span", null, "healthy"), healthyContainer);
    await flushWork();

    expect(reportError).toHaveBeenCalledTimes(1);
    expect(brokenContainer.textContent).toBe("");
    expect(healthyContainer.textContent).toBe("healthy");
  });
});
