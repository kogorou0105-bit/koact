import type { FiberRoot } from "./types";

const batchedRoots = new Set<FiberRoot>();
let batchDepth = 0;
let flushScheduled = false;
let generation = 0;

function enqueueMicrotask(callback: () => void) {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}

function flushBatchedRoots(expectedGeneration: number) {
  if (expectedGeneration !== generation) return;
  flushScheduled = false;

  if (batchDepth > 0) {
    ensureBatchFlushScheduled();
    return;
  }

  const roots = [...batchedRoots];
  batchedRoots.clear();
  roots.forEach((root) => root.flush());
}

function ensureBatchFlushScheduled() {
  if (flushScheduled || batchedRoots.size === 0) return;

  flushScheduled = true;
  const expectedGeneration = generation;
  enqueueMicrotask(() => flushBatchedRoots(expectedGeneration));
}

export function scheduleBatchedRoot(root: FiberRoot) {
  if (root.status === "unmounted") return;
  batchedRoots.add(root);
  if (batchDepth === 0) ensureBatchFlushScheduled();
}

export function batchedUpdates<Result>(scope: () => Result): Result {
  batchDepth++;
  try {
    return scope();
  } finally {
    batchDepth--;
    if (batchDepth === 0) ensureBatchFlushScheduled();
  }
}

export function __resetBatchingForTests() {
  generation++;
  batchDepth = 0;
  flushScheduled = false;
  batchedRoots.clear();
}
