import { afterEach, beforeEach, vi } from "vitest";
import type { Mock } from "vitest";
import React from "@koact/react";
import { __resetSchedulerForTests } from "../scheduler";

export const h = React.createElement;

export async function flushWork() {
  await vi.runAllTimersAsync();
}

type RuntimeGlobals = {
  requestIdleCallback: typeof globalThis.requestIdleCallback;
  cancelIdleCallback: typeof globalThis.cancelIdleCallback;
  reportError: typeof globalThis.reportError;
  hasRequestIdleCallback: boolean;
  hasCancelIdleCallback: boolean;
  hasReportError: boolean;
};

function restoreGlobal<
  K extends keyof Pick<
    typeof globalThis,
    "requestIdleCallback" | "cancelIdleCallback" | "reportError"
  >,
>(name: K, value: (typeof globalThis)[K], existed: boolean) {
  if (existed) globalThis[name] = value;
  else Reflect.deleteProperty(globalThis, name);
}

export function setupRuntimeTests() {
  let globals: RuntimeGlobals;

  beforeEach(() => {
    globals = {
      requestIdleCallback: globalThis.requestIdleCallback,
      cancelIdleCallback: globalThis.cancelIdleCallback,
      reportError: globalThis.reportError,
      hasRequestIdleCallback: "requestIdleCallback" in globalThis,
      hasCancelIdleCallback: "cancelIdleCallback" in globalThis,
      hasReportError: "reportError" in globalThis,
    };
    vi.useFakeTimers();
    __resetSchedulerForTests();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    __resetSchedulerForTests();
    restoreGlobal(
      "requestIdleCallback",
      globals.requestIdleCallback,
      globals.hasRequestIdleCallback,
    );
    restoreGlobal(
      "cancelIdleCallback",
      globals.cancelIdleCallback,
      globals.hasCancelIdleCallback,
    );
    restoreGlobal("reportError", globals.reportError, globals.hasReportError);
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });
}

export function mockIdleCallbacks(): {
  pendingCallbacks: IdleRequestCallback[];
  cancelIdleCallback: Mock<() => void>;
} {
  const pendingCallbacks: IdleRequestCallback[] = [];
  let callbackId = 0;
  const cancelIdleCallback = vi.fn();

  globalThis.requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
    pendingCallbacks.push(callback);
    return ++callbackId;
  });
  globalThis.cancelIdleCallback = cancelIdleCallback;

  return { pendingCallbacks, cancelIdleCallback };
}
