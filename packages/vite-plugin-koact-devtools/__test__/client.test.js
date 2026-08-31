import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clientCode = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "packages/vite-plugin-koact-devtools/client.js",
  ),
  "utf8",
);

function loadClient() {
  Function(clientCode)();
}

function createFiberTree(childCount = 1, componentName = "App", isMemo = false) {
  function Component() {}
  Component.displayName = componentName;
  const app = {
    type: isMemo
      ? { $$typeof: Symbol.for("koact.memo"), type: Component }
      : Component,
    child: null,
    sibling: null,
  };
  let previousChild = null;

  for (let index = 0; index < childCount; index++) {
    const child = {
      type: index === 0 ? "<main>" : `item-${index}`,
      child: null,
      sibling: null,
    };
    if (previousChild) previousChild.sibling = child;
    else app.child = child;
    previousChild = child;
  }

  return { child: app };
}

describe("Koact DevTools client", () => {
  let previousHook;
  let mermaid;

  beforeEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
    previousHook = window.__KOACT_DEVTOOLS_HOOK__;
    Reflect.deleteProperty(window, "__KOACT_DEVTOOLS_HOOK__");
    Reflect.deleteProperty(window, "mermaid");
    mermaid = {
      initialize: vi.fn(),
      render: vi.fn(async () => ({
        svg: '<svg width="100" height="100"><g></g></svg>',
      })),
    };
    const appendChild = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation((element) => {
      const result = appendChild(element);
      if (element.tagName === "SCRIPT") {
        window.mermaid = mermaid;
        queueMicrotask(() => element.onload());
      }
      return result;
    });
  });

  afterEach(() => {
    document.head.replaceChildren();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "mermaid");
    if (previousHook) window.__KOACT_DEVTOOLS_HOOK__ = previousHook;
    else Reflect.deleteProperty(window, "__KOACT_DEVTOOLS_HOOK__");
  });

  it("renders, bounds, and clears scheduler history", async () => {
    const previousEmit = vi.fn();
    const hostMermaid = {
      initialize: vi.fn(),
      render: vi.fn(),
    };
    window.__KOACT_DEVTOOLS_HOOK__ = { emit: previousEmit };
    window.mermaid = hostMermaid;
    loadClient();

    const hook = window.__KOACT_DEVTOOLS_HOOK__;
    hook.emit("update-scheduled", {
      rootId: 3,
      lane: 4,
      timestamp: 10,
      processedFibers: 0,
    });
    hook.emit("render-start", {
      rootId: 3,
      lane: 4,
      timestamp: 11,
      processedFibers: 0,
    });
    hook.emit("render-yield", {
      rootId: 3,
      lane: 4,
      timestamp: 12,
      elapsedTime: 1,
      processedFibers: 8,
    });
    hook.emit("render-abort", {
      rootId: 3,
      lane: 4,
      timestamp: 13,
      elapsedTime: 2,
      processedFibers: 10,
      nextLane: 1,
      reason: "higher-priority-update",
    });
    hook.emit("commit", {
      rootId: 3,
      lane: 1,
      timestamp: 14,
      elapsedTime: 0.5,
      processedFibers: 4,
      root: createFiberTree(300),
      deletions: [],
    });

    expect(previousEmit).toHaveBeenCalledTimes(5);
    document.querySelector("#koact-devtools-button").click();

    expect(document.querySelector("#koact-event-count").textContent).toBe("5");
    expect(document.querySelector("#koact-event-list").textContent).toContain(
      "Interrupted for Sync work.",
    );

    await vi.waitFor(() => {
      expect(mermaid.render).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('node0["App"]'),
      );
    });
    const graphDefinition = mermaid.render.mock.calls[0][1];
    expect(graphDefinition).toContain("&lt;main&gt;");
    expect(graphDefinition).toContain("More nodes omitted");
    expect(graphDefinition).not.toContain("item-299");
    expect(mermaid.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict" }),
    );
    expect(window.mermaid).toBe(hostMermaid);
    expect(hostMermaid.initialize).not.toHaveBeenCalled();
    expect(document.querySelector("#koact-graph-title").textContent).toBe(
      "root 3 / Sync / 0.50ms / 4 fibers",
    );
    expect(document.querySelector("#koact-graph-canvas svg")).not.toBeNull();

    hook.emit("commit", {
      rootId: 4,
      lane: 2,
      timestamp: 15,
      elapsedTime: 1,
      processedFibers: 5,
      root: createFiberTree(1, "DiscardedSnapshot"),
      deletions: [],
    });
    hook.emit("commit", {
      rootId: 5,
      lane: 2,
      timestamp: 16,
      elapsedTime: 1,
      processedFibers: 6,
      root: createFiberTree(1, "LatestSnapshot", true),
      deletions: [],
    });

    expect(mermaid.render).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    const latestGraphDefinition = mermaid.render.mock.calls[1][1];
    expect(latestGraphDefinition).toContain("Memo(LatestSnapshot)");
    expect(latestGraphDefinition).not.toContain("DiscardedSnapshot");

    for (let index = 0; index < 105; index += 1) {
      hook.emit("render-start", {
        rootId: 1,
        lane: 2,
        timestamp: index,
        processedFibers: 0,
      });
    }
    await Promise.resolve();

    expect(document.querySelector("#koact-event-count").textContent).toBe(
      "100",
    );
    expect(document.querySelectorAll(".koact-event-card")).toHaveLength(100);

    document.querySelector("#koact-clear-events").click();

    expect(document.querySelector("#koact-event-count").textContent).toBe("0");
    expect(document.querySelectorAll(".koact-event-card")).toHaveLength(0);
    expect(document.querySelector("#koact-graph-title").textContent).toBe(
      "No commit captured",
    );
    expect(document.querySelector("#koact-graph-canvas").children).toHaveLength(
      0,
    );
  });
});
