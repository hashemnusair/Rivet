"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApi } from "@/lib/api/client";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { AssistBlockReason, AssistJudgmentRequest, AssistJudgmentResult, AssistStatus } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { canonicalJson } from "../../../convex/jevAnswers";

/**
 * One Jev judgment for one record, the way a page consumes it.
 *
 * The hook reads the shared status first and asks nothing while the
 * environment, the feature or the gym is switched off, so a page without Jev
 * renders exactly as before. Identical in-flight requests share one call, a
 * newer subject invalidates the older answer before it arrives, an
 * `in_progress` answer is retried a bounded number of times, and every refusal
 * or failure lands in a typed state the page can ignore.
 */
export type AssistReadyResult = Extract<AssistJudgmentResult, { status: "ready" }>;

export type AssistSuggestionState =
  | { status: "idle" }
  | { status: "disabled"; reason?: AssistBlockReason; message?: string }
  | { status: "loading" }
  | { status: "ready"; result: AssistReadyResult }
  | { status: "unavailable"; message: string; retryable: boolean }
  | { status: "stale"; message: string };

export interface UseAssistJudgmentOptions {
  questionKey: string;
  subject?: AssistJudgmentRequest["subject"];
  /** False while the page has nothing to ask about yet. */
  enabled?: boolean;
  /** Ask as soon as the switches allow it (default). False leaves it to `request()`. */
  auto?: boolean;
}

export interface UseAssistJudgmentResult {
  state: AssistSuggestionState;
  status?: AssistStatus;
  /** Whether this question's feature could be answered right now. */
  featureReady: boolean;
  request: () => void;
  dismiss: () => void;
  dismissed: boolean;
}

const MAX_IN_PROGRESS_RETRIES = 4;
const inFlight = new Map<string, Promise<AssistJudgmentResult>>();

export function assistRequestKey(questionKey: string, subject: AssistJudgmentRequest["subject"]): string {
  return `${questionKey}|${canonicalJson(subject ?? {})}`;
}

function sharedJudgment(key: string, input: AssistJudgmentRequest): Promise<AssistJudgmentResult> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = getApi().requestAssistJudgment(input).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useAssistJudgment({ questionKey, subject, enabled = true, auto = true }: UseAssistJudgmentOptions): UseAssistJudgmentResult {
  const statusQuery = useApiQuery(qk.assistStatus, (api) => api.getAssistStatus(), { staleTime: 60_000, refetchOnWindowFocus: false, enabled });
  const status = statusQuery.data;
  const feature = status?.features.find((candidate) => candidate.questions.some((question) => question.key === questionKey));
  const featureReady = Boolean(feature?.ready);
  const key = assistRequestKey(questionKey, subject);
  const subjectRef = useRef(subject);
  useEffect(() => {
    subjectRef.current = subject;
  });
  const sequence = useRef(0);
  const [dismissed, setDismissed] = useState(false);
  const [state, setState] = useState<AssistSuggestionState>({ status: "idle" });

  const request = useCallback(() => {
    if (!enabled) return;
    const mine = ++sequence.current;
    setDismissed(false);
    setState({ status: "loading" });
    let attempts = 0;
    const run = async (): Promise<void> => {
      let result: AssistJudgmentResult;
      try {
        result = await sharedJudgment(key, { questionKey, subject: subjectRef.current });
      } catch (error) {
        if (mine !== sequence.current) return;
        setState({ status: "unavailable", message: isApiError(error) ? error.message : "Suggestions are unavailable right now.", retryable: true });
        return;
      }
      // A newer request (different subject, refresh or dismiss) owns the screen now.
      if (mine !== sequence.current) return;
      if (result.status === "in_progress") {
        if (attempts++ >= MAX_IN_PROGRESS_RETRIES) {
          setState({ status: "unavailable", message: "The suggestion is still being prepared. Try again in a moment.", retryable: true });
          return;
        }
        await wait(result.retryAfterMs);
        if (mine !== sequence.current) return;
        return run();
      }
      if (result.status === "ready") setState({ status: "ready", result });
      else if (result.status === "blocked") setState({ status: "disabled", reason: result.reason, message: result.message });
      else if (result.status === "stale") setState({ status: "stale", message: result.message });
      else setState({ status: "unavailable", message: result.message, retryable: result.retryable });
    };
    void run();
  }, [enabled, key, questionKey]);

  const dismiss = useCallback(() => {
    sequence.current += 1;
    setDismissed(true);
    setState({ status: "idle" });
  }, []);

  useEffect(() => {
    // A new subject invalidates whatever is on screen; the previous answer must not linger.
    sequence.current += 1;
    setState({ status: "idle" });
    setDismissed(false);
  }, [key]);

  useEffect(() => {
    if (!auto || !enabled || dismissed || !status) return;
    if (!featureReady) {
      setState((current) => (current.status === "idle" ? { status: "disabled", reason: feature?.blockedReason ?? status.blockedReason, message: status.blockedMessage } : current));
      return;
    }
    if (state.status === "idle") request();
  }, [auto, enabled, dismissed, status, featureReady, feature?.blockedReason, state.status, request]);

  return { state, status, featureReady, request, dismiss, dismissed };
}
