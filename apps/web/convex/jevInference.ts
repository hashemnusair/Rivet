"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { runJevEvaluation } from "./jevAdapter";
import { evaluateJevFixture, jevLeaseKey } from "./jevAnswers";
import { getJevQuestion } from "./jevQuestions";
import type { JevJudgeResult } from "./jevRegistry";
import type { JevPrepareResult } from "./jev";

/**
 * The authenticated entry point for one Jev judgment. The action itself holds
 * no authority: `internal.jev.prepare` resolves the actor, checks the
 * question's permission and every switch, loads the state server-side and
 * answers from cache when it can; `begin` takes a bounded lease and counts
 * the request; the adapter (or the fixture) produces a validated judgment;
 * `complete` rejects a stale result and stores the rest. Any refusal comes
 * back as a typed status so the page can fall back to its normal workflow.
 */
export const judge = action({
  args: {
    organizationId: v.optional(v.string()),
    activeBranchId: v.optional(v.string()),
    correlationId: v.string(),
    questionKey: v.string(),
    subject: v.optional(v.any()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevJudgeResult> => {
    const prepared: JevPrepareResult = await ctx.runQuery(internal.jev.prepare, args);
    if (prepared.status !== "prepared") return prepared.result;
    const request = prepared.request;
    const question = getJevQuestion(request.questionKey);
    if (!question) return { status: "blocked", reason: "unknown_question", message: "This suggestion is not registered." };

    const began = await ctx.runMutation(internal.jev.begin, {
      organizationDocId: request.organizationDocId,
      userId: request.userId,
      feature: question.feature,
      leaseKey: jevLeaseKey(request.questionKey, request.scopeKey, request.stateHash),
      correlationId: args.correlationId,
      mode: request.mode,
      timeoutMs: request.timeoutMs,
    });
    if (began.status !== "started") return began.result;

    // A simulated failure (the Settings synthetic check) never reaches the gateway, whatever the mode.
    const outcome = request.mode === "fixture" || request.simulate
      ? evaluateJevFixture(question, request.simulate, 0, { state: request.state, candidates: request.candidates })
      : await runJevEvaluation({
          question,
          state: request.state,
          candidates: request.candidates,
          timeoutMs: request.timeoutMs,
          zeroDataRetention: request.zeroDataRetention,
          correlationId: args.correlationId,
        });

    if (!outcome.ok) {
      await ctx.runMutation(internal.jev.fail, { requestId: began.requestId, reason: outcome.reason, message: outcome.detail ?? outcome.message, latencyMs: outcome.latencyMs, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, reportedCostUsd: outcome.reportedCostUsd, gatewayAttempted: request.mode === "live" && !request.simulate });
      return { status: "unavailable", reason: outcome.reason, message: outcome.message, retryable: outcome.retryable, correlationId: args.correlationId };
    }

    try {
      return await ctx.runMutation(internal.jev.complete, {
        requestId: began.requestId,
        organizationId: args.organizationId,
        activeBranchId: args.activeBranchId,
        correlationId: args.correlationId,
        questionKey: request.questionKey,
        subject: args.subject,
        stateHash: request.stateHash,
        source: request.simulate ? "fixture" : request.mode,
        judgment: outcome.judgment,
        modelId: outcome.modelId,
        modelVersion: outcome.modelVersion,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        reportedCostUsd: outcome.reportedCostUsd,
        latencyMs: outcome.latencyMs,
        warnings: outcome.warnings,
      });
    } catch (error) {
      // The caller's access changed in a way `complete` refuses: release the
      // lease and keep the usage rather than leaving the row pending.
      await ctx.runMutation(internal.jev.fail, { requestId: began.requestId, reason: "request_invalid", message: error instanceof Error ? error.message.slice(0, 500) : "The suggestion could not be completed.", latencyMs: outcome.latencyMs, inputTokens: outcome.inputTokens, outputTokens: outcome.outputTokens, reportedCostUsd: outcome.reportedCostUsd, gatewayAttempted: request.mode === "live" && !request.simulate });
      return { status: "unavailable", reason: "request_invalid", message: "The suggestion could not be completed. Refresh and ask again.", retryable: true, correlationId: args.correlationId };
    }
  },
});
