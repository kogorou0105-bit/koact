import { describe, it, expect } from "vitest";

// 2. 引入你要测试的函数
import React, {
  MEMO_TYPE,
  createElement,
  memo,
  normalizeChildren,
} from "../index";

// 3. 开始写测试套件
describe("createElement", () => {
  it("should create a simple element", () => {
    // 准备数据
    const type = "div";
    const props = { id: "foo" };
    const children = "bar";

    // 运行函数
    const element = createElement(type, props, children);

    // 断言结果 (Expect)
    expect(element).toEqual({
      type: "div",
      key: null,
      ref: null,
      props: {
        id: "foo",
        children: "bar",
      },
    });
  });

  it("should handle nested elements", () => {
    const element = createElement(
      "div",
      { id: "container" },
      createElement("span", null, "hello"),
    );

    expect(element.type).toBe("div");
    const child = normalizeChildren(element.props.children)[0];
    const text = normalizeChildren(child.props.children)[0];
    expect(child.type).toBe("span");
    expect(text.props.nodeValue).toBe("hello");
  });

  it("keeps key and ref outside props without allocating empty children", () => {
    const ref = { current: null };
    const element = createElement("div", { key: "item", ref, id: "value" });

    expect(element).toEqual({
      type: "div",
      key: "item",
      ref,
      props: { id: "value" },
    });
    expect(element.props).not.toHaveProperty("key");
    expect(element.props).not.toHaveProperty("ref");
    expect(element.props).not.toHaveProperty("children");
  });

  it("preserves explicit children and only groups multiple variadic children", () => {
    expect(createElement("div", { children: "explicit" }).props.children).toBe(
      "explicit",
    );
    expect(createElement("div", null, "single").props.children).toBe("single");
    expect(createElement("div", null, "first", "second").props.children).toEqual(
      ["first", "second"],
    );
  });

  it("creates memo component descriptors", () => {
    const Component = (props: { value: number }) => props.value;
    const compare = (previous: { value: number }, next: { value: number }) =>
      previous.value === next.value;
    const MemoComponent = memo(Component, compare);

    expect(MemoComponent).toEqual({
      $$typeof: MEMO_TYPE,
      type: Component,
      compare,
    });
    expect(React.memo).toBe(memo);
    expect(() => memo(MemoComponent as never)).toThrow(
      "memo expects a function component",
    );
  });
});
