import { describe, expect, it, vi } from "vitest";
import { startExperienceSubscription, refreshFailureState } from "./experience-refresh";

describe("experience refresh recovery", () => {
  it("fails closed when the first live snapshot cannot be loaded", () => {
    expect(refreshFailureState(false, "Convex unavailable")).toEqual({
      status: "error",
      message: "Convex unavailable",
      showStaleNotice: false,
    });
  });

  it("keeps a rendered snapshot and exposes a stale notice after a refresh failure", () => {
    expect(refreshFailureState(true, "Temporary network failure")).toEqual({
      status: "ready",
      message: "Temporary network failure",
      showStaleNotice: true,
    });
  });

  it("clears the first-snapshot timer after an immediate success", async () => {
    vi.useFakeTimers();
    try {
      const onValue = vi.fn();
      const onError = vi.fn();
      const unsubscribe = vi.fn();
      const dispose = startExperienceSubscription({
        label: "live catalog",
        timeoutMs: 10,
        subscribe: async (receive) => {
          receive(["Starter"]);
          return unsubscribe;
        },
        onValue,
        onError,
      });

      await Promise.resolve();
      vi.advanceTimersByTime(20);
      expect(onValue).toHaveBeenCalledWith(["Starter"]);
      expect(onError).not.toHaveBeenCalled();

      dispose();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a bounded initial timeout and ignores late callbacks", async () => {
    vi.useFakeTimers();
    try {
      const onValue = vi.fn();
      const onError = vi.fn();
      let receive: ((value: string[]) => void) | undefined;
      let resolveSubscription!: (unsubscribe: () => void) => void;
      const subscription = new Promise<() => void>((resolve) => { resolveSubscription = resolve; });
      const unsubscribe = vi.fn();
      startExperienceSubscription({
        label: "live gym directory",
        timeoutMs: 10,
        subscribe: (nextReceive) => {
          receive = nextReceive;
          return subscription;
        },
        onValue,
        onError,
      });

      vi.advanceTimersByTime(10);
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect((onError.mock.calls[0]?.[0] as Error).message).toMatch(/timed out/i);

      receive?.(["late"]);
      expect(onValue).not.toHaveBeenCalled();
      resolveSubscription(unsubscribe);
      await Promise.resolve();
      await Promise.resolve();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans up a listener and timer when disposed before the transport resolves", async () => {
    vi.useFakeTimers();
    try {
      const onValue = vi.fn();
      const onError = vi.fn();
      let receive: ((value: string[]) => void) | undefined;
      let resolveSubscription!: (unsubscribe: () => void) => void;
      const subscription = new Promise<() => void>((resolve) => { resolveSubscription = resolve; });
      const unsubscribe = vi.fn();
      const dispose = startExperienceSubscription({
        label: "live gym directory",
        timeoutMs: 10,
        subscribe: (nextReceive) => {
          receive = nextReceive;
          return subscription;
        },
        onValue,
        onError,
      });

      dispose();
      vi.advanceTimersByTime(20);
      expect(onError).not.toHaveBeenCalled();
      receive?.(["disposed"]);
      expect(onValue).not.toHaveBeenCalled();

      resolveSubscription(unsubscribe);
      await Promise.resolve();
      await Promise.resolve();
      expect(unsubscribe).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops a failed stream so it cannot deliver duplicate updates", async () => {
    const onValue = vi.fn();
    const onError = vi.fn();
    let fail!: (error: Error) => void;
    const unsubscribe = vi.fn();
    const dispose = startExperienceSubscription({
      label: "live catalog",
      timeoutMs: 100,
      subscribe: async (_receive, onSubscribeError) => {
        fail = onSubscribeError;
        return unsubscribe;
      },
      onValue,
      onError,
    });

    await Promise.resolve();
    await Promise.resolve();
    fail(new Error("subscription failed"));
    expect(onError).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
    dispose();
    fail(new Error("late failure"));
    expect(onError).toHaveBeenCalledOnce();
  });
});
