import { includesSomeLane, NoLane, type Lane, type Lanes } from "./lanes";
import type { StateAction, StateQueue, StateUpdate } from "./types";

export interface ProcessedUpdateQueue<State> {
  memoizedState: State;
  baseState: State;
  baseQueue: StateUpdate<State> | null;
}

export function createUpdate<State>(
  action: StateAction<State>,
  lane: Lane,
): StateUpdate<State> {
  const update = {
    action,
    lane,
    next: null as unknown as StateUpdate<State>,
  };
  update.next = update;
  return update;
}

export function enqueueUpdate<State>(
  queue: StateQueue<State>,
  action: StateAction<State>,
  lane: Lane,
) {
  const update = createUpdate(action, lane);
  const pending = queue.pending;

  if (!pending) {
    update.next = update;
  } else {
    update.next = pending.next;
    pending.next = update;
  }
  queue.pending = update;
  return update;
}

export function mergeUpdateQueues<State>(
  baseQueue: StateUpdate<State> | null,
  pendingQueue: StateUpdate<State> | null,
): StateUpdate<State> | null {
  if (!pendingQueue) return baseQueue;
  if (!baseQueue) return pendingQueue;

  const baseFirst = baseQueue.next;
  const pendingFirst = pendingQueue.next;
  baseQueue.next = pendingFirst;
  pendingQueue.next = baseFirst;
  return pendingQueue;
}

function cloneUpdate<State>(
  update: StateUpdate<State>,
  lane: Lane,
): StateUpdate<State> {
  return createUpdate(update.action, lane);
}

function applyAction<State>(state: State, action: StateAction<State>): State {
  return typeof action === "function"
    ? (action as (previousState: State) => State)(state)
    : action;
}

export function processUpdateQueue<State>(
  baseState: State,
  baseQueue: StateUpdate<State> | null,
  renderLanes: Lanes,
): ProcessedUpdateQueue<State> {
  if (!baseQueue) {
    return {
      memoizedState: baseState,
      baseState,
      baseQueue: null,
    };
  }

  const first = baseQueue.next;
  let update = first;
  let memoizedState = baseState;
  let nextBaseState = baseState;
  let nextBaseFirst: StateUpdate<State> | null = null;
  let nextBaseLast: StateUpdate<State> | null = null;

  do {
    const shouldSkip =
      update.lane !== NoLane &&
      !includesSomeLane(renderLanes, update.lane);

    if (shouldSkip) {
      const clone = cloneUpdate(update, update.lane);
      if (!nextBaseLast) {
        nextBaseFirst = nextBaseLast = clone;
        nextBaseState = memoizedState;
      } else {
        nextBaseLast.next = clone;
        nextBaseLast = clone;
      }
    } else {
      if (nextBaseLast) {
        const clone = cloneUpdate(update, NoLane);
        nextBaseLast.next = clone;
        nextBaseLast = clone;
      }
      memoizedState = applyAction(memoizedState, update.action);
    }

    update = update.next;
  } while (update !== first);

  if (!nextBaseLast || !nextBaseFirst) {
    return {
      memoizedState,
      baseState: memoizedState,
      baseQueue: null,
    };
  }

  nextBaseLast.next = nextBaseFirst;
  return {
    memoizedState,
    baseState: nextBaseState,
    baseQueue: nextBaseLast,
  };
}
