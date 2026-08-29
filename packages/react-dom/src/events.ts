import type { Lane } from "./lanes";
import type { Fiber } from "./types";

export interface SchedulerEvent {
  rootId: number;
  lane: Lane;
  timestamp: number;
  processedFibers: number;
}

export interface TimedRenderEvent extends SchedulerEvent {
  elapsedTime: number;
}

export interface RenderAbortEvent extends TimedRenderEvent {
  nextLane: Lane;
  reason: "error" | "higher-priority-update" | "same-priority-update";
}

export interface CommitEvent extends TimedRenderEvent {
  root: Fiber;
  deletions: Fiber[];
}

export interface KoactEventMap {
  "update-scheduled": SchedulerEvent;
  "render-start": SchedulerEvent;
  "render-yield": TimedRenderEvent;
  "render-abort": RenderAbortEvent;
  commit: CommitEvent;
}

type Callback<T> = (data: T) => void;

class EventEmitter {
  private listeners = new Map<
    keyof KoactEventMap,
    Set<Callback<KoactEventMap[keyof KoactEventMap]>>
  >();

  on<Event extends keyof KoactEventMap>(
    event: Event,
    callback: Callback<KoactEventMap[Event]>,
  ) {
    let callbacks = this.listeners.get(event);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(event, callbacks);
    }
    callbacks.add(callback as Callback<KoactEventMap[keyof KoactEventMap]>);

    return () => {
      callbacks.delete(
        callback as Callback<KoactEventMap[keyof KoactEventMap]>,
      );
      if (callbacks.size === 0) this.listeners.delete(event);
    };
  }

  emit<Event extends keyof KoactEventMap>(
    event: Event,
    data: KoactEventMap[Event],
  ) {
    const callbacks = this.listeners.get(event);
    callbacks?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Koact] ${String(event)} listener failed.`, error);
      }
    });
  }
}

export function getEventTimestamp() {
  return typeof globalThis.performance?.now === "function"
    ? globalThis.performance.now()
    : Date.now();
}

export const KoactEvents = new EventEmitter();
