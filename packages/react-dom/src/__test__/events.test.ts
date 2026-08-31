import { describe, expect, it, vi } from "vitest";
import { startTransition, useState } from "@koact/react";
import { createRoot } from "../index";
import {
  KoactEvents,
  type KoactEventMap,
  type SchedulerEvent,
} from "../events";
import { initDevTools } from "../devTools";
import {
  DefaultLane,
  NoLane,
  SyncLane,
  TransitionLane,
} from "../lanes";
import {
  flushWork,
  h,
  mockIdleCallbacks,
  setupRuntimeTests,
} from "./testUtils";

const eventNames: Array<keyof KoactEventMap> = [
  "update-scheduled",
  "render-start",
  "render-yield",
  "render-abort",
  "commit",
];

setupRuntimeTests();

describe("scheduler events", () => {
  it("emits a complete scheduling lifecycle with metrics", async () => {
    const { pendingCallbacks: idleCallbacks } = mockIdleCallbacks();
    const events: Array<{
      type: keyof KoactEventMap;
      data: SchedulerEvent;
    }> = [];

    const unsubscribers = eventNames.map((type) =>
      KoactEvents.on(type, (data) => events.push({ type, data })),
    );

    try {
      const container = document.createElement("div");
      const root = createRoot(container);
      let setCount!: (update: (count: number) => number) => void;

      function Counter() {
        const [count, updateCount] = useState(0);
        setCount = updateCount;
        return h("span", null, count);
      }

      root.render(h(Counter, null));
      await vi.advanceTimersByTimeAsync(0);
      events.length = 0;

      startTransition(() => setCount((count) => count + 10));
      await vi.advanceTimersByTimeAsync(0);
      let deadlineChecks = 0;
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => (deadlineChecks++ === 0 ? 100 : 0),
      });

      setCount((count) => count + 1);
      await vi.advanceTimersByTimeAsync(0);
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      await vi.advanceTimersByTimeAsync(0);
      idleCallbacks.shift()!({
        didTimeout: false,
        timeRemaining: () => 100,
      });

      expect(events.map((event) => event.type)).toEqual([
        "update-scheduled",
        "render-start",
        "render-yield",
        "update-scheduled",
        "render-abort",
        "render-start",
        "commit",
        "render-start",
        "commit",
      ]);
      expect(new Set(events.map((event) => event.data.rootId)).size).toBe(1);
      events.forEach(({ data }) => {
        expect(data.timestamp).toEqual(expect.any(Number));
        expect(data.processedFibers).toBeGreaterThanOrEqual(0);
        if ("elapsedTime" in data) {
          expect(data.elapsedTime).toBeGreaterThanOrEqual(0);
        }
      });

      const yieldEvent = events[2].data;
      expect(yieldEvent.lane).toBe(TransitionLane);
      expect(yieldEvent.processedFibers).toBe(2);

      const abortEvent = events[4].data as KoactEventMap["render-abort"];
      expect(abortEvent.lane).toBe(TransitionLane);
      expect(abortEvent.nextLane).toBe(DefaultLane);
      expect(abortEvent.reason).toBe("higher-priority-update");
      expect(container.textContent).toBe("11");
    } finally {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    }
  });

  it("isolates listener errors from other listeners and commits", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const received: SchedulerEvent[] = [];
    const unsubscribeBroken = KoactEvents.on("update-scheduled", () => {
      throw new Error("listener failed");
    });
    const unsubscribeHealthy = KoactEvents.on("update-scheduled", (event) => {
      received.push(event);
    });

    try {
      const container = document.createElement("div");
      const root = createRoot(container);

      expect(() => root.render(h("span", null, "committed"))).not.toThrow();
      await flushWork();

      expect(container.textContent).toBe("committed");
      expect(received).toHaveLength(1);
      expect(consoleError).toHaveBeenCalledWith(
        "[Koact] update-scheduled listener failed.",
        expect.any(Error),
      );
    } finally {
      unsubscribeBroken();
      unsubscribeHealthy();
      consoleError.mockRestore();
    }
  });

  it("reports render errors as terminal aborts", async () => {
    const aborts: KoactEventMap["render-abort"][] = [];
    const unsubscribe = KoactEvents.on("render-abort", (event) => {
      aborts.push(event);
    });
    globalThis.reportError = vi.fn();

    try {
      function Broken(): never {
        throw new Error("render failed");
      }

      createRoot(document.createElement("div")).render(h(Broken, null));
      await flushWork();

      expect(aborts).toHaveLength(1);
      expect(aborts[0]).toMatchObject({
        lane: SyncLane,
        nextLane: NoLane,
        reason: "error",
        processedFibers: 2,
      });
    } finally {
      unsubscribe();
    }
  });

  it("assigns monotonically increasing root identifiers", () => {
    const rootIds: number[] = [];
    const unsubscribe = KoactEvents.on("update-scheduled", (event) => {
      rootIds.push(event.rootId);
    });

    try {
      createRoot(document.createElement("div")).render(h("span", null, "a"));
      createRoot(document.createElement("div")).render(h("span", null, "b"));

      expect(rootIds).toHaveLength(2);
      expect(rootIds[1]).toBeGreaterThan(rootIds[0]);
    } finally {
      unsubscribe();
    }
  });

  it("keeps DevTools forwarding idempotent", async () => {
    const previousHook = window.__KOACT_DEVTOOLS_HOOK__;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const emit = vi.fn((event: string) => {
      if (event === "render-start") throw new Error("hook failed");
    });
    window.__KOACT_DEVTOOLS_HOOK__ = { emit };

    initDevTools();
    const removeListeners = initDevTools();

    try {
      const container = document.createElement("div");
      createRoot(container).render(h("span", null, "devtools"));
      await flushWork();

      expect(container.textContent).toBe("devtools");
      expect(emit.mock.calls.map(([event]) => event)).toEqual([
        "update-scheduled",
        "render-start",
        "commit",
      ]);
      expect(consoleError).toHaveBeenCalledWith(
        "[Koact] render-start listener failed.",
        expect.any(Error),
      );
    } finally {
      removeListeners();
      consoleError.mockRestore();
      if (previousHook) window.__KOACT_DEVTOOLS_HOOK__ = previousHook;
      else Reflect.deleteProperty(window, "__KOACT_DEVTOOLS_HOOK__");
    }
  });
});
