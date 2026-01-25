import { describe, it, expect, vi } from "vitest";
import React from "@koact/react"; // 引入核心包
import ReactDOM from "../index"; // 引入渲染器

describe("ReactDOM", () => {
  it("应该能把虚拟 DOM 渲染成真实的 HTML", async () => {
    // 1. 准备一个容器 (这里用到了 jsdom 模拟的 document)
    const container = document.createElement("div");
    document.body.appendChild(container);

    // 2. 创建虚拟 DOM
    const element = React.createElement(
      "div",
      { id: "foo", title: "bar" },
      "Hello World",
    );

    // 3. 执行渲染
    ReactDOM.render(element, container);

    // ⚠️ 关键点：
    // 因为你的 Koact 使用了 requestIdleCallback (异步调度)，
    // 渲染不会立即完成。我们需要稍微等一下。
    // 在真实测试中可以用 vi.runAllTimers() 或 waitFor，这里简单用个 sleep 模拟
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 4. 断言真实的 DOM 结构
    // 检查容器里是否有子节点
    expect(container.innerHTML).toBe(
      '<div id="foo" title="bar">Hello World</div>',
    );

    // 也可以检查具体的 DOM 属性
    const child = container.querySelector("#foo");
    expect(child).not.toBeNull();
    expect(child?.textContent).toBe("Hello World");
  });
});
