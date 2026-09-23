# Jev-assisted workflows: the shared foundation

_Status: foundation, member import assistance, intent-aware navigation, connected staff follow-up assistance and the member resolution workspace implemented on `main` on 21 September 2026 (the first four committed as `068aad2`; the workspace in the working tree). Live connectivity and model accuracy are **not** verified; see "What is verified"._

## What Jev is for in RIVET

Jev (TypeSafe AI's evaluation model, reached through Vercel AI Gateway as
`typesafe-ai/jev` with the AI SDK's `experimental_evaluate`) answers typed
questions about one piece of state: a **choice** between named options, a
**score** on an ordered scale, or a **boolean** probability. It never writes
text. In RIVET it supplies bounded semantic judgments that a page may turn into
a *suggestion*; application code decides what state Jev sees, validates the
answer, decides what is shown, and keeps every action behind its normal,
permission-checked mutation. Every workflow must work exactly as before when
Jev is off, blocked or unavailable.

Only Jev is allowed. There is no paid model, no fallback model, no purchase and
no automatic recharge. The gateway request is pinned to the TypeSafe provider
(`providerOptions.gateway.only`), an answer served by any other model is
discarded, and a reported cost trips a breaker that stops live calls.

## Files and contracts (read in this order)

| File | Role |
| --- | --- |
| `apps/web/convex/jevRegistry.ts` | Pure contract: question shapes (`JevQuestion`), judgments (`JevJudgment`), results (`JevJudgeResult`), status view (`JevStatusView`), limits, `validateJevRegistry`. `JEV_REGISTRY_VERSION` invalidates every cached judgment when bumped. |
| `apps/web/convex/jevQuestionsFoundation.ts` | The synthetic foundation questions (one per kind plus a candidate-based choice) with fixtures. Template for feature question modules. |
| `apps/web/convex/jevQuestions.ts` | Aggregated registry: add a feature's question module here. |
| `apps/web/convex/jevQuestionsImport.ts` | The `import` feature: `import.column_target` and `import.plan_match`, candidate-based choices with fixtures built from a synthetic draft and deterministic `fixtureResolver`s. |
| `apps/web/convex/jevImportState.ts` | Pure import logic shared by loaders, the preview adapter and the page: column value-shape summaries (counts only), field compatibility, state and candidate building, legacy plan label parsing, plan-term comparison, outcome resolution, preview resolvers. |
| `apps/web/convex/navigationCatalogue.ts` | The one catalogue of destinations, report views, form entry points and Settings sections (stable ids, authored descriptions, routes, permission and module requirements), prepared clarifications, permission filtering, the fast keyword search, state builders for the three navigation questions, outcome resolution and preview resolvers. |
| `apps/web/convex/jevQuestionsNavigation.ts` | The `navigation` feature: `navigation.intent`, `navigation.next_step`, `navigation.report_view`. |
| `apps/web/convex/followupAssist.ts` | Pure follow-up logic shared by loaders, the preview adapter and the pages: note candidates and readings, consequence preview, related-task candidates, the member follow-up context projection (evidence classification, delivery wording, consent, quiet hours), renewal-context and template candidates with their deterministic gates, reason actions and levels, and every preview resolver. |
| `apps/web/convex/jevQuestionsFollowup.ts` | The `followup` feature: `followup.contact_outcome`, `followup.related_task`, `followup.renewal_context`, `followup.reminder_template`, `followup.reason_check`. |
| `apps/web/convex/resolutionAssist.ts` | Pure member-resolution logic: approved panels and clarifications with permission rules, the context types, service derivation for charges and payments, `readTrainingPayment`, typed evidence selection, `classEligibility`, plan attributes and `comparePlans`, state builders and preview resolvers for the four questions. |
| `apps/web/convex/jevQuestionsResolution.ts` | The `resolution` feature: `resolution.intent`, `resolution.plan_priority`, `resolution.class_pick`, `resolution.trainer_pick`. |
| `apps/web/convex/assistPassages.ts` | Shared review infrastructure: sentence-sized verbatim passages (`splitPassages`, `locatePassage`), script-aware normalisation, digit and count parsing, token overlap. |
| `apps/web/convex/supportAssist.ts` | Pure support-inbox logic: case passages with validated ids, categories with existing console destinations, recorded billing facts, the review context, and the five states, resolvers, readings and evidence notes. |
| `apps/web/convex/jevQuestionsSupport.ts` | The platform-scoped `support` feature: `support.category`, `support.invoice_match`, `support.clarification`, `support.unanswered`, `support.claim_check`. |
| `apps/web/convex/profileAssist.ts` | Pure public-page review logic: draft passages per field and language, recorded services, bilingual concept families, the claim-conflict and language-gap states, resolvers, readings, evidence and the unchecked (unknown) list. |
| `apps/web/convex/jevQuestionsProfile.ts` | The `profile` feature: `profile.claim_check`, `profile.language_gap` (`profiles.manage`). |
| `apps/web/src/features/support-review/support-triage.tsx` | "Triage with Jev" on the platform inbox: category with destination, matched invoice, one clarification inserted into the reply draft. |
| `apps/web/src/features/support-review/support-closure-check.tsx` | "Check before closing" inside the Resolve dialog: unanswered requests and unsupported claims quoted by passage, with "Show in conversation". |
| `apps/web/src/features/support-review/support-passages.tsx` | `HighlightedMessageBody`: marks flagged passages in the thread only where their exact text is still found. |
| `apps/web/src/features/profile-review/profile-draft-review.tsx` | "Draft review" panel on the public-profile editor: recorded services, claim findings with evidence, unchecked claims, language gaps, "Locate in editor". |
| `apps/web/convex/branchOpsAssist.ts` | Pure branch-operations logic: existing report kinds and branch-only machine/space candidates, related repair history by record, handover items and record-relationship groups, notification entities and groups, the five states/resolvers/readings and `evaluateGrouping`. |
| `apps/web/convex/jevQuestionsBranchOps.ts` | The `branchops` feature: `branchops.report_category`, `branchops.report_target`, `branchops.same_fault`, `branchops.handover_related`, `branchops.notification_topic`. |
| `apps/web/src/features/branch-ops/report-intake.tsx` | "Describe what you found" on the equipment tab: report kind and machine/space suggestion, filing through the existing issue form prefilled or the maintenance-task shortcut. |
| `apps/web/src/features/branch-ops/repair-history.tsx` | Related repair history for the selected machine with "Compare with Jev" per similarly worded earlier report. |
| `apps/web/src/features/branch-ops/handover-groups.tsx` | Grouped and flat handover views of unresolved checklist work, with "Check with Jev" per wording-similar pair. |
| `apps/web/src/features/branch-ops/notification-groups.tsx` | The grouped reading of the notification bell: mandatory alerts first, record and kind groups, singles with "Suggest a group". |
| `apps/web/convex/operatingBrief.ts` | Pure daily-brief logic: authored sections and headings, every figure, overdue and stale condition, mandatory rule, coverage and source status, the deterministic queue order, prepared emphases with preconditions, related-pair proposals, both states, resolvers and readings. |
| `apps/web/convex/jevQuestionsBrief.ts` | The `brief` feature: `brief.emphasis` (candidates: the applicable prepared emphases; counts and amounts only) and `brief.related_matter` (static options). |
| `apps/web/src/features/brief/operating-brief.tsx` | The "Operating brief" panel on the owner and manager dashboards: scope, freshness, coverage, the emphasis card with its figures, the mandatory list, sections with figures and "Show all", the complete queue, similar-wording checks and the sources list; rows are the Today queue's own rows. |
| `apps/web/src/features/resolution/resolution-workspace.tsx` | The "Resolve" area on the member page: goal input, deterministic unresolved facts, the intent card, panel chips, show all and standard view. |
| `apps/web/src/features/resolution/resolution-panels.tsx` | The seven panels: training payment, balance, membership terms, plan comparison, classes (with the stale re-check before the roster mutation), trainers and open work. |
| `apps/web/src/features/followup/contact-note-review.tsx` | "Review note" in the contact form: the reading, the consequence preview and the accept action that sets only the outcome. |
| `apps/web/src/features/followup/related-task-check.tsx` | Open work for a person plus "Is this the same work?" with keep / follow-on / separate actions and the changed-task refusal. |
| `apps/web/src/features/followup/follow-up-context.tsx` | `useMemberFollowUpContext`, `FollowUpContextPanel`, `RenewalContextHighlight`, `ReminderTemplateSuggestion`, `evidenceHref`. |
| `apps/web/src/features/followup/reason-check.tsx` | "Check reason" for sensitive-action dialogs. |
| `apps/web/src/features/members/create-task-dialog.tsx` | The member workspace's task dialog (moved out of the page) with the related-work check and the explicit `relatedTaskId` link. |
| `apps/web/convex/jevLoaders.ts` | Server-side state loaders, one per question: re-check access, build the bounded state, name `scopeKey` and `sourceVersion`. |
| `apps/web/convex/jevAnswers.ts` | Pure: SDK request building, scoped candidate ids, answer validation, canonical JSON, SHA-256 state hashing, fixture evaluation (also used by the preview adapter). |
| `apps/web/convex/jevMode.ts` | Pure: environment switches, free-terms date gate, caps, `gateJevRequest`, block copy. |
| `apps/web/convex/jev.ts` | Default runtime: `status` query, `platformStatus` query (an administrator reading one gym's switch), `updateTenantPreference` mutation (audited), internal `prepare` / `begin` / `complete` / `fail` / `resetBreaker` / `cleanupExpired`. Cache, leases, usage counters, breaker. |
| `apps/web/convex/jevAdapter.ts` (`"use node"`) | The one place that calls the model: timeout, `maxRetries: 0`, provider pin, model check, validation, cost read, error classification. Injectable model/evaluate for tests. |
| `apps/web/convex/jevInference.ts` (`"use node"`) | The public `judge` action: prepare → begin → adapter or fixture → complete/fail. |
| `apps/web/convex/schema.ts` | Tables `jevJudgments`, `jevRequests`, `jevUsage`, `jevTenantPreferences` (tenant-scoped, in `tenantPurge.TENANT_TABLES`) and `jevControlState` (breaker, global counter). |
| `apps/web/src/lib/domain/types.ts` | `AssistStatus`, `AssistJudgment`, `AssistJudgmentResult`, `AssistJudgmentRequest`, `UpdateAssistPreferenceInput` (re-exported from the registry). |
| `apps/web/src/lib/api/GymOSApi.ts` | `getAssistStatus()`, `updateAssistPreference()`, `requestAssistJudgment()`; implemented by `ConvexGymOSApi` (direct `api.jev.*` / `api.jevInference.judge` calls) and `MockGymOSApi` (fixture answers, in-memory switch, cache and usage). |
| `apps/web/src/features/assist/use-assist-judgment.ts` | The page hook: reads status first, shares in-flight requests, ignores superseded answers, retries `in_progress` a bounded number of times. |
| `apps/web/src/features/assist/assist-suggestion.tsx` | `AssistSuggestion` card (idle/disabled → fallback, loading, unavailable/stale note, ready card with confidence and feature actions) and `JudgmentSummary`. |
| `apps/web/src/features/assist/assist-judgment.ts` | Confidence bands and plain-language copy for judgments. |
| `apps/web/src/features/assist/assist-settings-section.tsx` | Settings → Jev assistance: environment status, the gym's switch, the question registry, the synthetic check. |
| `apps/web/src/features/members/import-assist.tsx` | Import page surfaces: `ImportColumnSuggestion` ("Suggest mapping" per unmatched column) and `ImportPlanSuggestion` ("Suggest plan" per unmapped legacy label, with the plan's exact terms and the deterministic comparison). |
| `apps/web/src/app/(app)/members/import/page.tsx` | The import page: saves the assist draft only while assistance is ready, keeps accepted suggestions as provenance, never overwrites a matched field, and runs the unchanged preview. |
| `apps/web/src/features/navigation/navigation-assist.tsx` | Session-side catalogue filtering, the outcome re-check against the session, `OnboardingNextStep` and `ReportFinder`. |
| `apps/web/src/components/shell/command-palette.tsx` | The palette: fast keyword search plus catalogue "Places", and the deliberate "Ask Jev" item with its destination, clarification and no-match results. |
| `apps/web/convex/jev.smoke.live.test.ts` | Opt-in live smoke against the gateway with fixtures only. |

## Request lifecycle

1. The page calls `useAssistJudgment({ questionKey, subject })`. The hook reads
   `getAssistStatus()` and asks nothing unless the question's feature is
   `ready`.
2. `requestAssistJudgment` reaches `jevInference.judge`. `internal.jev.prepare`
   resolves the actor (`requireActor`), requires the question's permission,
   evaluates `gateJevRequest` (mode, feature, gym switch, key presence, free
   terms, breaker, caps), runs the loader server-side, hashes the state, and
   returns a cached judgment when one exists for **this gym, this scope, this
   state hash, this mode** and the same question/registry/model versions.
3. `internal.jev.begin` re-checks the gate, refuses a duplicate in-flight
   request with `in_progress`, takes a lease and counts the request (per gym
   per UTC day, and platform-wide).
4. In `fixture` mode the registered fixture is run through the real builder and
   validator; in `live` mode `runJevEvaluation` calls the gateway with one
   question, an abort timeout (question `timeoutMs`, default 8 s, cap 15 s),
   `maxRetries: 0` and the provider pin, then validates the answer (exact
   question id, matching type, offered option only, coherent probabilities,
   score inside the scale).
5. `internal.jev.complete` re-loads and re-hashes the state; a changed record
   makes the result `stale` (never shown, never cached). Otherwise the judgment
   is cached when the question has a TTL, usage and reported cost are recorded.
   A live response with missing or nonzero cost is withheld, never cached, and
   trips the breaker, including when the caller's role changed while it ran.
6. The page receives `ready` (with `source: live | fixture | cache`), `blocked`,
   `in_progress`, `stale` or `unavailable`. Authorization failures throw the
   usual `FORBIDDEN` / `NOT_FOUND` / `UNAUTHENTICATED`.

Candidate-based choices never send ids to the model: candidates are renumbered
`option_01…` per request and mapped back after validation, so an answer can
only name an option this request offered.

In `fixture` mode (and in the preview adapter) a question with a
`fixtureResolver` answers from the request's **actual** state and candidates,
deterministically, through the same builder and validator as a live call; a
question without one replays its static fixture. Registry validation requires
a resolver for every candidate-based question that is not synthetic. Subject
values are bounded to 512 characters each (20 keys).

## Switches and the go-live gate

Everything is off by default. Live calls need all of the following:

- `RIVET_JEV_MODE=live` in the Convex deployment (`fixture` gives synthetic
  answers with no external call; anything else is `off`).
- `RIVET_JEV_FEATURES` listing the feature key (for example `foundation`).
- The gym's own switch on (Settings → Jev assistance, `settings.manage`,
  audited as `settings.assist.update`).
- `AI_GATEWAY_API_KEY` present in the Convex deployment. Set it in the Convex
  dashboard only. Check presence with `pnpm convex:env:names` (never a value).
- `RIVET_JEV_FREE_UNTIL=YYYY-MM-DD`: the last UTC day on which an operator has
  confirmed, from Vercel's current terms, that Jev is free for this account.
  Missing, malformed or past → live calls stop.
- Breaker clear and daily caps not reached (`RIVET_JEV_DAILY_CAP` 200,
  `RIVET_JEV_TENANT_DAILY_CAP` 50; `0` means none).

Free-eligibility facts rechecked on 23 September 2026: Vercel's
[Jev announcement](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway)
says Jev is free until 25 September 2026, while its
[model page](https://vercel.com/ai-gateway/models/jev) displays a nonzero
per-token price. The account's Gateway overview prompts for a card to unlock
free credits; its usage page has no calls and does not establish a zero-cost
entitlement. The public promotion and an empty balance do not prove this
account's eligibility. `RIVET_JEV_FREE_UNTIL` stays unset until an operator
confirms the account-specific terms and zero-cost access in the dashboard.
The gateway's reported cost is then checked on every response.

Breaker reset (operator only, from a shell with the deployment selected, no
secret involved): `pnpm --filter web exec convex run jev:resetBreaker '{"reason":"<why>"}'`.

## Member import assistance (first feature, `RIVET_JEV_FEATURES=import`)

Two explicit, staff-accepted suggestions on the import page's mapping step;
exact and alias matching (`inferMemberImportMapping`) still runs first and
nothing is asked unless a person presses the button.

- **Draft.** While assistance is ready for the gym, the page saves an assist
  draft (`members.import.draft`, permission `members.write`, branch-scoped,
  24-hour expiry, one per person): the headings, a value-shape summary per
  column (filled/empty/distinct counts and shares of numeric, date-like,
  phone-like, email-like, alphabetic and Arabic-script cells; never a cell
  value) and the legacy plan labels with row counts. Member rows stay in the
  browser until the normal preview. A failed save leaves the manual import
  untouched.
- **Column target** (`import.column_target`). Subject `{ draftId, column,
  assigned }`. The loader offers only the RIVET fields that are still
  unassigned *and* compatible with the column's shape (a numeric column is
  never offered as email or name), plus `leave_unmapped` and `unclear`. The
  page maps a field only through "Use as …", refuses to overwrite a field that
  is already matched (clear it first), drops a pending answer when the matches
  change meanwhile (the subject changed), and records accepted fields.
- **Legacy plan match** (`import.plan_match`). Subject `{ draftId, label }`.
  Candidates are the gym's active plans available at the draft's branch,
  described by their exact terms, plus `no_equivalent` and `needs_review`.
  The label's stated duration, visits, price and currency are parsed
  deterministically (`parseLegacyPlanLabel`) and compared with the picked
  plan (`comparePlanToLabel`): a kind or currency contradiction is
  **incompatible** (no apply), a duration, visit or price difference is
  **needs review** ("Use anyway" with the differences listed), otherwise a
  **match**. The card shows the source label, the plan's exact terms and a
  chip per term. A changed or archived plan changes the source version, so
  cached answers are not reused, and the page re-checks the plan is still
  current before applying.
- **Provenance.** The preview input carries `assist: { draftId, columns,
  plans }` (accepted suggestions only); it is stored on the import record and
  in the preview audit entry. Required fields, duplicate checks, row
  validation, batching, idempotency and undo are unchanged.
- **Preview adapter.** `MockGymOSApi` keeps drafts in memory and answers both
  questions from the seeded plans through the resolvers, so previews and tests
  see realistic outcomes (a tie between Monthly Standard and Student Monthly
  for "شهري" becomes needs-review; "Monthly 40 USD" is incompatible).

## Intent-aware navigation (`RIVET_JEV_FEATURES=navigation`)

- **Catalogue.** `navigationCatalogue.ts` lists every destination, report view,
  form entry point and Settings section with a stable id (`page.*`,
  `report.*`, `form.*`, `settings.*`), an authored description, its route and
  the same permission and workspace-module rules the sidebar applies. A test
  checks that every route exists under `src/app/(app)`, every Settings id
  matches the rail and every permission is in the server catalogue. Five
  prepared clarifications (`clarify.*`) name real alternatives only.
- **Fast path.** The palette keeps the server workspace search and adds a
  "Places" group from `keywordSearchNavigation` over the session-permitted
  catalogue on every keystroke; Jev is not involved there.
- **Ask.** Semantic help runs only when the person selects "Ask where to go for
  …" (or "Ask again"); the typed draft and focus stay in the input. The server
  loader resolves the actor, applies `workspaceAccessData` for modules, and
  offers only the permitted entries, the clarifications that still have two
  permitted options, and `no_match`. The page re-checks the outcome against
  the session (`intentOutcomeForSession`); anything outside the permitted
  lists is a no-match. A destination is opened only when the person selects
  it; opening a form submits nothing. Cache rows are keyed by the offered
  candidates, so a role change or a module change is never served an old
  answer.
- **Next step.** `OnboardingNextStep` (owner and staff checklists) asks
  `navigation.next_step` with the actor's own open steps as candidates
  (server-side, via `onboardingExperience`) and lifts one; every step stays
  listed with its own link. Member onboarding is not assisted.
- **Report finder.** `ReportFinder` on the Reports page asks
  `navigation.report_view` on submit; candidates are the permitted report
  views only, and the link keeps the page's current branch and date scope.
  Calculations stay on the server as before.
- **Preview.** The mock adapter builds the same candidates from the demo
  role's permissions and module preferences; the deterministic resolvers give
  the brief's examples: "Where do I change who can refund?" → Settings: Roles
  & permissions (owner) and no match (reception); "Record a payment" → the
  member-or-supplier clarification (owner) and the member payment form
  (reception, who cannot pay suppliers); "Move her to another branch next
  month" → the member-change clarification.

## Connected staff follow-up assistance (`RIVET_JEV_FEATURES=followup`)

Five judgments on top of facts RIVET already records. Every gate stays
deterministic (which outcomes a form offers, what an outcome does, consent,
quiet hours, suppression, the approved templates, the permission each check
needs); Jev only picks among options the application built, and nothing it
picks is applied until a person accepts it through the normal mutation.

- **Contact note review** (`followup.contact_outcome`, subject `{ subject,
  memberId | leadId, note }`). The "Review note" button in the contact form
  (member and lead records, queues, Today, the member tasks panel) sends the
  note and the subject kind only; candidates are the outcomes that form
  offers (trial outcomes for leads only) plus `third_party`, `contradictory`
  and `unclear`. A conversation with a relative or friend never becomes an
  outcome ("Spoke to her brother" reads as third party, with no apply
  action). For a supported outcome the card previews the consequences with
  the same helper the mutation uses (`previewContactConsequences` over
  `resolveFollowUpTasks`): the stage the form would send, the follow-up date
  (suggested or the typed one, kept), which open tasks move or close, which
  stay untouched (someone else's, or due later) and whether a task is created.
  "Use …" sets only the outcome; the note, a typed date and a chosen stage
  stay as typed. Editing the note drops the review. The loader requires
  `members.write` for members and `crm.write` for leads.
- **Related open work** (`followup.related_task`, subject `{ subject, id,
  type, title, dueDate, ownerName }`, `crm.read`). The member workspace's
  "Create task" dialog always lists the person's open tasks; "Is this the
  same work?" offers those tasks (with owners and dates) plus `none`. The
  only ways forward are explicit: keep the existing task, create the new one
  as a follow-on linked to it, or create it separately. Nothing is closed,
  merged or rescheduled. The link is the new optional `relatedTaskId` on
  `tasks.create` / `createFollowUp`: the server checks the related task is
  open and about the same person, stores `relatedTaskId` + `relatedTaskTitle`
  and writes "Follow-on to: …" on the timeline. A task that changed owner,
  date or status since the suggestion is not linked (the page re-reads it
  before creating; the server's candidates carry the owner, so a cached
  answer never survives an ownership change).
- **Follow-up context** (`members.followup_context` /
  `getMemberFollowUpContext`, `members.read`; tasks only with `crm.read`).
  One deterministic projection (`buildMemberFollowUpContext`) read by the
  member workspace ("Follow-up context" panel), the renewal queue panel and
  the loaders: the renewal target, whether the automated journey stops and
  why (`renewalStopReason`), consent from the record (`consentForRenewalChannel`,
  never inferred) with the suppression reason, quiet hours now and when they
  end, every `renewalDeliveries` row for the term with truthful wording
  ("queued · not delivered", "accepted by the provider · delivery not
  confirmed", "prepared in sandbox · not sent"), the last contact, an agreed
  callback with the open task that holds its date, the recorded evidence
  (calls, notes, messages, freezes, snoozes; ≤ 12) each with its timeline
  event id as the reusable reference and deterministic topic tags for
  recorded callbacks, travel and complaints, and the open work.
  `TimelineFeed` items carry `id="timeline-event-<id>"`, so
  `/members/<id>?tab=timeline#timeline-event-<id>` is the evidence link.
- **Renewal conversation context** (`followup.renewal_context`, subject
  `{ memberId }`, `crm.read`). "Highlight what matters" offers the evidence
  items plus `none`; the card shows the chosen item first and the next two
  above 15 %, each with its evidence link. The preview resolver ranks an
  agreed callback, complaints, travel, freezes and recency.
- **Reminder template or staff review** (`followup.reminder_template`,
  subject `{ memberId }`, `crm.read`). Candidates are the one approved
  utility template that fits the term's timing (`timedRenewalTemplate`: 4–14
  days → `renewal_7d`, 1–3 → `renewal_3d`, 0 → `renewal_today`, ended ≤ 45
  days ago → `renewal_expired_3d`) plus `staff_review`. An explicit opt-out
  (or no fitting template) is refused by the loader and hidden by the page
  before any question exists (`reminderTemplateUnavailableReason`); unknown
  consent shows the suppression beside the suggestion. "Use in WhatsApp"
  opens the existing handoff (now controllable: `open`, `onOpenChange`,
  `hideTrigger`) with the rendered text (`renderReminderForMember`, member's
  language, values from the record only); the handoff logs `whatsapp_opened`
  and never claims a send. RIVET never sends from these surfaces.
- **Reason checks** (`followup.reason_check`, score with four levels, subject
  `{ action, reason }`). The loader reads no tenant data and requires the
  action's own permission (`REASON_ACTIONS`: refund, void, check-in override,
  freeze, unfreeze, extend, cancel, transfer, plan change, price override,
  lead lost). "Check reason" in the refund, void, check-in override, freeze,
  unfreeze, extend, cancel, transfer and plan-change dialogs shows the level
  and asks for the missing fact (what happened; who confirmed it and when)
  with authored prompts; it never proposes wording and never blocks submit.
- **Preview.** `MockGymOSApi` builds the same context from the seeded records
  (no reminder deliveries exist in the preview), answers the five questions
  through the deterministic resolvers, validates `relatedTaskId` like Convex,
  and applies the same opt-out refusal.

## Member resolution workspace (`RIVET_JEV_FEATURES=resolution`)

A stable, optional area at the top of the member page ("Resolve"). Staff
write what they are helping the member with; Jev may pick one approved
panel, ask a prepared clarification, or say nothing fits. "Show all" opens
every panel the server allows, "Standard view" folds the area away, and the
tabs and the full history stay untouched. The typed goal is a draft that
nothing rewrites, focus never moves, and no panel executes an action by
itself.

- **One projection** (`members.resolution` / `getMemberResolutionContext`,
  `members.read`; `buildMemberResolutionContext` in `resolutionAssist.ts`):
  charges with their **service** derived from their own links (a charge
  behind a PT package order is personal training, a charge on a term is
  membership; never from the amount), payments matched to the charge they
  were recorded against (listed only with `reports.financial.read`, the
  same rule as the Payments tab), the current term (freeze allowance used,
  visits, payment status), PT orders and credits, typed evidence read from
  the whole timeline (payments, membership changes, PT events; never the
  first page of the overview), open work with its follow-on links and recent
  task events, every active plan's full terms, the classes at the member's
  branch for the next 14 days with `classEligibility` applied (booking
  policy, membership usable on the date, plan branch cover, audience against
  the recorded gender, active-booking limit, capacity and waitlist room,
  schedule), and the published trainers at the branch with what their
  profile records plus their first open slot in the next 14 days
  (`ptSlots`). `panels` and `access` are decided on the server.
- **Which panel** (`resolution.intent`, subject `{ memberId, goal }`).
  Candidates are the permitted panels (`panel.training_payment`,
  `panel.balance`, `panel.membership_terms`, `panel.plan_compare`,
  `panel.classes`, `panel.trainers`, `panel.open_work` with `crm.read`),
  the clarifications whose options are both permitted (`clarify.payment`,
  `clarify.session`, `clarify.plan`) and `no_match`. The page opens the one
  panel a judgment names (once), shows the question for a clarification,
  and says so for no match; anything outside the permitted list reads as no
  match.
- **"I already paid for training"** (`readTrainingPayment`): the PT
  payments and orders sit beside the membership charges still open, each
  with its service, dates, receipt and timeline links, under the sentence
  that a payment settles only the charge it was recorded against. Nothing
  is netted and no balance changes; the existing "Collect payment" deep
  link and the Payments and PT tabs are the actions.
- **Plan comparison** (`resolution.plan_priority`): the stated priority
  maps to one of `attr.branch_access`, `attr.freeze`, `attr.included_pt`,
  `attr.visits`, `attr.duration`, `attr.price` (or none); the page turns
  emphasis chips on only when the person accepts, and `comparePlans` always
  shows every attribute and price for every plan, current plan first.
- **Classes** (`resolution.class_pick`): only joinable classes are offered;
  "Add to class" re-reads the context first and refuses a class that filled
  or was cancelled since the suggestion, then calls the existing roster
  mutation, which enforces the same rules again. With no joinable class the
  loader refuses (nothing to ask) and the page shows the deterministic
  "none".
- **Trainers** (`resolution.trainer_pick`): only published trainers with an
  open slot are offered, described by what their profile records; an empty
  language list is "not recorded" and the resolver never matches a language
  request against it. Booking goes through the existing PT tab dialog with
  the trainer preselected (`?tab=pt&trainer=<id>&book=1`); with no usable PT
  credit the action is replaced by the reason.
- **Preview.** `MockGymOSApi` builds the same context from the seeded
  records (including class occurrences and trainer hours) and answers the
  four questions through the deterministic resolvers.

## Support and content review (`RIVET_JEV_FEATURES=support,profile`)

Two separate feature modules on the shared infrastructure in
`assistPassages.ts`: the application cuts text into sentence-sized, verbatim
passages with stable ids (`<messageId>:<index>` for a case,
`<lang>:<field>:<index>` for a draft), Jev chooses among those ids, and a
finding is shown only when the id still resolves to the same text. Nothing in
either module rewrites, translates, sends, publishes, closes or reprioritises.

### Platform scope

`support.*` questions carry `scope: "platform"` and `permission:
"platform.admin"`. `prepare` resolves a platform administrator instead of a gym
actor, checks the environment switches before reading anything, then lets the
loader (`JEV_PLATFORM_STATE_LOADERS`) find the case across tenants and name the
gym it belongs to (`organizationDocId`). That gym's own switch, daily cap,
cache rows and request rows apply: a gym that keeps Jev off is never sent
anywhere, not even by the support team reading its case, and the requester
never sees a review projection (`platform.support.review` and every
`support.*` question are `FORBIDDEN` for gym staff). `complete` re-runs the
platform loader under the administrator who prepared the request and rejects a
request another user prepared or a case that moved. `api.jev.platformStatus`
gives the console the gym's status read-only (`canManage: false`); the hook's
`platformGymId` option routes the status read there.

### Support inbox (platform team)

- **Context** (`platform.support.review` / `getPlatformSupportReviewContext`,
  `buildSupportReviewContext`): the case's passages (gym and platform, ordered
  by time, bounded), the recorded facts about the gym (subscription plan and
  cadence, period end, active branches, every platform invoice with status,
  amount, dates and `paidAt`, the public page's published and draft versions),
  the categories with their destinations and the prepared clarifications.
- **Category** (`support.category`): one of `invoice_dispute` (an invoice that
  exists), `billing_schedule` (when or how often the gym is billed),
  `feature_upgrade`, `public_page`, `account_access`, `technical_issue`,
  `other`. A structured plan request reads as an upgrade. The reading shows
  alternatives that carry weight, so a case that straddles two categories says
  so. Destinations are existing console pages only (`supportDestination`): the
  gym record, the ledger with the invoice focused
  (`/platform/billing?invoice=<id>&case=<caseId>`), or Billing for the gym
  (`?bill=<gymId>&case=<caseId>`); the billing page shows which case sent the
  operator and the way back.
- **Invoice** (`support.invoice_match`): the gym's recorded invoices plus
  `none`; the loader refuses when none is recorded and the page keeps the
  deterministic line.
- **One clarification** (`support.clarification`, subject may carry the
  suggested category): the prepared questions relevant to the category plus
  `none`; "Insert into reply" appends to the operator's reply draft (never
  replaces it) and nothing is sent until they press Send.
- **Before closing** (inside the Resolve dialog, on request):
  `support.unanswered` offers the gym's explicit request passages
  (`supportRequestPassages`) with every platform reply and the closing summary
  being written, and flags the ones nothing addresses; `support.claim_check`
  offers outcome-asserting passages (`supportClaimPassages`) with the recorded
  facts and flags what those facts contradict or do not cover. Each finding
  quotes the passage and, for claims, a deterministic evidence note from the
  facts (`supportClaimEvidence`: "invoice X is recorded as open", "the recorded
  plan is Growth, not Pro", "draft v3 is still awaiting review", or "no
  recorded evidence covers this; a reply alone does not show the fix
  happened"). "Show in conversation" highlights the passage in the thread.
  Both loaders refuse resolved cases. Urgency, assignment, the required
  summary and the Resolve button are unchanged.

### Public page draft review (gym editors, `profiles.manage`)

- **Context** (`profiles.gym.review` / `getGymProfileReviewContext`,
  `buildGymProfileReviewContext`): the saved draft's tagline and description in
  both languages as passages, and the recorded services (active branches,
  published trainer profiles, active PT packages, active plans with whether any
  allows freezing or grants every branch, scheduled classes, chosen amenities,
  audience, category). Unsaved edits are not reviewed: the action is disabled
  until the editor saves or discards.
Each passage-review Choice (support unanswered requests, support claims, profile
claims and language gaps) displays only its selected passage. Alternative
probabilities are competing answers, not independent findings. These checks
are not exhaustive reviews; invalid selections never imply an all-clear.

- **Claims** (`profile.claim_check`): only a contradiction counts. Code checks
  branch and trainer counts, women-only or men-only against the audience,
  freezing against plan terms, and "every branch" access against plan terms;
  anything the records do not cover (parking, sauna, pool, hours, nutrition,
  kids…) is listed by code as unknown, never false. Findings quote the passage
  with `profileClaimEvidence` and "Locate in editor" focuses and selects the
  passage in its field.
- **Languages** (`profile.language_gap`): both languages' passages plus
  `none`; a passage is flagged when it states a concept family or a number the
  other language's text does not (`languageGapEvidence`); paraphrases, order,
  tone and idiom are not differences. With no Arabic text the loader refuses
  and the panel says so.
- Nothing is rewritten, translated or published, and no finding blocks Save
  draft, Publish draft or Send to RIVET.

### Preview

`MockGymOSApi` answers every question through the deterministic resolvers,
builds both contexts from the seeded records (the demo tenant's invoices,
plan, branches and draft state), seeds one case (`SUP-219`) with a real
conversation for the inbox, and persists the gym's Jev switch in the preview
behaviour seam so it survives the full navigation into the platform console.

## Branch operations (`RIVET_JEV_FEATURES=branchops`)

Three connected improvements on the equipment tab, the checklist handover and
the notification bell, all built on record relationships first and on
`assistPassages.ts` text helpers. Groups are presentation aids: every original
item, owner, branch, date, unread state and safety flag stays; nothing is
merged, closed, reassigned, marked read or hidden, and Jev never declares a
machine safe.

- **Filing a description** (`branchops.report_category`, static options;
  `branchops.report_target`, candidates). "Describe what you found" on the
  equipment tab sends the typed text with the branch's registered machines
  (code, name, make, model, location) and active spaces. The category is one
  of the existing report kinds (machine issue, cleaning, inspection,
  incident) or unclear; the target is one machine, one space or none, and two
  equally plausible machines split the probability so the page shows
  "uncertain" with the alternatives. A same-named machine at another branch
  is never a candidate. "File machine issue" opens the existing issue form
  with the machine preselected and the description prefilled; severity and
  safety start neutral for the person; cleaning, inspection and incident go
  to the maintenance page through its existing zone shortcut.
- **Related repair history** (`relatedRepairHistory`, `branchops.same_fault`).
  For the selected machine, every other report on that one machine (the
  record relationship) with its linked work orders, newest first, plus a
  disclosure of how far the history reaches and that other machines and
  branches are excluded. Shared wording marks a report "similar wording"
  and offers "Compare with Jev"; the loader refuses any pair that is not on
  the same machine. The verdict is same fault (strong answers count as a
  recurrence), similar but separate, or unclear. `recurringSummary` states
  that recurrence changes nothing by itself: severity, safety status and the
  repair decision (`getEquipmentRecommendation`) stay with the responsible
  person and the recorded rules.
- **Handover** (`handoverItems`, `handoverGroups`, `branchops.handover_related`).
  Unresolved work in the seven-day window (failed items and required items
  still pending; completed, skipped and optional items are not obligations)
  grouped by the same checklist item on several days (recurring), the same
  linked maintenance task, then the same gym space; an "All items" view is one
  click away and both views show every item with its checklist, date,
  responsible person, status, overdue and task-linked flags. Wording overlap
  only proposes a comparison; "Check with Jev" may read two items as the same
  problem, which adds a "Same problem as" line to both rows and nothing else.
- **Notifications** (`groupNotifications`, `branchops.notification_topic`).
  The bell gains a "Grouped" reading when a group would form: mandatory kinds
  (`MANDATORY_NOTIFICATION_KINDS`: access denial, incident, delivery failure,
  past-due invoice, cash variance, automation attention) always stay
  individually visible on top; a group needs two notifications about the same
  record (from the notification's own link or dedupe key) or of the same kind
  family; everything else stays single. Rows are the plain list's rows with
  their own open and read/unread controls, group counts are sums, the badge
  is unchanged, and "Suggest a group" on a single is an explicit ask whose
  answer is shown as a suggested placement only.
- **Refresh.** Every ask is explicit (a button) and cached by state hash; the
  pages re-read only when their existing queries or subscriptions deliver a
  changed record. No polling was added.
- **Measurement.** `evaluateGrouping` scores useful pairs, false pairs,
  missed pairs and hidden items separately; the pure tests report the
  handover fixture at 2 useful / 0 false / 0 missed / 0 hidden and the
  notification fixture with every notification shown exactly once.
- **Preview.** `MockGymOSApi` answers the five questions through the
  deterministic resolvers from the seeded machines, spaces, checklist runs and
  the owner persona's seeded notifications (two about one PT booking, two
  member follow-ups, a support reply, a maintenance escalation and an access
  denial).

## Daily operating brief (`RIVET_JEV_FEATURES=brief`)

A compact working view of unresolved commercial and operational issues on
the owner and manager dashboards, read through the `dashboard.brief` domain
query (`operatingBriefData` in `domain.ts`, `getOperatingBrief()` on the API
boundary, `qk.operatingBrief(viewer, branchId)`). Everything in it is
computed in code; Jev is asked two bounded questions and neither answer
hides, merges, closes or reorders anything.

- **Sources.** The Today queue is the first source, built by `dashboardData`
  with the same permission and branch rules and, internally, without its page
  limit, its at-risk sample or the due-today filter on maintenance tasks
  (`options.complete`; the public `dashboard` query never sets it). Four
  more sources are read separately: lapsed memberships (expired within 30
  days and never renewed, `crm.read`), open machine reports and low stock
  (operations module and `operations.manage`), and the gym's open RIVET
  cases (owner or manager). A source that throws, a module that is off or a
  role that may not see one is listed with its status (`unavailable`,
  `not_enabled`, `no_permission`) and the brief reads as partial coverage;
  every source carries its read time. A queue cut at `BRIEF_QUEUE_LIMIT`
  (2,000) is partial coverage too.
- **Figures.** `buildOperatingBrief` sums balances, counts renewals ending
  within seven days and today, lapsed terms, overdue and due-today follow-ups,
  work waiting seven or more days (`stale`, with the exact `overdueDays`),
  members at risk, pending approvals, cash variances and their total, entry
  denials, open, overdue and blocked or critical maintenance, open and
  out-of-service machine reports, failed and due checklists, products at or
  below their reorder point, and open and urgent cases, per authored section
  in a fixed order (collections, renewals, follow-ups, retention, controls,
  facilities, equipment, checklists, stock, support). Every figure is a
  count or a money value with an optional link into the existing queue.
- **Order and mandatory items.** Items are the Today queue's own items (plus
  `expired:`, `equipment:`, `stock:` and `support:` items in the same shape),
  ordered by `finalizeTodayQueue` (priority, then time, then id). Urgent
  items by the existing rules are mandatory: listed on top under "Must be
  seen today", never folded away and unaffected by dismissing a suggestion,
  and still present in their sections and in the complete queue. Every row
  is `TodayQueueRow` with the server's own action (`Collect`, `Renew`,
  `Done` through the queue's shared completion flow, `Open case`), so each
  action returns to the original authorized workflow; evidence links add the
  member record, timeline, payments and the queue the item came from.
- **Scope, freshness, caching.** The brief names its branch scope (the
  selected branch, all branches, or the caller's assigned branches), the
  generation time and the tenant-local date, and the page reads it on open
  or on the explicit Refresh only (no subscription, no polling). The query
  key includes the viewer, their role and branch list, so a restricted
  manager never reads an owner's cached brief; a failed refresh keeps the
  last brief and says when it was generated. On the server the brief is
  rebuilt per caller from `ActorContext`, and a branch outside their scope is
  not found.
- **Emphasis (`brief.emphasis`).** Nine prepared, authored emphases each
  carry a deterministic precondition on the figures (mandatory items,
  outstanding total, renewals or lapsed terms, overdue follow-ups, members at
  risk, open repairs or reports, incomplete checklists, open cases, and the
  routine emphasis that always applies). The applicable ones are the
  candidates; the state holds counts and amounts only (no names or record
  text); Jev picks one and the page shows its heading with the figures of the
  sections it points at and links to them. Without Jev, on a model failure,
  or when the answer names something not offered, the first applicable
  emphasis by rank leads as "Start here (standard order)".
- **Related matter (`brief.related_matter`).** Operational items in the same
  branch whose wording overlaps by two or more content tokens are proposed
  as pairs (at most six). "Same matter?" is an explicit check; the loader
  finds both items in the caller's own brief (an id outside their scope is
  not found). A strong same-matter answer adds a "Same matter as" line to
  both rows and nothing else; related, separate and unclear (including
  descriptions that contradict each other, such as "fixed" against "out of
  service") leave both rows as recorded. The recorded safety status is passed
  as a fact and never re-judged.
- **Preview.** `MockGymOSApi.getOperatingBrief` builds the same projection
  from the seeded records (the complete queue through `dashboardSync`, then
  the four sources with the same permission and module gates) and answers
  both questions through the deterministic resolvers.

## Adding a feature question (later agents)

1. Create `apps/web/convex/jevQuestions<Feature>.ts` exporting a `JevFeature`
   and its `JevQuestion[]`: stable key `<feature>.<name>`, `version: 1`,
   `permission` from `permissions.ts`, `cacheTtlMs` (0 to disable),
   `synthetic: false`, and a **synthetic fixture** (sample state and the
   judgment) that never contains real customer data.
2. Register the feature and questions in `jevQuestions.ts`.
3. Add a loader in `jevLoaders.ts`: it receives `ActorContext` and the page's
   `subject` identifiers, must re-check access (cross-tenant → `NOT_FOUND`),
   build the bounded state (≤ `JEV_MAX_STATE_BYTES`), supply `candidates` for a
   candidate-based choice, and return `scopeKey` (for example
   `lead:<publicId>`) and `sourceVersion` (bump when the projection changes).
4. In the page: `const suggestion = useAssistJudgment({ questionKey, subject: { leadId } })`
   and `<AssistSuggestion suggestion={suggestion} title=… render=… actions=… />`.
   Apply actions through the feature's existing mutation; never let a judgment
   write anything by itself.
5. Tests: `jevRegistry.test.ts` validates the registry automatically; add a
   convex-test suite for the loader's authorization (owner, foreign tenant,
   missing permission) and a component test in fixture mode
   (`renderWithApp` + `api.updateAssistPreference({ enabled: true })`).
6. Enable in an environment with `RIVET_JEV_FEATURES=<feature>` once the gate
   above is met.

## What is verified

- Implemented and unit/integration tested locally: registry validation, answer
  validation (including candidate scoping and simulated invalid output),
  switches and the free-terms date, the adapter against the AI SDK's mock
  evaluation model (success, invalid output, timeout, rate limit, foreign model,
  cost metadata), the Convex action path in fixture mode (authorization, tenant
  isolation of the cache, leases, staleness, breaker, caps, cleanup), the
  preview adapter, the hook and card, and the Settings section.
- `pnpm convex:codegen` bundled and pushed the Node 22 action bundle (with the
  AI SDK) to the development deployment successfully.
- Import assistance is covered by pure tests (summaries, compatibility, label
  parsing, comparisons, resolvers), convex-test (draft permission, bounds,
  tenant isolation, expiry, real candidates, changed plans, provenance), page
  tests (off by default, accept, no overwrite, late answer, Arabic and
  incompatible labels, mapping-to-preview) and a Playwright journey on the
  built preview bundle.
- Intent-aware navigation is covered by the catalogue integrity test, pure
  resolver tests (ambiguous, inaccessible, unknown), convex-test (per-role
  candidates, Starter vs Pro module entitlement, a permission change that
  changes the offered set and misses the cache, unknown and empty requests,
  report and next-step permissions), palette tests (deliberate ask, draft
  preserved, clarification, no-match, model failure with keyword fallback,
  receptionist never offered a setting) and a Playwright journey.
- Follow-up assistance is covered by pure tests (note readings in English and Arabic, third party, contradictions, consequence previews, related-work matching and unrelated similar tasks, evidence tags, consent and suppression, quiet hours, delivery wording, agreed callbacks, template timing and gates, reason levels), convex-test (per-subject candidates and permissions, foreign records, ownership change beating the cache, evidence-only candidates, the opt-out refusal, per-action reason permissions, the context query, the explicit task link and its refusals), component tests in the preview (third-party note, consequence preview and accept preserving edits, stale review, related work with follow-on link and a changed task, opt-out, template to WhatsApp without a send, agreed callback to staff review, reason prompts and the permission boundary) and a Playwright journey on the built preview bundle.
- Support and content review are covered by pure tests (passages and location in both scripts, categories kept apart in English and Arabic, alternatives for a straddling case, invoice matching by id, amount and month, one clarification or none, unanswered requests including a reply written before the request and the closing summary, claims against the ledger, subscription and public page, contradictory replies, silence never a contradiction, bilingual paraphrases left alone, concept and number gaps), convex-test (the review context for administrators only with requesters and other tenants refused, platform status read-only, per-gym switch honoured by the platform team, invoice candidates, the unanswered and unsupported readings clearing as replies and summaries land, resolved cases refused, a request another user prepared refused, staleness; the profile context for profile managers only with inactive branches, archived plans and draft trainers excluded, other tenants reading their own text, claim and language findings, no-Arabic refusal, cache and staleness), component tests in the preview (triage by keyboard with the destination deep link and the matched invoice, one clarification inserted only into the reply, nothing while the switch is off, closure findings quoted by passage id with "Show in conversation" and the case untouched, the summary counting as an answer, highlights only where text still matches; the draft review with unknown claims listed, a language gap located in the editor, the action disabled while edits are unsaved, a paraphrase reading aligned, no-Arabic and switch-off states) and a Playwright journey that reviews a draft at phone width in RTL and then triages, checks and follows the destination in the console.
- The resolution workspace is covered by pure tests (panel access and clarification rules, the brief's intent examples, plan priority and comparison, every class-eligibility rule, class and trainer matching including "never infer a language from a name", payment-to-charge service linkage without netting, whole-record evidence), convex-test (services and evidence for the owner, restricted roles, foreign members, per-actor candidates, plan priority, a class cancelled since the suggestion missing the cache, a trainer whose recorded language was removed reading as none) and component tests in the preview (the brief's goal opening the training-payment panel with the draft kept and the payment found behind eight newer notes, clarification, no match and show all, model failure with every panel still reachable, a trainer-role user, plan emphasis with the full table, a stale class refused before the roster mutation, and "languages: not recorded"), plus a Playwright journey that ends at phone width in the manual RTL layout.
- The daily operating brief is covered by pure tests (every figure per section, queue order, mandatory items, stale days, evidence links, partial coverage for unavailable, disabled and forbidden sources, a cut queue, the empty scope, emphasis preconditions, counts-and-amounts-only state, scope keys, fixture readings and fallbacks, related pairs limited to one branch, same matter, conflicting descriptions and separate matters), convex-test (owner figures across both branches, a manager restricted to one branch with only their items and a refused branch, another tenant not found, per-caller emphasis states with different hashes and a cache hit, related pairs inside the caller's scope with conflicting descriptions reading unclear and the machine's safety status unchanged, and a Starter plan or a desk role reading as partial coverage), component tests (exact figures, mandatory rows with the server's actions, section previews, the complete queue in server order, stale badges, the shared completion dialog, the sources list, the standard order with Jev off and nothing asked, Jev's emphasis with evidence and a dismissal that changes nothing, a model failure, partial coverage with the operations module off, the selected-branch scope, a conflicting pair reading unclear with both rows kept, and the empty state) and a Playwright journey on the built preview bundle that ends at phone width in the manual RTL layout.
- Branch operations are covered by pure tests (report kinds in English and Arabic with unclear, branch-only candidates, tied machines splitting the answer, spaces and none, history by record with similar wording as a proposal only, recurring versus separate versus unclear with severity untouched, handover obligations with owner and date, recurring and space groups, wording pairs, same-problem grouping only on a strong answer, notification entities, mandatory alerts outside groups, unread sums, stray placement or none, and the useful/false/missed/hidden scoring), convex-test (candidates limited to the selected branch with the same-named Sweifieh machine excluded, a Sweifieh-only manager refused, short descriptions refused, same-machine comparisons only with other-machine and other-branch pairs refused, severity and safety unchanged, cache hits, related checklist items across persisted and not-yet-persisted runs with completed items refused, and notifications visible to their recipient only with nothing marked read), component tests (intake by keyboard with the prefilled filing, cleaning routed to maintenance, nothing while the switch is off, repair history with an explicit comparison and the current report's severity and safety unchanged, handover groups with the same items in both views and a checked pair, the bell's grouped reading with the same rows, mandatory alert, collapsed counts, unchanged badge and no read call, and a suggestion-only placement) and a Playwright journey on the built preview bundle that ends at phone width in the manual RTL layout.
- Review and hardening (22 September 2026): `complete` re-checks the caller's
  permission and turns a loader that throws into `stale`; `fail` counts the
  tokens and cost of a response the gateway served and RIVET rejected and
  trips the breaker on a billed live failure; `prepare` refuses candidate
  lists the request cannot honour and counts candidates in the size limit
  before the cache and the counters; a simulated failure never reaches the
  gateway in any mode; an unregistered `RIVET_JEV_FEATURES` key is warned
  about in the status view; the adapter accepts only Jev's own model ids and
  sends generic copy on invalid output; the card shows why an explicit ask
  was refused. Covered by `jev.test.ts`, `jevAdapter.test.ts` and
  `assist-suggestion.test.tsx`, plus prompt-injection and forged-id cases in
  `followupAssist.test.ts`, `contact-note-review.test.tsx` and
  `branchOpsAssist.test.ts`. Rollout and disable steps: docs/12, "Jev
  suggestions: controlled rollout and immediate disable".
- **Not verified:** any live call to AI Gateway, the model's accuracy on RIVET
  questions (including how well Jev reads Arabic headings, labels and
  requests), and whether the gateway reports a non-zero `cost` during the
  promotion (which would trip the breaker on the first live request). No
  `AI_GATEWAY_API_KEY` exists on this machine or on the development deployment.
  Run the smoke test only when zero-cost terms are confirmed:
  `RIVET_JEV_LIVE_SMOKE=1 RIVET_JEV_FREE_UNTIL=<date> pnpm --filter web exec vitest run convex/jev.smoke.live.test.ts`
  with the key exported in that shell only.

### Smoke test cost checks, 23 September 2026

The opt-in smoke is disabled in CI and checks eligibility before each request.
Each response must succeed and explicitly report zero cost before the next
request is sent. Missing cost is unknown and stops the run; errors and billed
responses stop it too. SDK retries are disabled for all adapter calls, so a
retry must enter through the guarded request path. This does not prove a first
request cannot be billed; account pricing must still be confirmed beforehand.
The offline regression tests in `convex/jevSmoke.test.ts` use synthetic results
and never contact Gateway.
