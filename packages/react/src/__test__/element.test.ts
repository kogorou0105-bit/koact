import { describe, it, expect } from "vitest";

// 2. 引入你要测试的函数
import { createElement } from "../index";

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
      props: {
        id: "foo",
        children: [
          {
            type: "TEXT_ELEMENT",
            props: {
              nodeValue: "bar",
              children: [],
            },
          },
        ],
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
    expect(element.props.children[0].type).toBe("span");
    expect(element.props.children[0].props.children[0].props.nodeValue).toBe(
      "hello",
    );
  });
});
