import { ReactElement } from "@koact/react";

// --- 1. 类型定义 ---

// 核心 Fiber 结构
export interface Fiber {
  type?: string | Function;
  props: {
    children: ReactElement[];
    [key: string]: any;
  };
  dom?: HTMLElement | Text | null;
  parent?: Fiber;
  child?: Fiber;
  sibling?: Fiber;
  alternate?: Fiber | null; // 指向上一棵树对应的 Fiber (用于 Diff)
  effectTag?: "PLACEMENT" | "UPDATE" | "DELETION";
  hooks?: Hook[]; // 函数组件的 Hooks 链表
}

interface Hook {
  state: any;
  queue: ((state: any) => any)[];
}

// --- 2. 全局变量 ---

let nextUnitOfWork: Fiber | null = null;
let currentRoot: Fiber | null = null;
let wipRoot: Fiber | null = null;
let deletions: Fiber[] = [];

let wipFiber: Fiber | null = null;
let hookIndex: number = 0;

// --- 3. DOM 操作相关 ---

function createDom(fiber: Fiber): HTMLElement | Text {
  const dom =
    fiber.type === "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type as string);

  updateDom(dom, {}, fiber.props);

  return dom;
}

const isEvent = (key: string) => key.startsWith("on");
const isProperty = (key: string) => key !== "children" && !isEvent(key);
const isNew = (prev: any, next: any) => (key: string) =>
  prev[key] !== next[key];
const isGone = (prev: any, next: any) => (key: string) => !(key in next);

function updateDom(dom: HTMLElement | Text, prevProps: any, nextProps: any) {
  // 1. 移除旧的或变化的事件监听
  Object.keys(prevProps)
    .filter(isEvent)
    .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 2. 移除旧属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach((name) => {
      (dom as any)[name] = "";
    });

  // 3. 设置新属性或变化的属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      if (name === "style") {
        const style = nextProps[name];

        // 如果是 React 标准的对象写法 {{ color: 'red' }}
        if (typeof style === "object" && style !== null) {
          Object.keys(style).forEach((key) => {
            // 需要转义类型，因为 dom.style 索引签名比较严格
            (dom as HTMLElement).style[key as any] = style[key];
          });
        }
        // 兼容字符串写法 (虽然 TS 会报错，但防守性编程可以留着)
        else if (typeof style === "string") {
          (dom as HTMLElement).style.cssText = style;
        }
      } else {
        // 普通属性 (id, className, value 等) 直接赋值
        (dom as any)[name] = nextProps[name];
      }
    });

  // 4. 添加新事件
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach((name) => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}

// --- 4. Commit 阶段 (同步执行 DOM 修改) ---

function commitRoot() {
  deletions.forEach(commitWork);
  if (wipRoot && wipRoot.child) {
    commitWork(wipRoot.child);
  }
  currentRoot = wipRoot;
  wipRoot = null;
}

function commitWork(fiber?: Fiber) {
  if (!fiber) {
    return;
  }

  // 向上查找最近的有 DOM 节点的父 Fiber
  let domParentFiber = fiber.parent;
  while (!domParentFiber || !domParentFiber.dom) {
    domParentFiber = domParentFiber?.parent;
  }
  const domParent = domParentFiber.dom;

  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate?.props || {}, fiber.props);
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
    // 删除节点后，不需要继续处理它的子节点 (因为已经从 DOM 移除)
    return;
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

function commitDeletion(fiber: Fiber, domParent: HTMLElement | Text) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    // 如果当前 Fiber 是函数组件（没有 DOM），则递归删子节点
    if (fiber.child) {
      commitDeletion(fiber.child, domParent);
    }
  }
}

// --- 5. Render 阶段 (可中断的递归) ---

function workLoop(deadline: IdleDeadline) {
  let shouldYield = false;
  while (nextUnitOfWork && !shouldYield) {
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }

  requestIdleCallback(workLoop);
}

// 启动循环
requestIdleCallback(workLoop);

function performUnitOfWork(fiber: Fiber): Fiber | null {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  // 深度优先遍历：先找子节点
  if (fiber.child) {
    return fiber.child;
  }

  let nextFiber: Fiber | undefined = fiber;
  while (nextFiber) {
    // 再找兄弟节点
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    // 最后找叔叔节点 (父节点的兄弟)
    nextFiber = nextFiber.parent;
  }
  return null;
}

function updateFunctionComponent(fiber: Fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  wipFiber.hooks = [];

  const fn = fiber.type as Function;
  // 执行函数组件，获取 children
  const children = [fn(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber: Fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

// --- 6. Reconciliation (Diff 算法) ---

function reconcileChildren(wipFiber: Fiber, elements: any[]) {
  let index = 0;
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling: Fiber | null = null;

  // 展平数组，处理 Fragment 情况 (简化版)
  const flatElements = elements.flat(Infinity);

  while (index < flatElements.length || oldFiber != null) {
    const element = flatElements[index];
    let newFiber: Fiber | undefined = undefined; // 初始化为 undefined

    const sameType = oldFiber && element && element.type === oldFiber.type;

    if (sameType) {
      // UPDATE
      newFiber = {
        type: oldFiber!.type,
        props: element.props,
        dom: oldFiber!.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE",
      };
    }
    if (element && !sameType) {
      // PLACEMENT
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
      };
    }
    if (oldFiber && !sameType) {
      // DELETION
      oldFiber.effectTag = "DELETION";
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    // 构建 Fiber 树的链表指针
    if (index === 0) {
      // 父节点的 child 指向第一个子节点
      wipFiber.child = newFiber;
    } else if (element && prevSibling) {
      // 确保 prevSibling 存在
      // 前一个子节点的 sibling 指向当前节点
      prevSibling.sibling = newFiber;
    }

    if (newFiber) {
      prevSibling = newFiber;
    }
    index++;
  }
}

// --- 7. Hooks ---

export function useState<T>(
  initial: T,
): [T, (action: T | ((prevState: T) => T)) => void] {
  if (!wipFiber) {
    throw new Error("useState must be used within a component.");
  }

  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];

  const hook: Hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [],
  };

  const actions = oldHook ? oldHook.queue : [];
  actions.forEach((action) => {
    // 简单判断 action 是否为函数，模拟 setState(c => c+1)
    if (action instanceof Function) {
      hook.state = action(hook.state);
    } else {
      hook.state = action;
    }
  });

  const setState = (action: any) => {
    hook.queue.push(action);

    // 触发重新渲染
    if (currentRoot) {
      wipRoot = {
        dom: currentRoot.dom,
        props: currentRoot.props,
        alternate: currentRoot,
      };
      nextUnitOfWork = wipRoot;
      deletions = [];
    }
  };

  wipFiber.hooks!.push(hook);
  hookIndex++;
  return [hook.state, setState];
}

// --- 8. Public API ---

export function render(element: ReactElement, container: HTMLElement) {
  wipRoot = {
    dom: container,
    props: {
      children: [element],
    },
    alternate: currentRoot,
  };
  deletions = [];
  nextUnitOfWork = wipRoot;
}

const ReactDOM = {
  render,
  useState,
};

export default ReactDOM;
