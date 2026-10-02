# Convex timeline completion packet

Date: 2026-10-03. Scope: additive presentation descriptors for generated timeline titles and bodies found in the timeline producer audit. The descriptors leave original stored English, user-authored names/reasons/references/goals/task text/tags, event IDs, metadata, authorization, payment arithmetic, credit ledgers, and audit semantics unchanged. Arabic presentation formats typed dates, wall-clock times, amounts, plurals, and finite enums; English continues to show stored English. Unrecognized enum values and malformed descriptors fall back to the stored text.

## Files changed

- `apps/web/convex/domain.ts` — descriptors added to PT credit lifecycle, retention snooze/contact outcomes, migration evidence, membership term/plan change, task creation/completion, tag changes, member merge, trial scheduling, offer delivery, and lead conversion producers. The primary agent owns unrelated export and membership-summary edits in this shared file.
- `apps/web/src/lib/i18n/messages/en/communicationCompletion.ts` and `apps/web/src/lib/i18n/messages/ar/communicationCompletion.ts` — matching typed leaves for the audited wrappers, including generic `timeline.value` for nested finite system values. Every new Arabic count leaf includes zero/one/two/few/many/other; count formatting remains Latin-digit.
- `apps/web/src/lib/i18n/system-messages.ts` — contact/call outcome enum lookup uses the approved `memberProfile.contact.outcome.*` leaves, rejects unknown values, and preserves the original title on fallback. The CRM packet separately owns its coordinated finite renewal/suppression value mapping in this shared presenter file.
- Producer-backed coverage: `apps/web/convex/domain.member-import.test.ts`, `apps/web/convex/domain.membership-plan-change.test.ts`, `apps/web/convex/domain.follow-up-loop.test.ts`, `apps/web/convex/domain.crm-integrity.test.ts`, `apps/web/convex/domain.simple-crm.test.ts`, `apps/web/convex/domain.offer-lifecycle.test.ts`, `apps/web/convex/domain.pt-lifecycle.test.ts`, and `apps/web/convex/retention.test.ts`.
- `apps/web/src/lib/i18n/system-messages.timeline-completion.test.ts` — Arabic rendering, typed parameters, authored value preservation, invalid-enum fallback, and English-source behavior.
- `apps/web/src/lib/mock/MockGymOSApi.ts` and `apps/web/src/lib/mock/MockGymOSApi.test.ts` — matching descriptors for mock rows that exist, owned by the public-surface packet.

## Descriptor mapping

| Generated timeline content | Descriptor and typed values |
| --- | --- |
| Opening balance import | `timeline.openingBalanceImported` with integer minor-unit `amount`; body `timeline.openingBalanceImportedBody` with canonical cutoff `date` |
| Historical payment evidence import | `timeline.historicalPaymentEvidenceImported` with `amount`; body `timeline.historicalPaymentEvidenceImportedBody` with payment `date`, or `...BodyWithReference` with the unchanged source reference |
| Imported membership history | `timeline.membershipHistoryImported` with unchanged plan name; body `...Body` with start/end/cutoff dates |
| Membership sale or renewal term | Existing `timeline.membershipTerm` with start/end dates |
| Membership plan change | `timeline.membershipPlanChangeBody` with unchanged reason and effective date |
| Tasks | `timeline.taskCreated`, `timeline.taskFollowOn`, and `timeline.taskCompleted` wrap generated prefixes while passing the original title; recognized contact outcomes use `timeline.taskContactCompleted` |
| Bulk tag changes and duplicate merge | `timeline.tagsAdded`/`timeline.tagsRemoved` pass the unchanged tag list; `timeline.memberMerged` passes the original member number; merge reason remains authored text |
| Trial schedule | `timeline.trialScheduledBody` with typed date and wall-clock time; `...BodyWithGoal` additionally passes the original goal |
| Offer delivery | `timeline.offerDeliveryConfirmedBody` or `...BodyWithReference` with validated channel enum and unchanged optional reference |
| Lead conversion | `timeline.leadConvertedExistingMemberBody` or `...NewMemberBody`, preserving member number and lead name |
| PT lifecycle | Included-credit grant/schedule/revoke and introductory grant use count descriptors; activation reversal uses `timeline.ptPackageActivationReversed`; refund title uses plural `timeline.ptCreditsRefunded` and body `...ptCreditsRefundedBody` with amount and unchanged reason |
| Retention and contact | `timeline.retentionSnoozed` with canonical date; `timeline.contactAttempt`/`timeline.callAttempt` accept only known contact-outcome enum values. `whatsapp_opened` retains its dedicated `timeline.whatsappOpened` descriptor |
| Coordinated CRM finite facts | `timeline.value` accepts the nested descriptor for a known enum/date; it does not translate arbitrary reasons or authored values |

`communicationCompletion.values.channel` adds the `email` and `manual` labels required by typed offer delivery. Contact outcome labels reuse the existing member-profile vocabulary. CRM renewal stop/suppression mappings reuse existing approved follow-up-context labels and retain a finite whitelist.

Arabic wording follows the approved `refund`, `void-payment`, `session`, `package`, `credits`, `plural`, `retention`, `followup-due`, and `whatsapp` terminology in `docs/arabic/DECISIONS.md`, with date/time and formatting behavior from `docs/arabic/STANDARD.md`. The applicable entries in `docs/arabic/approved-decisions.v1.json` remain unchanged; no new policy decision is introduced here.

## Audit boundaries

The primary AST audit's code-owned wrapper list is now covered at imports 7068/7091/7093, membership term/plan change 7408, task creation/completion 7621/7663/11034, bulk tags 7886, merge 7983, trial 10892, offer delivery 10998, and lead conversion 11168. Marketing-preference generated transition bodies at 9772 already use the corresponding transition descriptors; source-only preference updates do not assert a transition. The remaining author-supplied reasons, names, references, goals, task titles, tags, and outcome text are parameters rendered verbatim. Historical imported/authored records are not rewritten.

The mock adapter has matching import, plan-change, task, trial date/time, and offer-delivery descriptors for rows it already creates. Its current fixtures have no corresponding tag-change, duplicate-merge, or lead-conversion body timeline row. Its trial timeline body stores only date/time, so its descriptor omits the separately stored trial goal. These are adapter-shape boundaries, not missing Convex producer descriptors. The shared `TimelineFeed` consumer is documented in `system-text-ui.md`.

## Verification

- From `apps/web`: `pnpm exec vitest run --configLoader runner convex/domain.pt-lifecycle.test.ts convex/domain.membership-plan-change.test.ts convex/domain.follow-up-loop.test.ts convex/domain.crm-integrity.test.ts convex/retention.test.ts convex/domain.member-import.test.ts convex/domain.simple-crm.test.ts convex/domain.offer-lifecycle.test.ts src/lib/i18n/system-messages.test.ts src/lib/i18n/system-messages.timeline-completion.test.ts` — passed, 10 files / 56 tests.
- From `apps/web`: focused ESLint on the edited Convex producer/test files, both communication-completion catalogs, and `system-messages.timeline-completion.test.ts` — passed with no output.
- From repository root: `python3 docs/arabic/verify-lock.py` — passed, revision 607; 247 exact agreements; approval, custom-decision, checksum, and registry checks passed.
- The public-surface owner reports its mock system-text regression at 211 tests passed and scoped ESLint passed; no matching mock records exist for tag changes, duplicate merge, or lead-conversion body.
- From repository root: `git diff --check` — passed.
- `pnpm exec vitest run --configLoader runner src/lib/i18n/messages.test.ts` — 11/12 tests passed. One concurrent integration mismatch remains outside this packet: approved `charged-paid` coverage expects `reportsWorkspace.collections` to be `المبالغ المطلوبة والمدفوعة`, while the current catalog contains `التحصيلات` (reported to the primary owner for reconciliation). Catalog key shape, placeholder parity, six Arabic plural forms, and untranslated-text checks passed.
- No full web/Convex typecheck or browser QA was run in this packet; the primary agent owns final stabilized integration checks.
