import type { ExperienceStatus } from "@/lib/providers/experience-provider";

export const PUBLIC_EXPERIENCE_FIRST_SNAPSHOT_TIMEOUT_MS = 8_000;

export type ExperienceSubscription<T> = (
  onValue: (value: T) => void,
  onError: (error: unknown) => void,
) => Promise<() => void>;

/**
 * Guard a live public subscription with one bounded first-snapshot wait.
 *
 * The returned disposer is deliberately idempotent. A transport may resolve
 * its unsubscribe function after the React effect has already been cleaned up
 * (the mock adapter does this while its simulated latency is pending), so the
 * late disposer is invoked immediately in that case. After disposal neither a
 * late snapshot nor a late error can update the consumer.
 */
export function startExperienceSubscription<T>({
  subscribe,
  onValue,
  onError,
  label,
  timeoutMs = PUBLIC_EXPERIENCE_FIRST_SNAPSHOT_TIMEOUT_MS,
}: {
  subscribe: ExperienceSubscription<T>;
  onValue: (value: T) => void;
  onError: (error: unknown) => void;
  label: string;
  timeoutMs?: number;
}): () => void {
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeCalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const callUnsubscribe = () => {
    if (unsubscribe && !unsubscribeCalled) {
      unsubscribeCalled = true;
      unsubscribe();
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    callUnsubscribe();
  };

  const fail = (error: unknown) => {
    if (disposed) return;
    disposed = true;
    clearTimer();
    callUnsubscribe();
    onError(error);
  };

  const receive = (value: T) => {
    if (disposed) return;
    clearTimer();
    onValue(value);
  };

  timer = setTimeout(() => {
    fail(new Error(`Timed out waiting for the ${label} to respond. Please retry.`));
  }, timeoutMs);

  let subscription: Promise<() => void>;
  try {
    subscription = subscribe(receive, fail);
  } catch (error) {
    fail(error);
    return dispose;
  }

  void subscription
    .then((nextUnsubscribe) => {
      if (disposed) {
        nextUnsubscribe();
        return;
      }
      unsubscribe = nextUnsubscribe;
    })
    .catch(fail);

  return dispose;
}

export function refreshFailureState(hadRenderedData: boolean, message: string): {
  status: ExperienceStatus;
  message: string;
  showStaleNotice: boolean;
} {
  return {
    status: hadRenderedData ? "ready" : "error",
    message,
    showStaleNotice: hadRenderedData,
  };
}
