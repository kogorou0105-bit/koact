import { updateDom } from "./dom";
import { getEventTimestamp, KoactEvents } from "./events";
import { mergeLanes, NoLane, removeLanes } from "./lanes";
import { reportError } from "./reportError";
import type { Fiber, FiberRoot, Hook } from "./types";

function visitTree(fiber: Fiber | undefined, visitor: (fiber: Fiber) => void) {
  if (!fiber) return;
  visitor(fiber);
  visitTree(fiber.child, visitor);
  visitTree(fiber.sibling, visitor);
}

function visitSubtree(fiber: Fiber, visitor: (fiber: Fiber) => void) {
  visitor(fiber);
  let child = fiber.child;
  while (child) {
    visitSubtree(child, visitor);
    child = child.sibling;
  }
}

function setRef(ref: unknown, value: HTMLElement | Text | null) {
  try {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref && typeof ref === "object" && "current" in ref) {
      (ref as { current: HTMLElement | Text | null }).current = value;
    }
  } catch (error) {
    reportError(error);
  }
}

function detachDeletedStateQueues(fiber: Fiber) {
  visitSubtree(fiber, (node) => {
    let hook = node.memoizedState;
    while (hook) {
      if (hook.tag === "STATE" && hook.queue) {
        hook.queue.mounted = false;
        hook.queue.pending = null;
        hook.queue.root = null;
        hook.queue.fiber = null;
        hook.queue.workInProgressFiber = null;
      }
      hook = hook.next || null;
    }
  });
}

function detachDeletedRefs(fiber: Fiber) {
  visitSubtree(fiber, (node) => {
    if (node.dom && node.ref) setRef(node.ref, null);
  });
}

function cleanupDeletedEffects(fiber: Fiber) {
  visitSubtree(fiber, (node) => {
    let hook = node.memoizedState;
    while (hook) {
      if (hook.tag === "EFFECT" && hook.cleanup) {
        const cleanup = hook.cleanup;
        hook.cleanup = undefined;
        try {
          cleanup();
        } catch (error) {
          reportError(error);
        }
      }
      hook = hook.next || null;
    }
  });
}

function removeDeletedDom(fiber: Fiber) {
  if (fiber.dom) {
    fiber.dom.parentNode?.removeChild(fiber.dom);
    return;
  }

  let child = fiber.child;
  while (child) {
    removeDeletedDom(child);
    child = child.sibling;
  }
}

function commitDomUpdates(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (node.dom && node.alternate && typeof node.type === "string") {
      updateDom(
        node.dom,
        node.alternate.memoizedProps || {},
        node.pendingProps,
      );
    }
  });
}

function collectImmediateHostChildren(fiber: Fiber | undefined, result: Fiber[]) {
  let current = fiber;
  while (current) {
    if (current.dom) {
      result.push(current);
    } else {
      collectImmediateHostChildren(current.child, result);
    }
    current = current.sibling;
  }
}

function syncHostChildren(parentFiber: Fiber) {
  if (!parentFiber.dom || parentFiber.type === "TEXT_ELEMENT") return;

  const hostChildren: Fiber[] = [];
  collectImmediateHostChildren(parentFiber.child, hostChildren);

  const parentDom = parentFiber.dom;
  let currentDomChild = parentDom.firstChild;

  hostChildren.forEach((childFiber) => {
    const childDom = childFiber.dom!;
    if (childDom === currentDomChild) {
      currentDomChild = currentDomChild.nextSibling;
    } else {
      parentDom.insertBefore(childDom, currentDomChild);
    }
  });

  while (currentDomChild) {
    const nextSibling = currentDomChild.nextSibling;
    parentDom.removeChild(currentDomChild);
    currentDomChild = nextSibling;
  }

  hostChildren.forEach(syncHostChildren);
}

function publishFiberMetadata(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    node.memoizedProps = node.pendingProps;
    let hook = node.memoizedState;
    while (hook) {
      if (hook.tag === "STATE" && hook.queue) {
        hook.queue.mounted = true;
        hook.queue.root = node.root;
        hook.queue.fiber = node;
        hook.queue.workInProgressFiber = null;
      }
      hook = hook.next || null;
    }
  });
}

function commitFinishedLanes(root: FiberRoot, finishedWork: Fiber) {
  const finishedLanes = root.renderLanes;
  root.finishedLanes = finishedLanes;

  visitTree(finishedWork, (fiber) => {
    fiber.lanes = removeLanes(fiber.lanes, finishedLanes);
    fiber.childLanes = removeLanes(fiber.childLanes, finishedLanes);
  });

  root.pendingLanes = mergeLanes(
    finishedWork.lanes,
    finishedWork.childLanes,
  );
  root.renderLanes = NoLane;
}

function detachChangedRefs(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (!node.dom) return;

    const previousRef = node.alternate?.ref;
    const nextRef = node.ref;
    if (previousRef && previousRef !== nextRef) setRef(previousRef, null);
  });
}

function attachChangedRefs(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (!node.dom) return;

    const previousRef = node.alternate?.ref;
    const nextRef = node.ref;
    if (nextRef && previousRef !== nextRef) setRef(nextRef, node.dom);
  });
}

function destroyChangedEffect(hook: Hook) {
  if (!hook.hasChanged || !hook.callback) return;

  if (hook.cleanup) {
    const cleanup = hook.cleanup;
    hook.cleanup = undefined;
    try {
      cleanup();
    } catch (error) {
      reportError(error);
    }
  }
}

function createChangedEffect(hook: Hook) {
  if (!hook.hasChanged || !hook.callback) return;

  try {
    const cleanup = hook.callback();
    hook.cleanup = typeof cleanup === "function" ? cleanup : undefined;
  } catch (error) {
    reportError(error);
  }
  hook.hasChanged = false;
}

function visitEffects(fiber: Fiber | undefined, visitor: (hook: Hook) => void) {
  if (!fiber) return;

  visitEffects(fiber.child, visitor);
  let hook = fiber.memoizedState;
  while (hook) {
    if (hook.tag === "EFFECT") visitor(hook);
    hook = hook.next || null;
  }
  visitEffects(fiber.sibling, visitor);
}

function detachAlternates(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    node.alternate = null;
  });
}

export function commitRoot(root: FiberRoot) {
  const finishedWork = root.workInProgress;
  if (!finishedWork) return;

  const deletions = [...root.deletions];
  deletions.forEach(removeDeletedDom);
  commitDomUpdates(finishedWork.child);
  syncHostChildren(finishedWork);

  deletions.forEach(detachDeletedStateQueues);
  root.current = finishedWork;
  publishFiberMetadata(finishedWork);
  commitFinishedLanes(root, finishedWork);
  deletions.forEach(detachDeletedRefs);
  detachChangedRefs(finishedWork.child);
  attachChangedRefs(finishedWork.child);
  deletions.forEach(cleanupDeletedEffects);
  visitEffects(finishedWork.child, destroyChangedEffect);
  visitEffects(finishedWork.child, createChangedEffect);
  detachAlternates(finishedWork);

  root.workInProgress = null;
  root.nextUnitOfWork = null;
  root.deletions = [];

  const timestamp = getEventTimestamp();
  KoactEvents.emit("commit", {
    rootId: root.id,
    lane: root.finishedLanes,
    timestamp,
    elapsedTime: Math.max(0, timestamp - root.renderStartTime),
    processedFibers: root.processedFibers,
    root: finishedWork,
    deletions,
  });
}
