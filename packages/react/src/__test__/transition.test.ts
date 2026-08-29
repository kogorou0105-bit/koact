import { beforeEach, describe, expect, it } from "vitest";
import React, {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  startTransition,
} from "../index";

const { SharedInternals } =
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

describe("startTransition", () => {
  beforeEach(() => {
    SharedInternals.currentTransition = null;
  });

  it("marks only the synchronous transition scope", () => {
    let transition: object | null = null;

    startTransition(() => {
      transition = SharedInternals.currentTransition;
    });

    expect(transition).not.toBeNull();
    expect(SharedInternals.currentTransition).toBeNull();
    expect(React.startTransition).toBe(startTransition);
  });

  it("restores the outer transition after a nested scope", () => {
    let outerTransition: object | null = null;
    let innerTransition: object | null = null;

    startTransition(() => {
      outerTransition = SharedInternals.currentTransition;
      startTransition(() => {
        innerTransition = SharedInternals.currentTransition;
      });
      expect(SharedInternals.currentTransition).toBe(outerTransition);
    });

    expect(innerTransition).not.toBe(outerTransition);
    expect(SharedInternals.currentTransition).toBeNull();
  });

  it("restores the transition state when the scope throws", () => {
    expect(() =>
      startTransition(() => {
        throw new Error("transition failed");
      }),
    ).toThrow("transition failed");

    expect(SharedInternals.currentTransition).toBeNull();
  });

  it("does not keep the transition across an async boundary", async () => {
    let beforeAwait: object | null = null;
    let afterAwait: object | null = null;
    let scopeDone!: Promise<void>;

    startTransition(() => {
      scopeDone = (async () => {
        beforeAwait = SharedInternals.currentTransition;
        await Promise.resolve();
        afterAwait = SharedInternals.currentTransition;
      })();
    });

    expect(beforeAwait).not.toBeNull();
    expect(SharedInternals.currentTransition).toBeNull();
    await scopeDone;
    expect(afterAwait).toBeNull();
  });
});
