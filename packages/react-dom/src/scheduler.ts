import {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  type ReactNode,
} from "@koact/react";
import type { FiberRoot } from "./types";
import {
  __resetBatchingForTests,
  scheduleBatchedRoot,
} from "./batching";
import { performUnitOfWork } from "./reconciler";
import { commitRoot } from "./commit";

type HostCallbackHandle =
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> };

const scheduledRoots: FiberRoot[] = [];
const scheduledRootSet = new Set<FiberRoot>();
const allRoots = new Set<FiberRoot>();
let rootsByContainer = new WeakMap<HTMLElement, FiberRoot>();
let hostCallback: HostCallbackHandle | null = null;

function reportError(error: unknown) {
  if (typeof globalThis.reportError === "function") {
    globalThis.reportError(error);
  } else {
    console.error(error);
  }
}

function enqueueRoot(root: FiberRoot) {
  if (root.status === "unmounted" || scheduledRootSet.has(root)) return;

  scheduledRootSet.add(root);
  scheduledRoots.push(root);
  requestHostCallback();
}

function dequeueRoot() {
  const root = scheduledRoots.shift() || null;
  if (root) scheduledRootSet.delete(root);
  return root;
}

function scheduleUpdateOnRoot(root: FiberRoot) {
  if (root.status !== "active") return;

  root.updateVersion++;
  scheduleBatchedRoot(root);
}

function prepareFreshStack(root: FiberRoot) {
  const { normalizeChildren } =
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

  root.renderVersion = root.updateVersion;
  root.deletions = [];
  root.workInProgress = {
    root,
    dom: root.container,
    props: {
      children: normalizeChildren(root.element),
    },
    alternate: root.current,
  };
  root.nextUnitOfWork = root.workInProgress;
}

function abortRoot(root: FiberRoot, error: unknown) {
  root.workInProgress = null;
  root.nextUnitOfWork = null;
  root.deletions = [];
  reportError(error);
}

function performWorkUntilDeadline(deadline: IdleDeadline) {
  hostCallback = null;
  let didPerformWork = false;

  while (
    scheduledRoots.length > 0 &&
    (!didPerformWork || deadline.timeRemaining() >= 1)
  ) {
    const root = dequeueRoot();
    if (!root || root.status === "unmounted") continue;

    let didError = false;
    try {
      if (!root.nextUnitOfWork) prepareFreshStack(root);

      while (
        root.nextUnitOfWork &&
        (!didPerformWork || deadline.timeRemaining() >= 1)
      ) {
        root.nextUnitOfWork = performUnitOfWork(root, root.nextUnitOfWork);
        didPerformWork = true;
      }
    } catch (error) {
      didError = true;
      abortRoot(root, error);
    }

    if (didError) continue;

    if (root.nextUnitOfWork) {
      enqueueRoot(root);
      continue;
    }

    if (!root.workInProgress) continue;

    if (root.renderVersion !== root.updateVersion) {
      root.workInProgress = null;
      root.deletions = [];
      enqueueRoot(root);
      continue;
    }

    try {
      commitRoot(root);
    } catch (error) {
      abortRoot(root, error);
      continue;
    }

    if (
      root.status === "unmounting" &&
      root.renderVersion === root.updateVersion
    ) {
      root.status = "unmounted";
      root.current = null;
      rootsByContainer.delete(root.container);
      allRoots.delete(root);
    } else if (root.renderVersion !== root.updateVersion) {
      enqueueRoot(root);
    }
  }

  if (scheduledRoots.length > 0) requestHostCallback();
}

function requestHostCallback() {
  if (hostCallback) return;

  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback((deadline) => {
      performWorkUntilDeadline(
        deadline || { didTimeout: false, timeRemaining: () => 5 },
      );
    });
    hostCallback = { kind: "idle", id };
    return;
  }

  const id = globalThis.setTimeout(() => {
    const start = performance.now();
    performWorkUntilDeadline({
      didTimeout: false,
      timeRemaining: () => Math.max(0, 5 - (performance.now() - start)),
    });
  }, 0);
  hostCallback = { kind: "timeout", id };
}

function cancelHostCallback() {
  if (!hostCallback) return;

  if (
    hostCallback.kind === "idle" &&
    typeof globalThis.cancelIdleCallback === "function"
  ) {
    globalThis.cancelIdleCallback(hostCallback.id);
  } else if (hostCallback.kind === "timeout") {
    globalThis.clearTimeout(hostCallback.id);
  }
  hostCallback = null;
}

export function getOrCreateRoot(container: HTMLElement): FiberRoot {
  const existingRoot = rootsByContainer.get(container);
  if (existingRoot && existingRoot.status !== "unmounted") return existingRoot;

  let root: FiberRoot;
  root = {
    container,
    element: null,
    current: null,
    workInProgress: null,
    nextUnitOfWork: null,
    deletions: [],
    updateVersion: 0,
    renderVersion: 0,
    status: "active",
    schedule: () => scheduleUpdateOnRoot(root),
    flush: () => enqueueRoot(root),
  };

  rootsByContainer.set(container, root);
  allRoots.add(root);
  return root;
}

export function updateContainer(element: ReactNode, root: FiberRoot) {
  if (root.status !== "active") {
    throw new Error("Cannot update an unmounted Koact root.");
  }

  root.element = element;
  root.schedule();
}

export function unmountContainer(root: FiberRoot) {
  if (root.status !== "active") return;

  root.status = "unmounting";
  root.element = null;
  root.updateVersion++;
  scheduleBatchedRoot(root);
}

export function __resetSchedulerForTests() {
  __resetBatchingForTests();
  cancelHostCallback();
  scheduledRoots.length = 0;
  scheduledRootSet.clear();
  allRoots.forEach((root) => {
    root.status = "unmounted";
    root.current = null;
    root.workInProgress = null;
    root.nextUnitOfWork = null;
    root.deletions = [];
  });
  allRoots.clear();
  rootsByContainer = new WeakMap();
}
