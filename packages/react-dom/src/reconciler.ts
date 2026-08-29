import {
  Fragment,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  type FunctionComponent,
  type Key,
  type ReactElement,
  type ReactNode,
} from "@koact/react";
import { createDom } from "./dom";
import { NoLane } from "./lanes";
import {
  finishHooks,
  HooksDispatcher,
  prepareToUseHooks,
  resetHooksAfterRender,
} from "./hooks";
import type { Fiber, FiberRoot } from "./types";

const { SharedInternals, normalizeChildren } =
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

export function performUnitOfWork(
  root: FiberRoot,
  fiber: Fiber,
): Fiber | null {
  if (typeof fiber.type === "function") {
    updateFunctionComponent(root, fiber);
  } else if (fiber.type === Fragment) {
    reconcileChildren(root, fiber, fiber.props.children);
  } else {
    updateHostComponent(root, fiber);
  }

  if (fiber.child) return fiber.child;

  let nextFiber: Fiber | undefined = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) return nextFiber.sibling;
    nextFiber = nextFiber.parent;
  }
  return null;
}

function updateFunctionComponent(root: FiberRoot, fiber: Fiber) {
  prepareToUseHooks(root, fiber);
  const previousDispatcher = SharedInternals.currentDispatcher;
  SharedInternals.currentDispatcher = HooksDispatcher;

  let output: ReactNode;
  try {
    const component = fiber.type as FunctionComponent<any>;
    output = component(fiber.props);
    finishHooks();
  } finally {
    SharedInternals.currentDispatcher = previousDispatcher;
    resetHooksAfterRender();
  }

  reconcileChildren(root, fiber, output);
}

function updateHostComponent(root: FiberRoot, fiber: Fiber) {
  if (!fiber.dom) fiber.dom = createDom(fiber);
  reconcileChildren(root, fiber, fiber.props.children);
}

function getElementKey(element: ReactElement): Key | null {
  const key = element.props.key;
  return key === undefined || key === null ? null : key;
}

function createDeletionFiber(fiber: Fiber, parent: Fiber): Fiber {
  return {
    ...fiber,
    parent,
    effectTag: "DELETION",
  };
}

function reconcileChildren(
  root: FiberRoot,
  workInProgressFiber: Fiber,
  children: ReactNode,
) {
  const elements = normalizeChildren(children);
  const keyedChildren = new Map<Key, Fiber[]>();
  const unkeyedChildren = new Map<number, Fiber>();
  const remainingChildren = new Set<Fiber>();

  let oldFiber = workInProgressFiber.alternate?.child;
  let oldIndex = 0;
  while (oldFiber) {
    oldFiber.index = oldFiber.index ?? oldIndex;
    remainingChildren.add(oldFiber);

    if (oldFiber.key === null || oldFiber.key === undefined) {
      unkeyedChildren.set(oldFiber.index, oldFiber);
    } else {
      const siblingsWithKey = keyedChildren.get(oldFiber.key) || [];
      siblingsWithKey.push(oldFiber);
      keyedChildren.set(oldFiber.key, siblingsWithKey);
    }

    oldFiber = oldFiber.sibling;
    oldIndex++;
  }

  workInProgressFiber.child = undefined;
  let previousSibling: Fiber | undefined;
  let lastPlacedIndex = 0;

  elements.forEach((element, index) => {
    const key = getElementKey(element);
    let matchedFiber: Fiber | undefined;

    if (key === null) {
      matchedFiber = unkeyedChildren.get(index);
      unkeyedChildren.delete(index);
    } else {
      const candidates = keyedChildren.get(key);
      matchedFiber = candidates?.shift();
      if (candidates?.length === 0) keyedChildren.delete(key);
    }

    const canReuse = matchedFiber?.type === element.type;
    let newFiber: Fiber;

    if (canReuse && matchedFiber) {
      remainingChildren.delete(matchedFiber);
      const previousIndex = matchedFiber.index ?? index;
      const needsPlacement = previousIndex < lastPlacedIndex;
      if (!needsPlacement) lastPlacedIndex = previousIndex;

      newFiber = {
        root,
        lanes: matchedFiber.lanes,
        childLanes: matchedFiber.childLanes,
        type: matchedFiber.type,
        props: element.props,
        dom: matchedFiber.dom,
        parent: workInProgressFiber,
        alternate: matchedFiber,
        effectTag: needsPlacement ? "PLACEMENT" : "UPDATE",
        key,
        index,
        memoizedState: matchedFiber.memoizedState,
      };
    } else {
      newFiber = {
        root,
        lanes: NoLane,
        childLanes: NoLane,
        type: element.type,
        props: element.props,
        dom: null,
        parent: workInProgressFiber,
        alternate: null,
        effectTag: "PLACEMENT",
        key,
        index,
      };
    }

    if (!previousSibling) {
      workInProgressFiber.child = newFiber;
    } else {
      previousSibling.sibling = newFiber;
    }
    previousSibling = newFiber;
  });

  remainingChildren.forEach((fiber) => {
    root.deletions.push(createDeletionFiber(fiber, workInProgressFiber));
  });
}
