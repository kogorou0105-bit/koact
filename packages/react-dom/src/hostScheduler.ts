import {
  isHigherPriorityLane,
  NoLane,
  SyncLane,
  type Lane,
} from "./lanes";

type HostCallbackHandle =
  | { kind: "microtask"; generation: number }
  | { kind: "idle"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> };

type HostWorkCallback = (deadline: IdleDeadline, priority: Lane) => void;

let hostCallback: HostCallbackHandle | null = null;
let hostCallbackPriority: Lane = NoLane;
let hostCallbackGeneration = 0;

function enqueueMicrotask(callback: () => void) {
  if (typeof globalThis.queueMicrotask === "function") {
    globalThis.queueMicrotask(callback);
  } else {
    void Promise.resolve().then(callback);
  }
}

function runHostCallback(
  generation: number,
  priority: Lane,
  deadline: IdleDeadline,
  callback: HostWorkCallback,
) {
  if (generation !== hostCallbackGeneration) return;

  hostCallback = null;
  hostCallbackPriority = NoLane;
  callback(deadline, priority);
}

export function requestHostCallback(
  priority: Lane,
  callback: HostWorkCallback,
) {
  if (priority === NoLane) return;

  if (hostCallback) {
    if (!isHigherPriorityLane(priority, hostCallbackPriority)) return;
    cancelHostCallback();
  }

  const generation = ++hostCallbackGeneration;
  hostCallbackPriority = priority;

  if (priority === SyncLane) {
    hostCallback = { kind: "microtask", generation };
    enqueueMicrotask(() => {
      runHostCallback(
        generation,
        priority,
        {
          didTimeout: true,
          timeRemaining: () => Number.POSITIVE_INFINITY,
        },
        callback,
      );
    });
    return;
  }

  if (typeof globalThis.requestIdleCallback === "function") {
    const id = globalThis.requestIdleCallback((deadline) => {
      runHostCallback(
        generation,
        priority,
        deadline || { didTimeout: false, timeRemaining: () => 5 },
        callback,
      );
    });
    hostCallback = { kind: "idle", id };
    return;
  }

  const id = globalThis.setTimeout(() => {
    const start = performance.now();
    runHostCallback(
      generation,
      priority,
      {
        didTimeout: false,
        timeRemaining: () => Math.max(0, 5 - (performance.now() - start)),
      },
      callback,
    );
  }, 0);
  hostCallback = { kind: "timeout", id };
}

export function cancelHostCallback() {
  if (!hostCallback) return;

  hostCallbackGeneration++;
  if (
    hostCallback.kind === "idle" &&
    typeof globalThis.cancelIdleCallback === "function"
  ) {
    globalThis.cancelIdleCallback(hostCallback.id);
  } else if (hostCallback.kind === "timeout") {
    globalThis.clearTimeout(hostCallback.id);
  }
  hostCallback = null;
  hostCallbackPriority = NoLane;
}
