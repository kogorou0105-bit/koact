import { updateDom } from "./dom";
import { KoactEvents } from "./events";
import { NoLane, removeLanes } from "./lanes";
import type { Fiber, FiberRoot, Hook } from "./types";

function reportError(error: unknown) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

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
    if (node.dom && node.props.ref) setRef(node.props.ref, null);
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
    try {
      fiber.dom.parentNode?.removeChild(fiber.dom);
    } catch (error) {
      reportError(error);
    }
    return;
  }

  let child = fiber.child;
  while (child) {
    removeDeletedDom(child);
    child = child.sibling;
  }
}

function commitDeletionMutation(fiber: Fiber) {
  detachDeletedStateQueues(fiber);
  removeDeletedDom(fiber);
}

function commitDomUpdates(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (node.dom && node.alternate && typeof node.type === "string") {
      try {
        updateDom(node.dom, node.alternate.props, node.props);
      } catch (error) {
        reportError(error);
      }
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
      try {
        parentDom.insertBefore(childDom, currentDomChild);
      } catch (error) {
        reportError(error);
      }
    }
  });

  while (currentDomChild) {
    const nextSibling = currentDomChild.nextSibling;
    try {
      parentDom.removeChild(currentDomChild);
    } catch (error) {
      reportError(error);
    }
    currentDomChild = nextSibling;
  }

  hostChildren.forEach(syncHostChildren);
}

function commitStateQueues(fiber?: Fiber) {
  visitTree(fiber, (node) => {
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
  root.pendingLanes = removeLanes(root.pendingLanes, finishedLanes);
  root.renderLanes = NoLane;

  visitTree(finishedWork, (fiber) => {
    fiber.lanes = removeLanes(fiber.lanes, finishedLanes);
    fiber.childLanes = removeLanes(fiber.childLanes, finishedLanes);
  });
}

function detachChangedRefs(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (!node.dom) return;

    const previousRef = node.alternate?.props.ref;
    const nextRef = node.props.ref;
    if (previousRef && previousRef !== nextRef) setRef(previousRef, null);
  });
}

function attachChangedRefs(fiber?: Fiber) {
  visitTree(fiber, (node) => {
    if (!node.dom) return;

    const previousRef = node.alternate?.props.ref;
    const nextRef = node.props.ref;
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
  deletions.forEach(commitDeletionMutation);
  commitDomUpdates(finishedWork.child);
  syncHostChildren(finishedWork);

  root.current = finishedWork;
  commitStateQueues(finishedWork.child);
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

  KoactEvents.emit("commit", {
    root: finishedWork,
    deletions,
  });
}
