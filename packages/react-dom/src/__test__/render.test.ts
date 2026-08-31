import { describe, expect, it, vi } from "vitest";
import ReactDOM from "../index";
import { flushWork, h, setupRuntimeTests } from "./testUtils";

setupRuntimeTests();

describe("ReactDOM", () => {
  it("应该能把虚拟 DOM 渲染成真实的 HTML", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const element = h("div", { id: "foo", title: "bar" }, "Hello World");

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
