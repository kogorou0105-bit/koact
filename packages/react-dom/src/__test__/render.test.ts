import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "@koact/react";
import ReactDOM from "../index";
import { __resetSchedulerForTests } from "../scheduler";

async function flushWork() {
  await vi.runAllTimersAsync();
}

describe("ReactDOM", () => {
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

  it("应该能把虚拟 DOM 渲染成真实的 HTML", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const element = React.createElement(
      "div",
      { id: "foo", title: "bar" },
      "Hello World",
    );

    ReactDOM.render(element, container);
    await flushWork();

    expect(container.innerHTML).toBe(
      '<div id="foo" title="bar">Hello World</div>',
    );
    const child = container.querySelector("#foo");
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe("Hello World");
    expect(vi.getTimerCount()).toBe(0);
  });
});
