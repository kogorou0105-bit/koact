type SchedulerEventName =
  | "update-scheduled"
  | "render-start"
  | "render-yield"
  | "render-abort"
  | "commit";

type CapturedEvent = {
  type: SchedulerEventName;
  rootId: number;
  lane: number;
  timestamp: number;
  elapsedTime?: number;
  processedFibers: number;
  nextLane?: number;
  reason?: string;
  deletions?: number;
};

type BenchmarkOptions = {
  warmupRuns?: number;
  measuredRuns?: number;
  interruptDelayMs?: number;
  settleDelayMs?: number;
  timeoutMs?: number;
};

type BenchmarkControls = {
  scheduleFilter: (value: string) => void;
  interruptCatalog: () => void;
  getRenderedCount: () => number;
  isReady: () => boolean;
  listSize: number;
  memoRows: boolean;
};

type RenderAttempt = {
  lane: number;
  outcome: "abort" | "commit";
  elapsedTime: number;
  processedFibers: number;
  yieldCount: number;
  reason?: string;
};

type BenchmarkSample = {
  phase: "warmup" | "measured";
  index: number;
  query: string;
  requestedAt: number;
  inputEnqueueToCommitMs: number;
  transitionEnqueueToCommitMs: number;
  interactionToSettledMs: number;
  transitionRenderMs: number;
  preemptionLatencyMs: number | null;
  yieldCount: number;
  abortReasons: string[];
  renderCount: number;
  commitCount: number;
  processedFibers: number;
  renderedRows: number;
  renderAttempts: RenderAttempt[];
  events: CapturedEvent[];
};

type NumericSummary = {
  median: number;
  p95: number;
  min: number;
  max: number;
};

type BenchmarkReport = {
  schemaVersion: 1;
  generatedAt: string;
  environment: {
    userAgent: string;
    platform: string;
    hardwareConcurrency: number;
    viewport: { width: number; height: number; devicePixelRatio: number };
  };
  parameters: Required<BenchmarkOptions> & {
    listSize: number;
    queries: string[];
    memoRows: boolean;
  };
  roots: { control: number; catalog: number };
  summary: {
    inputEnqueueToCommitMs: NumericSummary;
    transitionEnqueueToCommitMs: NumericSummary;
    interactionToSettledMs: NumericSummary;
    transitionRenderMs: NumericSummary;
    preemptionLatencyMs: NumericSummary | null;
    renderCount: NumericSummary;
    commitCount: NumericSummary;
    processedFibers: NumericSummary;
    totalYields: number;
    totalAborts: number;
    samplesWithPreemption: number;
  };
  samples: BenchmarkSample[];
};

declare global {
  interface Window {
    __KOACT_BENCHMARK__?: {
      run: (options?: BenchmarkOptions) => Promise<BenchmarkReport>;
    };
  }
}

const DefaultLane = 2;
const TransitionLane = 4;
const capturedEvents: CapturedEvent[] = [];
let controlRootId: number | null = null;
let catalogRootId: number | null = null;
let isRunning = false;
let sampleEventListener: ((event: CapturedEvent) => void) | null = null;

const round = (value: number) => Math.round(value * 1000) / 1000;

const summarize = (values: number[]): NumericSummary => {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
      : sorted[midpoint];
  const percentile = (value: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];

  return {
    median: round(median),
    p95: round(percentile(0.95)),
    min: round(sorted[0]),
    max: round(sorted.at(-1)!),
  };
};

const validateOptions = (options: Required<BenchmarkOptions>) => {
  const minimums: Array<[keyof BenchmarkOptions, number]> = [
    ["warmupRuns", 0],
    ["measuredRuns", 1],
    ["interruptDelayMs", 0],
    ["settleDelayMs", 0],
    ["timeoutMs", 1],
  ];
  minimums.forEach(([name, minimum]) => {
    const value = options[name];
    if (!Number.isInteger(value) || value < minimum) {
      throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
    }
  });
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const normalizeEvent = (
  type: string,
  data: unknown,
): CapturedEvent | null => {
  if (!data || typeof data !== "object") return null;
  if (
    type !== "update-scheduled" &&
    type !== "render-start" &&
    type !== "render-yield" &&
    type !== "render-abort" &&
    type !== "commit"
  ) {
    return null;
  }

  const payload = data as Record<string, unknown>;
  if (
    typeof payload.rootId !== "number" ||
    typeof payload.lane !== "number" ||
    typeof payload.timestamp !== "number" ||
    typeof payload.processedFibers !== "number"
  ) {
    return null;
  }

  const event: CapturedEvent = {
    type,
    rootId: payload.rootId,
    lane: payload.lane,
    timestamp: payload.timestamp,
    processedFibers: payload.processedFibers,
  };

  if (typeof payload.elapsedTime === "number") {
    event.elapsedTime = payload.elapsedTime;
  }
  if (typeof payload.nextLane === "number") event.nextLane = payload.nextLane;
  if (typeof payload.reason === "string") event.reason = payload.reason;
  if (Array.isArray(payload.deletions)) {
    event.deletions = payload.deletions.length;
  }

  if (type === "commit") {
    const root = payload.root as { dom?: unknown } | undefined;
    if (root?.dom instanceof HTMLElement) {
      if (root.dom.id === "controls-root") controlRootId = payload.rootId;
      if (root.dom.id === "results-root") catalogRootId = payload.rootId;
    }
  }

  return event;
};

const waitUntil = async (
  predicate: () => boolean,
  timeoutMs: number,
  message: string,
) => {
  const expiresAt = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= expiresAt) throw new Error(message);
    await delay(8);
  }
};

const findLastEvent = (
  events: CapturedEvent[],
  predicate: (event: CapturedEvent) => boolean,
) => {
  for (let index = events.length - 1; index >= 0; index--) {
    if (predicate(events[index])) return events[index];
  }
  return undefined;
};

const collectRenderAttempts = (events: CapturedEvent[]) => {
  const attempts: RenderAttempt[] = [];
  let activeAttempt:
    | { lane: number; yieldCount: number }
    | undefined;

  events.forEach((event) => {
    if (event.type === "render-start") {
      activeAttempt = { lane: event.lane, yieldCount: 0 };
      return;
    }
    if (!activeAttempt || event.lane !== activeAttempt.lane) return;
    if (event.type === "render-yield") {
      activeAttempt.yieldCount++;
      return;
    }
    if (event.type !== "render-abort" && event.type !== "commit") return;

    attempts.push({
      lane: activeAttempt.lane,
      outcome: event.type === "commit" ? "commit" : "abort",
      elapsedTime: round(event.elapsedTime ?? 0),
      processedFibers: event.processedFibers,
      yieldCount: activeAttempt.yieldCount,
      ...(event.reason ? { reason: event.reason } : {}),
    });
    activeAttempt = undefined;
  });

  return attempts;
};

const runSample = async (
  controls: BenchmarkControls,
  phase: BenchmarkSample["phase"],
  index: number,
  query: string,
  options: Required<BenchmarkOptions>,
) => {
  const startIndex = capturedEvents.length;
  const requestedAt = performance.now();
  let startTimeout = 0;
  let interruptTimer = 0;
  const interruptIssued = new Promise<void>((resolve, reject) => {
    startTimeout = window.setTimeout(() => {
      reject(
        new Error(
          `Benchmark sample ${index} did not start its Transition render.`,
        ),
      );
    }, options.timeoutMs);
    sampleEventListener = (event) => {
      if (
        event.type !== "render-start" ||
        event.rootId !== catalogRootId ||
        event.lane !== TransitionLane
      ) {
        return;
      }

      sampleEventListener = null;
      window.clearTimeout(startTimeout);
      interruptTimer = window.setTimeout(() => {
        try {
          controls.interruptCatalog();
          resolve();
        } catch (error) {
          reject(error);
        }
      }, options.interruptDelayMs);
    };
  });

  try {
    controls.scheduleFilter(query);
    await interruptIssued;
  } finally {
    sampleEventListener = null;
    window.clearTimeout(startTimeout);
    window.clearTimeout(interruptTimer);
  }

  await waitUntil(
    () => {
      const events = capturedEvents.slice(startIndex);
      return (
        events.some(
          (event) =>
            event.type === "commit" &&
            event.rootId === catalogRootId &&
            event.lane === DefaultLane,
        ) &&
        events.some(
          (event) =>
            event.type === "commit" &&
            event.rootId === catalogRootId &&
            event.lane === TransitionLane,
        )
      );
    },
    options.timeoutMs,
    `Benchmark sample ${index} timed out.`,
  );

  const events = capturedEvents.slice(startIndex);
  const catalogEvents = events.filter(
    (event) => event.rootId === catalogRootId,
  );
  const controlEvents = events.filter(
    (event) => event.rootId === controlRootId,
  );
  const controlSchedule = controlEvents.find(
    (event) => event.type === "update-scheduled" && event.lane === DefaultLane,
  );
  const controlCommit = findLastEvent(
    controlEvents,
    (event) => event.type === "commit" && event.lane === DefaultLane,
  );
  const transitionSchedule = catalogEvents.find(
    (event) => event.type === "update-scheduled" && event.lane === TransitionLane,
  );
  const defaultSchedule = catalogEvents.find(
    (event) => event.type === "update-scheduled" && event.lane === DefaultLane,
  );
  const transitionCommit = findLastEvent(
    catalogEvents,
    (event) => event.type === "commit" && event.lane === TransitionLane,
  );
  const defaultCommit = findLastEvent(
    catalogEvents,
    (event) => event.type === "commit" && event.lane === DefaultLane,
  );
  const preemption = catalogEvents.find(
    (event) =>
      event.type === "render-abort" &&
      event.reason === "higher-priority-update" &&
      event.nextLane === DefaultLane,
  );

  if (
    !controlSchedule ||
    !controlCommit ||
    !transitionSchedule ||
    !transitionCommit ||
    !defaultCommit
  ) {
    throw new Error(`Benchmark sample ${index} did not produce required events.`);
  }

  const settledAt = Math.max(
    transitionCommit.timestamp,
    defaultCommit.timestamp,
  );
  const renderAttempts = collectRenderAttempts(catalogEvents);
  const renderedRows = controls.getRenderedCount();
  if (renderedRows !== controls.listSize) {
    throw new Error(
      `Benchmark sample ${index} rendered ${renderedRows} of ${controls.listSize} rows.`,
    );
  }
  const sample: BenchmarkSample = {
    phase,
    index,
    query,
    requestedAt: round(requestedAt),
    inputEnqueueToCommitMs: round(
      controlCommit.timestamp - controlSchedule.timestamp,
    ),
    transitionEnqueueToCommitMs: round(
      transitionCommit.timestamp - transitionSchedule.timestamp,
    ),
    interactionToSettledMs: round(settledAt - requestedAt),
    transitionRenderMs: round(transitionCommit.elapsedTime ?? 0),
    preemptionLatencyMs:
      preemption && defaultSchedule
        ? round(preemption.timestamp - defaultSchedule.timestamp)
        : null,
    yieldCount: catalogEvents.filter(
      (event) => event.type === "render-yield",
    ).length,
    abortReasons: catalogEvents
      .filter((event) => event.type === "render-abort")
      .map((event) => event.reason || "unknown"),
    renderCount: catalogEvents.filter(
      (event) => event.type === "render-start",
    ).length,
    commitCount: catalogEvents.filter((event) => event.type === "commit").length,
    processedFibers: renderAttempts.reduce(
      (total, attempt) => total + attempt.processedFibers,
      0,
    ),
    renderedRows,
    renderAttempts,
    events,
  };

  await delay(options.settleDelayMs);
  return sample;
};

export function installBenchmarkRunner(controls: BenchmarkControls) {
  const previousHook = window.__KOACT_DEVTOOLS_HOOK__;
  window.__KOACT_DEVTOOLS_HOOK__ = {
    emit(type, data) {
      try {
        const event = normalizeEvent(type, data);
        if (event) {
          capturedEvents.push(event);
          sampleEventListener?.(event);
        }
      } finally {
        try {
          previousHook?.emit(type, data);
        } catch (error) {
          console.error("Existing DevTools hook failed during benchmark.", error);
        }
      }
    },
  };

  window.__KOACT_BENCHMARK__ = {
    async run(inputOptions = {}) {
      if (isRunning) throw new Error("Concurrent benchmark is already running.");

      const options: Required<BenchmarkOptions> = {
        warmupRuns: inputOptions.warmupRuns ?? 2,
        measuredRuns: inputOptions.measuredRuns ?? 20,
        interruptDelayMs: inputOptions.interruptDelayMs ?? 8,
        settleDelayMs: inputOptions.settleDelayMs ?? 24,
        timeoutMs: inputOptions.timeoutMs ?? 15000,
      };
      validateOptions(options);
      isRunning = true;
      const queries = ["record", ""];
      const startedAt = new Date().toISOString();

      try {
        await waitUntil(
          () =>
            controls.isReady() &&
            controlRootId !== null &&
            catalogRootId !== null,
          options.timeoutMs,
          "Concurrent lab did not become ready.",
        );
        capturedEvents.length = 0;

        const samples: BenchmarkSample[] = [];
        const totalRuns = options.warmupRuns + options.measuredRuns;
        for (let index = 0; index < totalRuns; index++) {
          samples.push(
            await runSample(
              controls,
              index < options.warmupRuns ? "warmup" : "measured",
              index,
              queries[index % queries.length],
              options,
            ),
          );
        }

        const measured = samples.filter((sample) => sample.phase === "measured");
        const preemptionLatencies = measured
          .map((sample) => sample.preemptionLatencyMs)
          .filter((value): value is number => value !== null);

        return {
          schemaVersion: 1,
          generatedAt: startedAt,
          environment: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio,
            },
          },
          parameters: {
            ...options,
            listSize: controls.listSize,
            queries,
            memoRows: controls.memoRows,
          },
          roots: { control: controlRootId!, catalog: catalogRootId! },
          summary: {
            inputEnqueueToCommitMs: summarize(
              measured.map((sample) => sample.inputEnqueueToCommitMs),
            ),
            transitionEnqueueToCommitMs: summarize(
              measured.map((sample) => sample.transitionEnqueueToCommitMs),
            ),
            interactionToSettledMs: summarize(
              measured.map((sample) => sample.interactionToSettledMs),
            ),
            transitionRenderMs: summarize(
              measured.map((sample) => sample.transitionRenderMs),
            ),
            preemptionLatencyMs: preemptionLatencies.length
              ? summarize(preemptionLatencies)
              : null,
            renderCount: summarize(
              measured.map((sample) => sample.renderCount),
            ),
            commitCount: summarize(
              measured.map((sample) => sample.commitCount),
            ),
            processedFibers: summarize(
              measured.map((sample) => sample.processedFibers),
            ),
            totalYields: measured.reduce(
              (total, sample) => total + sample.yieldCount,
              0,
            ),
            totalAborts: measured.reduce(
              (total, sample) => total + sample.abortReasons.length,
              0,
            ),
            samplesWithPreemption: preemptionLatencies.length,
          },
          samples,
        } satisfies BenchmarkReport;
      } finally {
        isRunning = false;
      }
    },
  };
}

export type { BenchmarkOptions, BenchmarkReport };
