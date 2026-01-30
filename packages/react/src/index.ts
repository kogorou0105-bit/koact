import { IGNORABLE_CHILDREN } from "./constant/constant";
export interface ReactElement {
  type: string | Function;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
}

export function createElement(
  type: string | Function,
  props: any,
  ...children: any[]
): ReactElement {
  return {
    type,
    props: {
      ...props,
      children: children
        .flat(Infinity)
        .filter((child) => !IGNORABLE_CHILDREN.includes(child))
        .map((child) => {
          // 3. 处理基本类型节点
          if (typeof child === "object") {
            return child;
          }
          return createTextElement(child);
        }),
    },
  };
}

function createTextElement(text: string | number): ReactElement {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: [],
    },
  };
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // 这句话的意思是：允许任意的 HTML 标签（div, span, p...），不做严格检查
      [elemName: string]: any;
    }
  }
}

const React = {
  createElement,
};

export default React;
