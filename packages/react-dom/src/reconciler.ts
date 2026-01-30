// packages/react-dom/src/reconciler.ts
import { Fiber } from "./types";
import { createDom } from "./dom";
import { Globals } from "./globals";

export function performUnitOfWork(fiber: Fiber): Fiber | null {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    updateFunctionComponent(fiber);
  } else {
    updateHostComponent(fiber);
  }

  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber: Fiber | undefined = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
  return null;
}

function updateFunctionComponent(fiber: Fiber) {
  Globals.wipFiber = fiber;
  Globals.hookIndex = 0;
  Globals.wipFiber.hooks = [];

  const fn = fiber.type as Function;
  const children = [fn(fiber.props)];
  reconcileChildren(fiber, children);
}

function updateHostComponent(fiber: Fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}

const getKey = (el: any, index: number) => {
  return el?.props?.key !== undefined ? el.props.key : index;
};

function reconcileChildren(wipFiber: Fiber, elements: any[]) {
  let index = 0;
  let oldFiber = wipFiber.alternate?.child;
  let prevSibling: Fiber | null = null;

  const flatElements = elements.flat(Infinity);

  // 1. 构建旧节点的 Map (Key -> Fiber)
  const existingChildren = new Map<string | number, Fiber>();
  let tempFiber = oldFiber;
  let i = 0;
  while (tempFiber) {
    const key =
      tempFiber.key !== undefined && tempFiber.key !== null ? tempFiber.key : i;
    existingChildren.set(key, tempFiber);
    tempFiber = tempFiber.sibling;
    i++;
  }

  // 2. 遍历新元素，尝试复用
  while (index < flatElements.length) {
    const element = flatElements[index];
    let newFiber: Fiber | undefined = undefined;

    const key = getKey(element, index);
    const matchedFiber = existingChildren.get(key);
    const sameType =
      matchedFiber && element && element.type === matchedFiber.type;

    if (sameType) {
      // UPDATE: 复用
      existingChildren.delete(key);
      newFiber = {
        type: matchedFiber!.type,
        props: element.props,
        dom: matchedFiber!.dom,
        parent: wipFiber,
        alternate: matchedFiber,
        effectTag: "UPDATE",
        hooks: matchedFiber!.hooks,
        key: key,
      };
    } else {
      // PLACEMENT: 新建
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        effectTag: "PLACEMENT",
        key: key,
      };
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (prevSibling) {
      prevSibling.sibling = newFiber;
    }
    prevSibling = newFiber;
    index++;
  }

  // 3. 删除剩余节点
  existingChildren.forEach((fiber) => {
    fiber.effectTag = "DELETION";
    Globals.deletions.push(fiber);
  });
}
