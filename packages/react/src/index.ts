// packages/react/src/index.ts

// 1. 定义 Element 接口
export interface ReactElement {
  type: string | Function;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
}

const IGNORABLE_CHILDREN = [false, true, null, undefined];

// 2. 为参数和返回值添加类型
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

const React = {
  createElement,
};

export interface ChangeEvent<T = any> {
  target: T;
  type?: string;
  // 你可以根据需要补充更多原生 Event 的属性，比如 preventDefault
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

export default React;
