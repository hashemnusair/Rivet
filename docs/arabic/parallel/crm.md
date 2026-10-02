# CRM Arabic completion

Implemented in `/Users/eliashreish/.codex/worktrees/complete-arabic-support/Rivet2` against approved Arabic revision 607. CRM routes and components use the registered `crmCompletion` catalog. Shared contract changes are limited to the member summary/session projections and CRM at-risk search paths listed below.

## Changed files

- `apps/web/src/app/(app)/crm/pipeline/page.tsx`
- `apps/web/src/app/(app)/crm/queues/page.tsx`
- `apps/web/src/app/(app)/crm/queues/page.test.tsx`
- `apps/web/src/app/(app)/crm/leads/[leadId]/lead-detail.client.tsx`
- `apps/web/src/app/(app)/members/[memberId]/member-detail.client.tsx` — primary-authorized one-file extension to pass the stored member preference.
- `apps/web/src/features/crm/contact-work-panel.tsx`
- `apps/web/src/features/crm/crm-labels.ts`
- `apps/web/src/features/crm/edit-lead-contact-dialog.tsx`
- `apps/web/src/features/crm/new-lead-dialog.tsx`
- `apps/web/src/features/crm/new-lead-dialog.test.tsx`
- `apps/web/src/features/crm/offer-work-panel.tsx`
- `apps/web/src/features/crm/whatsapp-handoff.tsx`
- `apps/web/src/features/crm/whatsapp-handoff.test.tsx`
- `apps/web/src/features/followup/follow-up-context.tsx` — final UI projection for known generated follow-up reasons/statuses and contact outcomes.
- `apps/web/src/features/followup/follow-up-labels.ts` — exact-value maps; unknown reasons/outcomes and old delivery history remain unchanged.
- `apps/web/src/features/followup/follow-up-labels.test.ts` — Arabic known-value, unknown-history and 12-hour clock invariants.
- `apps/web/src/lib/i18n/messages/en/crmCompletion.ts`
- `apps/web/src/lib/i18n/messages/ar/crmCompletion.ts`
- `apps/web/src/lib/domain/types.ts` — optional `MemberSummary.preferredLanguage` and `Session.organization.defaultLanguage`.
- `apps/web/convex/domain.ts` — canonical default in `buildSession`, member preference in both summary projections, and normalized at-risk candidate search.
- `apps/web/convex/domain.ts` — follow-up context projection now forwards only valid timeline `bodyMessage` descriptors into evidence.
- `apps/web/src/lib/mock/MockGymOSApi.ts` — matching session/summary projections and at-risk search.
- `apps/web/src/lib/mock/MockGymOSApi.test.ts` — Arabic name/digit search invariant.
- `apps/web/convex/renewalJobs.ts` — additive descriptors on known cancellation and suppression timeline bodies.
- `apps/web/convex/messagingWorker.ts` — maps only exact renewal suppression reasons; automation/provider diagnostics stay original.
- `apps/web/convex/classes.ts` — additive date descriptor for booked/waitlisted class timeline bodies.
- `apps/web/convex/followupAssist.ts` — keeps valid body descriptors and full generated source bodies in follow-up evidence.
- `apps/web/src/lib/i18n/system-messages.ts` — finite `renewalReason` enum mapping and exact legacy projections for known renewal reasons and class dates.
- `apps/web/src/features/followup/follow-up-context.tsx` — localizes evidence descriptors before excerpt truncation, keeping inserted bidi isolates balanced.
- Tests: `apps/web/convex/renewalJobs.test.ts`, `messagingWorker.test.ts`, `classBookings.test.ts`, `followupAssist.test.ts`, `apps/web/src/lib/i18n/system-messages.test.ts`, and `apps/web/src/features/followup/follow-up-context.test.tsx`.

## Decision and key mapping

- `lead`, `pipeline`, `follow-up`, `assigned-to`, `walk-in`, `trial`, `no-answer`, `not-interested`, `lost-lead`, and `converted`: pipeline, lead detail, quick capture, trial, loss, source, and bulk-owner copy use typed keys in `crmCompletion.pipeline.*`, `.newLead.*`, and `.lead.*`, plus the existing `domain.leadSource.*` / `domain.leadStage.*` mappings. The pipeline label follows the locked `مسار المبيعات`; the lead term follows `مهتم بالاشتراك`.
- `retention`, `at-risk`, `inactive-member`, and `followup-due`: queue filters, actions, risk priority/reasons, day counts, snoozes and renewal panels use `crmCompletion.queues.*`. Derived day facts use typed plurals with all six Arabic categories; the display does not discard `daysInactive`, `daysUntilExpiry`, or `daysSinceExpiry`.
- `whatsapp`, `message-draft`, `sent`, `message-failed`, and `offer`: CRM handoffs and offer dialogs use `crmCompletion.offers.*` and the existing `memberProfile.whatsapp.*` labels. The default handoff text comes from `followUpHandoffDraft` in `convex/followupAssist.ts`: recipient preference first, then canonical organization default, then English. UI locale is not an input. Lead records have no stored preferred-language field, so lead/offer drafts use the gym default.
- `consent`: sale-completion consent labels and explanation remain explicit in `crmCompletion.lead.marketingConsentNote` / `.marketingConsentAria`; consent defaults, permissions and whether a message can be sent are unchanged.
- `plural`, `digits`, `calendar`, `months`, `money-format`, and `time-format`: Arabic queue/selection/day counts use six-form plural objects and Latin digits; inputs normalize Arabic digits before validation; money remains integer minor units; displayed dates/times use the existing locale formatter and organization timezone. Search uses `searchKey` on both query and candidate fields for comparison only.
- `crm-labels.ts` maps known contact outcomes, lead sources/stages, risk kinds, and priorities to typed keys. Unknown or historical values remain verbatim. Stored user-authored notes, names, email/phone values, lost reasons, offer response text, and technical state/API keys are not rewritten.
- The follow-up panel uses `crmCompletion.followUpContext.*` for exact known renewal stop/suppression reasons, generated delivery statuses/details, and checkpoint labels; contact outcomes reuse the existing `memberProfile.contact.outcome.*` map. Free-form/unknown reasons and outcomes are preserved. `reminderTemplateUnavailableReason()` is not consumed by visible CRM/follow-up UI (only defined and unit-tested), so its current English sentence is not projected to staff.
- Generated cancellation/suppression reasons are localized through `communicationCompletion.timeline.value` with the typed `renewalReason` enum, mapped to the existing `crmCompletion.followUpContext.stopReason.*` and `.suppressionReason.*` leaves. The new descriptors are additive: event body/meta values and delivery state remain unchanged. Historical projection requires the exact event type plus known body/metadata; class booking dates require an exact valid ISO calendar date. Unknown stop reasons, authored text and non-renewal suppression diagnostics receive no descriptor.
- Class booked/waitlisted events retain their original ISO body and add a date descriptor. The follow-up API projection carries valid descriptors through `FollowUpTimelineLike` and `FollowUpEvidence`; the UI translates before clipping to 200 characters. Provider diagnostic text remains inside the translated failure sentence verbatim and directionally isolated.

## Preserved authored and historical content

- The system note `Moved to Did not answer on the Leads page.` and offer delivery reference metadata (`Branded public offer link · WhatsApp handoff` / `shared by hand`) remain unchanged for audit/history consistency.
- `whatsAppHandoffNotes` retains the original stable English timeline wording and exact opened-only semantics: `Opened WhatsApp with this message ready: “{message}”. RIVET did not send it and cannot confirm delivery.` The message excerpt remains the staff-prepared text; a locale switch does not rewrite it.
- User-authored notes and lost reasons remain verbatim. Canonical lead/contact/offer state values, consent, permission checks, idempotency, and business transitions are unchanged.
- No server communication templates were edited; those remain in the Claude communications packet.

## Validation

Focused CRM suite:

```sh
NEXT_PUBLIC_RIVET_ARABIC=1 pnpm --dir apps/web exec vitest run 'src/app/(app)/crm/pipeline/page.test.tsx' 'src/app/(app)/crm/queues/page.test.tsx' 'src/app/(app)/crm/leads/[leadId]/lead-detail.client.test.tsx' src/features/crm/new-lead-dialog.test.tsx src/features/crm/contact-work-panel.test.tsx src/features/crm/whatsapp-handoff.test.tsx
```

Result: 6 files passed, 31 tests passed. Locale-switch coverage verifies recipient-language drafts remain Arabic under an English UI, gym-default fallback, and preservation of the handoff date and edited message. New-lead coverage verifies Arabic amount digits convert to the unchanged JOD minor-unit API value while the draft survives a locale switch.

Arabic search invariant:

```sh
NEXT_PUBLIC_RIVET_ARABIC=1 pnpm --dir apps/web exec vitest run src/lib/mock/MockGymOSApi.test.ts -t 'matches Arabic member names and digits in the at-risk queue'
```

Result: 1 test passed. The test matches a stored `آمنة ١٢٣` name with `امنة 123` and confirms the stored text is not normalized in place.

Focused ESLint across the changed CRM, catalog, mock and shared projection paths passed. `pnpm --dir apps/web exec tsc --noEmit --pretty false` passed. `python3 docs/arabic/verify-lock.py` passed: revision 607, 247 exact agreements, approvals, checksum and registry match.

`NEXT_PUBLIC_RIVET_ARABIC=1 pnpm --dir apps/web exec vitest run src/lib/i18n/messages.test.ts` was also run. Catalogue key parity, leaf/plural structure, placeholder parity, Arabic plural placeholders, empty strings, accidental-English checks, and approved-decision mapping passed (12 tests).

Final follow-up UI audit:

```sh
pnpm --dir apps/web exec vitest run src/features/followup/follow-up-labels.test.ts src/features/followup/follow-up-context.test.tsx src/lib/i18n/messages.test.ts
pnpm --dir apps/web exec eslint src/features/followup/follow-up-context.tsx src/features/followup/follow-up-labels.ts src/features/followup/follow-up-labels.test.ts src/lib/i18n/messages/en/crmCompletion.ts src/lib/i18n/messages/ar/crmCompletion.ts --max-warnings 0
```

Result: 3 files, 16 tests passed; focused ESLint passed. Tests cover known Arabic stop/suppression/status/outcome labels, exact preservation for authored/unknown history, and deferred times formatted as `23:05` in English versus `11:05 م` in Arabic. Full app typecheck had passed before this final UI-only addendum; the primary agent owns the integrated typecheck gate.

Bounded generated-message/evidence closure:

```sh
pnpm --dir apps/web exec vitest run --configLoader runner src/lib/i18n/messages.test.ts src/lib/i18n/system-messages.test.ts src/lib/i18n/system-messages.timeline-completion.test.ts convex/followupAssist.test.ts convex/renewalJobs.test.ts convex/messagingWorker.test.ts convex/classBookings.test.ts src/features/followup/follow-up-context.test.tsx
pnpm --dir apps/web exec eslint convex/renewalJobs.ts convex/messagingWorker.ts convex/classes.ts convex/followupAssist.ts convex/domain.ts convex/renewalJobs.test.ts convex/messagingWorker.test.ts convex/classBookings.test.ts convex/followupAssist.test.ts src/lib/i18n/system-messages.ts src/lib/i18n/system-messages.test.ts src/features/followup/follow-up-context.tsx src/features/followup/follow-up-context.test.tsx
```

Result: 8 files passed, 77 tests passed; focused ESLint and `git diff --check` passed. The suite covers class date producers and legacy rendering, renewal stop/suppression producer descriptors and exact history fallback, source-gated messaging suppression, evidence descriptor survival, post-translation Arabic excerpt clipping, provider diagnostics, authored content, and catalogue parity. No whole-web or Convex typecheck was run in this closure; the primary agent owns integrated typechecks. Consent, delivery, authorization, idempotency and state transitions were not changed.

## Remaining limitation

Lead records have no stored preferred-language field, so CRM lead and offer drafts use the canonical gym default. Member-facing CRM queue and member-detail handoffs pass the member's stored preference. Neither path substitutes the staff UI locale.
