# Jev-assisted workflows: the shared foundation

_Status: foundation, member import assistance, intent-aware navigation and connected staff follow-up assistance implemented on `main` on 21 September 2026 (working tree). Live connectivity and model accuracy are **not** verified; see "What is verified"._

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
| `apps/web/src/features/followup/contact-note-review.tsx` | "Review note" in the contact form: the reading, the consequence preview and the accept action that sets only the outcome. |
| `apps/web/src/features/followup/related-task-check.tsx` | Open work for a person plus "Is this the same work?" with keep / follow-on / separate actions and the changed-task refusal. |
| `apps/web/src/features/followup/follow-up-context.tsx` | `useMemberFollowUpContext`, `FollowUpContextPanel`, `RenewalContextHighlight`, `ReminderTemplateSuggestion`, `evidenceHref`. |
| `apps/web/src/features/followup/reason-check.tsx` | "Check reason" for sensitive-action dialogs. |
| `apps/web/src/features/members/create-task-dialog.tsx` | The member workspace's task dialog (moved out of the page) with the related-work check and the explicit `relatedTaskId` link. |
| `apps/web/convex/jevLoaders.ts` | Server-side state loaders, one per question: re-check access, build the bounded state, name `scopeKey` and `sourceVersion`. |
| `apps/web/convex/jevAnswers.ts` | Pure: SDK request building, scoped candidate ids, answer validation, canonical JSON, SHA-256 state hashing, fixture evaluation (also used by the preview adapter). |
| `apps/web/convex/jevMode.ts` | Pure: environment switches, free-terms date gate, caps, `gateJevRequest`, block copy. |
| `apps/web/convex/jev.ts` | Default runtime: `status` query, `updateTenantPreference` mutation (audited), internal `prepare` / `begin` / `complete` / `fail` / `resetBreaker` / `cleanupExpired`. Cache, leases, usage counters, breaker. |
| `apps/web/convex/jevAdapter.ts` (`"use node"`) | The one place that calls the model: timeout, `maxRetries: 1`, provider pin, model check, validation, cost read, error classification. Injectable model/evaluate for tests. |
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
   `maxRetries: 1` and the provider pin, then validates the answer (exact
   question id, matching type, offered option only, coherent probabilities,
   score inside the scale).
5. `internal.jev.complete` re-loads and re-hashes the state; a changed record
   makes the result `stale` (never shown, never cached). Otherwise the judgment
   is cached when the question has a TTL, usage and reported cost are recorded,
   and a live cost above zero trips the breaker.
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

Free-eligibility facts as read on 21 September 2026: Vercel's pages for the
model (`vercel.com/ai-gateway/models/jev`), the changelog, the pricing page and
the FAQ show list pricing ($0.042 per million input tokens, output free) and
**no promotion**. Only a third-party guide states that Vercel listed Jev as free
under a promotion ending 25 September 2026. The gateway's free tier is a monthly
credit on a subset of models that requires a card on file
(`403 customer_verification_required` otherwise) and refuses requests with
`402` when the balance is not positive. None of this proves zero cost for this
account, so `RIVET_JEV_FREE_UNTIL` stays unset until an operator confirms it in
the Vercel dashboard, and the breaker treats any reported cost as the signal
to stop.

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
- **Not verified:** any live call to AI Gateway, the model's accuracy on RIVET
  questions (including how well Jev reads Arabic headings, labels and
  requests), and whether the gateway reports a non-zero `cost` during the
  promotion (which would trip the breaker on the first live request). No
  `AI_GATEWAY_API_KEY` exists on this machine or on the development deployment.
  Run the smoke test only when zero-cost terms are confirmed:
  `RIVET_JEV_LIVE_SMOKE=1 RIVET_JEV_FREE_UNTIL=<date> pnpm --filter web exec vitest run convex/jev.smoke.live.test.ts`
  with the key exported in that shell only.
