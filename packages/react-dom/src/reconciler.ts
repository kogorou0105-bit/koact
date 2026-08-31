import {
  Fragment,
  MEMO_TYPE,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  type FunctionComponent,
  type Key,
  type MemoComponent,
  type ReactElement,
  type ReactNode,
} from "@koact/react";
import { createDom } from "./dom";
import { includesSomeLane, mergeLanes, NoLane } from "./lanes";
import {
  bindWorkInProgressStateQueues,
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
  const next = beginWork(root, fiber);
  if (next) return next;

  let nextFiber: Fiber | undefined = fiber;
  while (nextFiber) {
    completeWork(nextFiber);
    if (nextFiber.sibling) return nextFiber.sibling;
    nextFiber = nextFiber.parent;
  }
  return null;
}

function beginWork(root: FiberRoot, fiber: Fiber): Fiber | null {
  const current = fiber.alternate;
  if (
    fiber.isBailoutClone &&
    current &&
    !includesSomeLane(fiber.lanes, root.renderLanes)
  ) {
    return bailoutOnAlreadyFinishedWork(root, current, fiber);
  }
  fiber.isBailoutClone = false;

  if (isMemoComponent(fiber.type)) {
    return updateMemoComponent(root, fiber, fiber.type);
  }
  if (typeof fiber.type === "function") {
    updateFunctionComponent(root, fiber, fiber.type);
  } else if (fiber.type === Fragment) {
    reconcileChildren(root, fiber, fiber.pendingProps.children);
  } else {
    updateHostComponent(root, fiber);
  }

  return fiber.child || null;
}

function completeWork(fiber: Fiber) {
  let childLanes = NoLane;
  let child = fiber.child;
  while (child) {
    childLanes = mergeLanes(childLanes, child.lanes);
    childLanes = mergeLanes(childLanes, child.childLanes);
    child = child.sibling;
  }
  fiber.childLanes = childLanes;
}

function updateFunctionComponent(
  root: FiberRoot,
  fiber: Fiber,
  component: FunctionComponent<any>,
) {
  prepareToUseHooks(root, fiber);
  const previousDispatcher = SharedInternals.currentDispatcher;
  SharedInternals.currentDispatcher = HooksDispatcher;

  let output: ReactNode;
  try {
    output = component(fiber.pendingProps);
    finishHooks();
  } finally {
    SharedInternals.currentDispatcher = previousDispatcher;
    resetHooksAfterRender();
  }

  reconcileChildren(root, fiber, output);
}

function updateHostComponent(root: FiberRoot, fiber: Fiber) {
  if (!fiber.dom) fiber.dom = createDom(fiber);
  reconcileChildren(root, fiber, fiber.pendingProps.children);
}

function getElementKey(element: ReactElement): Key | null {
  return element.key === undefined || element.key === null ? null : element.key;
}

function isMemoComponent(type: Fiber["type"]): type is MemoComponent<any> {
  const candidate = type as unknown as { $$typeof?: symbol } | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    candidate.$$typeof === MEMO_TYPE
  );
}

function shallowEqual(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  if (Object.is(previous, next)) return true;

  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  if (previousKeys.length !== nextKeys.length) return false;

  return previousKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(next, key) &&
      Object.is(previous[key], next[key]),
  );
}

function updateMemoComponent(
  root: FiberRoot,
  fiber: Fiber,
  memoType: MemoComponent<any>,
): Fiber | null {
  const current = fiber.alternate;
  if (
    current?.memoizedProps &&
    current.ref === fiber.ref &&
    !includesSomeLane(fiber.lanes, root.renderLanes)
  ) {
    const compare = memoType.compare || shallowEqual;
    if (compare(current.memoizedProps, fiber.pendingProps)) {
      fiber.pendingProps = current.memoizedProps;
      return bailoutOnAlreadyFinishedWork(root, current, fiber);
    }
  }

  updateFunctionComponent(root, fiber, memoType.type);
  return fiber.child || null;
}

function bailoutOnAlreadyFinishedWork(
  root: FiberRoot,
  current: Fiber,
  workInProgress: Fiber,
) {
  if (includesSomeLane(workInProgress.childLanes, root.renderLanes)) {
    cloneChildFibers(current, workInProgress);
    return workInProgress.child || null;
  }

  cloneBailedOutSubtree(current, workInProgress);
  return null;
}

function cloneFiber(current: Fiber, parent: Fiber): Fiber {
  const clone: Fiber = {
    root: parent.root,
    lanes: current.lanes,
    childLanes: current.childLanes,
    type: current.type,
    pendingProps: current.memoizedProps ?? current.pendingProps,
    memoizedProps: current.memoizedProps,
    ref: current.ref,
    dom: current.dom,
    parent,
    alternate: current,
    isBailoutClone: true,
    effectTag: "UPDATE",
    key: current.key ?? null,
    index: current.index,
    memoizedState: current.memoizedState,
  };
  bindWorkInProgressStateQueues(clone);
  return clone;
}

function cloneChildFibers(current: Fiber, workInProgress: Fiber) {
  workInProgress.child = undefined;
  let currentChild = current.child;
  let previousClone: Fiber | undefined;

  while (currentChild) {
    const clone = cloneFiber(currentChild, workInProgress);
    if (previousClone) previousClone.sibling = clone;
    else workInProgress.child = clone;
    previousClone = clone;
    currentChild = currentChild.sibling;
  }
}

function cloneBailedOutSubtree(current: Fiber, workInProgress: Fiber) {
  cloneChildFibers(current, workInProgress);

  let currentChild = current.child;
  let clonedChild = workInProgress.child;
  while (currentChild && clonedChild) {
    cloneBailedOutSubtree(currentChild, clonedChild);
    currentChild = currentChild.sibling;
    clonedChild = clonedChild.sibling;
  }
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
        pendingProps: element.props,
        memoizedProps: matchedFiber.memoizedProps,
        ref: element.ref,
        dom: matchedFiber.dom,
        parent: workInProgressFiber,
        alternate: matchedFiber,
        effectTag: needsPlacement ? "PLACEMENT" : "UPDATE",
        key,
        index,
        memoizedState: matchedFiber.memoizedState,
      };
      bindWorkInProgressStateQueues(newFiber);
    } else {
      newFiber = {
        root,
        lanes: NoLane,
        childLanes: NoLane,
        type: element.type,
        pendingProps: element.props,
        memoizedProps: null,
        ref: element.ref,
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
