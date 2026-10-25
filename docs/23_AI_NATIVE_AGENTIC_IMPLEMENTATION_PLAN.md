# 23 — AI-native, agentic RIVET implementation plan

Date: 24 October 2026, Asia/Amman.

Status: **product direction requested by Hashem; implementation in progress on
the unreleased feature branch `codex/ai-native-rivet`.** This document specifies the
work. It does not claim that models, agents, provider connections, or the
experiences below are implemented or released; the canonical backlog (docs/13
AI-0 to AI-5) and CURRENT_STATE record actual progress and evidence.

## 1. Product mandate

RIVET should understand what is happening in a gym, prepare the next useful
action, carry out delegated desk work, and follow the result. Intelligence
belongs throughout the existing product: Today, member profiles, forms,
renewals, payments, reports, classes, operations, settings, etc.

Hashem's direction is deliberately ambitious: users should **“feel the AGI”**
through competence, context, continuity, and completed work. This is an internal
experience standard, not a claim that RIVET has achieved AGI. A receptionist
should feel that RIVET remembers the relevant details; an owner should be able
to delegate a real task and come back to a usable result.

The product has two inseparable capabilities:

1. **Quiet assistance:** context already assembled, fields prepared, related
   work connected, duplicate effort removed, useful next steps available.
2. **Delegated execution:** a person gives RIVET an outcome, RIVET uses its
   tools to complete the authorized work, verifies it, and returns the result.

Do not stop after shipping summaries or message drafts. Equally, do not make
people enter a conversation to benefit from intelligence. Preserve the
approved visual direction and ordinary ways of completing every workflow.

### Experience tests

- “It already found the information I needed.”
- “I wrote that once, and the right fields and follow-up were ready.”
- “It connected the payment, conversation, and renewal.”
- “I delegated the work; it actually finished it.”
- “It remembered my correction and stopped repeating the mistake.”
- “It noticed the situation changed and stopped the obsolete work.”
- “I can see what happened, correct it, and take over.”

Optimize for these experiences and operational outcomes, not AI badges,
conversation length, agent count, or the number of model calls.

“State of the art” means using current capable models and agent techniques
where they improve these outcomes: adaptive tool use, durable work, useful
memory, contextual artifacts, and more. Re-evaluate capabilities as models
improve. Voice notes, supported document understanding, and other input modes
can extend the same workflows when they remove real effort; each needs its own
data, accessibility, quality, and permission checks.

## 2. Scope, ownership, and room to discover more

The examples in this plan are a **minimum direction and a non-exhaustive
opportunity set**. Implementation agents should find more useful details,
shortcuts, delegable tasks, smarter defaults, exception handling, etc. while
working through the real product. Do not interpret a feature table as a ceiling.

Within the existing product and approved boundaries, agents may implement
additional reversible, useful improvements without asking about every detail.
Use this discovery test for each addition:

1. Identify the existing person, screen, task, and repeated effort.
2. Explain what RIVET can understand, prepare, execute, or verify better.
3. Identify the authoritative records and permitted actions.
4. Define the visible result, failure behavior, and acceptance example.
5. Record the addition and assumptions in the canonical backlog and handoff.

This latitude does not invent new commercial terms, paid integrations,
marketplaces, financial policy, external-message channels, or access rights.
Record consequential product decisions in docs/09; complete independent work
while a genuinely necessary decision is pending. Use `etc.` and additional
examples for discovery, never for unspecified tool permissions.

Documentation ownership stays unchanged:

| File | Responsibility |
| --- | --- |
| This plan | Product behavior, architecture requirements, milestones, acceptance contract |
| [Canonical backlog](13_PRODUCT_AND_OPERATIONS_TODO.md) | Work status, discovered improvements, defects, closure evidence; no second TODO list |
| [CURRENT_STATE](../CURRENT_STATE.md) | What is implemented, verified, released, or still missing |
| [Runbook](12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md) | Environment ownership, deployment, rollout, recovery, release evidence |
| [Decisions](09_DECISIONS_AND_OPEN_QUESTIONS.md) | Recorded decisions and unresolved consequential choices |
| [FRONTEND_HANDOFF](../FRONTEND_HANDOFF.md) | Frozen historical frontend contract; do not edit |

Existing release and acceptance work remains in force. This expansion must not
be presented as already shipped or silently become a blocker for unrelated fixes.

## 3. Repository starting point and constraints

Read `AGENTS.md`, `CURRENT_STATE.md`, the current backlog, and the runbook first.
Then read docs/05, docs/06, docs/07, docs/09, docs/14_SUBSCRIPTION_PRICING,
docs/19, docs/22, `DESIGN.md`, and applicable local instructions. Inspect the
current implementation; dated historical entries do not override newer policy.

The approved stack is **Next.js, TypeScript, Convex, Clerk, and Vercel**.
Convex owns business data and authorization; Clerk owns authentication.
`GymOSApi` is the page-facing boundary. Implement compatible real and explicit
mock adapters. Do not import model providers or direct Convex operations into
product pages, and never use mock results as a production fallback.

Useful existing seams, verified in the repository when this plan was written:

| Area | Start reading |
| --- | --- |
| Typed client boundary | `apps/web/src/lib/api/GymOSApi.ts`, `ConvexGymOSApi.ts`, `apps/web/src/lib/mock/MockGymOSApi.ts` |
| Today and attention | `apps/web/src/features/dashboard/today-queue.tsx`, `features/brief/needs-attention.tsx`, `apps/web/convex/operatingBrief.ts` |
| Member context and follow-up | `apps/web/convex/followupAssist.ts`, `apps/web/src/features/followup/`, `features/members/`, `features/crm/` |
| Permission and domain actions | `apps/web/convex/permissions.ts`, `domain.ts`, domain authorization tests |
| Existing scheduled work | `apps/web/convex/automations.ts`, `membershipJobs.ts`, `crons.ts` and their tests |
| Money and reporting | `apps/web/convex/reconciliation.ts`, existing payments, shifts, ledger and reporting contracts |
| Messaging policy | [docs/19](19_GO_LIVE_MESSAGING_EMAIL_LEGAL_PRICING.md), existing operational email and manual WhatsApp flows |

[The Jev foundation](21_JEV_ASSIST_FOUNDATION.md) is archived and its runtime
retired. Reuse sound concepts where useful, but do not restore obsolete tables,
flags, provider restrictions, free-model assumptions, or old “Ask Jev” UI.
Introduce the new capability deliberately with new, documented contracts.

Automated WhatsApp/SMS remains retired. Manual WhatsApp opens an editable draft;
it records a handoff, not proof of sending, delivery, reading, or reply. Email
uses the existing Resend boundary and its current gates. An agent cannot infer
replies from an inbox integration that does not exist.

Before any Arabic/RTL implementation, read `docs/arabic/README.md`, `STANDARD.md`,
the full `DECISIONS.md`, and `IMPLEMENTATION_PLAN.md`, then run
`python3 docs/arabic/verify-lock.py`. Preserve all 247 approved decisions at
revision 607 and Elias's work. This plan does not change approved translations.

### Isolated implementation — explicit requirement, 24 October 2026

Hashem wants the current polished RIVET preserved while other agents continue
bug fixes. Implement this plan in a **separate Git worktree and feature branch**,
such as `codex/ai-native-rivet`, created from freshly fetched `origin/main`.
A new branch in the shared active checkout is insufficient: changing its branch,
index, or files can interrupt another agent. Do not switch, stash, reset, clean,
stage, or commit the bug-fix agent's work.

Keep AI implementation commits on the feature branch and open a reviewable PR
when ready. Do not merge to main or deploy/activate production AI without a later
explicit instruction. Periodically integrate reviewed main changes into the AI
branch, preserving the other agent's bug fixes and resolving overlaps deliberately.
Multiple implementation agents should use bounded ownership and their own
worktrees/branches, coordinated through one AI integration branch.

Isolate runtime state as well as code. Use synthetic data and a separate
development/test Convex deployment, test identity configuration, and distinct
local ports where necessary. Do not copy the existing checkout's secret files
or deployment links wholesale; they may select production. Before any preview
or connected test, verify that its frontend, backend, identity, scheduled jobs,
and provider settings all target the intended test environment. Preview hosting
alone does not prove the backend is isolated. New AI capabilities start disabled
outside the intended test scope; ordinary RIVET behavior remains available.

### Free endpoint testing and where the key belongs

Hashem will find a free AI endpoint for testing. Build a replaceable server-side
provider adapter and deterministic fixtures while that is pending. Do not assume
the endpoint is OpenAI-compatible, supports tools/structured output, permits
member-data processing, or has unlimited free usage; verify the actual contract
when supplied and preserve the same task/tool authorization boundary.

Reserve the proposed configuration names `RIVET_AI_API_KEY`,
`RIVET_AI_BASE_URL`, and `RIVET_AI_MODEL`. They are a planned adapter interface,
not variables consumed by today's application. Add blank documented examples
and validation in the feature branch when the adapter is implemented.

- For model calls executed by the local Next.js server, Hashem can enter the
  key manually in **`apps/web/.env.local` inside the AI worktree**. That path is
  already ignored by Git. Keep the value server-only; never use `NEXT_PUBLIC_`.
- For model calls executed in Convex actions, enter the key in the **isolated
  development Convex deployment's Environment Variables dashboard**. A Next.js
  `.env.local` file does not configure hosted Convex actions.
- AI-0 must identify which process owns the model call and document the matching
  location. Hosted preview configuration belongs to that same test-side process,
  not to production. Do not duplicate keys across runtimes unnecessarily.

Never put a real key in `.env.example`, source, Git, a task prompt, chat, a shell
command, logs, or an evaluation artifact. The implementation agent should not
read or print secret-file values. Keep provider-backed evaluations opt-in and
use synthetic fixtures until the provider's data handling is approved.

## 4. Quiet intelligence in the existing UI

### Shared interaction patterns

- **Context beside the action:** short member context beside the contact form,
  relevant history beside a renewal, evidence beside a financial explanation.
- **Prepared fields:** suggest an outcome, date, assignee, category, or mapping
  in the existing form. Preserve anything the person has already edited.
- **Prepared work:** show a draft, selected records, comparison, or report in
  its normal destination. Provide normal editing and clear next actions.
- **Inline delegation:** an action such as “Prepare follow-ups”, “Check this
  difference”, or “Find a class” starts work with current context attached.
- **Task details:** show a compact status and result in the originating task,
  drawer, or page. Use existing Today/task surfaces for work requiring attention.
- **Natural-language search:** convert requests into normal editable filters,
  lists, report parameters, or task proposals. Keep the interpreted scope visible.
- **Progressive detail:** one useful sentence first; source records, changes,
  exceptions, and activity on demand. Explain evidence rather than displaying
  model-generated confidence percentages.

Reuse existing typography, components, surfaces, focus behavior, and responsive
patterns. Follow docs/22 for product copy. A floating chat widget, a separate AI
dashboard, animated thinking text, sparkle buttons everywhere, or a parallel
navigation system is not the default implementation of this plan.

### Small details are part of the acceptance contract

- Carry member, branch, selected records, time range, currency, and language
  into a task; do not ask people to identify what is already on screen.
- Distinguish recipient language from staff interface language. Respect the
  approved Arabic terminology and display dates in the gym's timezone.
- Read a relative date against the note's timestamp and tenant timezone. Show
  the resolved date; ask a small clarification when “next Monday” is ambiguous.
- Resolve ambiguous people or plans with a compact candidate picker. Never
  silently choose between two people with the same name.
- Show exactly which suggested fields will change. Accept one field or all;
  keep the original note and allow corrections before saving.
- Do not overwrite drafts, move focused controls, resort a list underneath a
  click, or reset scroll, selection, filters, and unsaved input as AI updates.
- Use one operational item for one situation. Group a renewal, attendance change,
  and related conversation without deleting distinct tasks or source history.
- Respect “already handled”, “not useful”, snooze, travel dates, freezes,
  resolved complaints, etc. Resurface only for a meaningful change or due time.
- Do not hide mandatory safety, financial-control, or approval work because an
  AI ranking prefers another item. Preserve a complete, stable list.
- Distinguish observed facts, staff statements, suggestions, and unknowns.
  “Travelling, according to the last call” is not a verified location.
- Show stale or incomplete context plainly; missing data must never mean
  “everything is fine”. Recheck live eligibility before booking or committing.
- Make cancellation, correction, takeover, and retry available where work runs.
  Provide undo only when the domain actually supports it; financial reversals
  remain new audited operations.
- Use normal accessible loading/status states, keyboard controls, focus
  restoration, reduced motion, and phone layouts. Long work can continue after
  leaving the page; navigating back reveals the same run and current result.
- Keep check-in, payments, navigation, and ordinary forms usable during model
  outages. Show a concise local failure and a practical manual next action.
- Notify on a useful completion, meaningful failure, or required decision.
  Background checks with nothing new stay quiet; do not generate daily noise.

These examples are intentionally open to more improvements discovered in use.
The goal is less remembering, searching, typing, and checking for the user.

## 5. One shared understanding of the gym

Build scoped, purpose-specific context from authoritative records. A member's
timeline connects leads, conversations, offers, membership terms, attendance,
payments, freezes, messages, tasks, and staff actions. Branch operations and
platform records have their own correctly scoped histories.

Context must include enough of the following to do the particular job: current
facts, relevant source passages, gym policy, consent/channel preferences, open
work, recent outcomes, permission constraints, freshness, missing sources, etc.
Do not send an entire gym database or unrestricted sensitive notes to a model.

Separate three kinds of memory:

| Kind | Handling |
| --- | --- |
| Recorded facts | Domain records remain authoritative. Corrections use ordinary domain actions and preserve history. |
| Explicit preferences and policies | Store with owner, scope, provenance, effective dates, and revision. People can inspect, correct, or revoke them. |
| Derived context and hypotheses | Link to sources, timestamp, invalidate, and expire. Never silently promote a hypothesis into a member fact. |

A staff correction can immediately fix the current draft. Saving a lasting
preference must be apparent. Do not infer a gym-wide policy from one edit or
silently train across tenants. Approved operational policies are versioned;
untrusted text in notes, imports, support messages, etc. cannot become policy.

Recompute only affected context when relevant records change. Include tenant,
branch/access scope, subject, source revisions, locale, policy version, and
prompt/model version in appropriate cache keys. Recheck access when serving
cached summaries, reports, generated files, and source links. A permission change,
merge, deletion, or corrected source must invalidate affected derived content.

Begin retention work with observable facts and explicit rules. Compare a
member with their own baseline where data permits; account for known freezes,
travel, incomplete attendance capture, seasonal schedules, etc. Add statistical
prediction only with enough representative data and measured calibration.
An invented “87% likely to leave” is unacceptable. Explain report changes from
verified decomposition; distinguish correlation from an established cause.

## 6. Delegable desk work is a product-wide requirement

For every existing workflow, ask: **can a person reasonably delegate this desk
task, or a useful part of it, to RIVET?** If yes, provide the appropriate typed
capability, contextual entry point, execution path, and verifiable result.

The goal is broad coverage over time. An initial tool limitation is an
implementation gap to record, not a permanent excuse to give instructions for
work RIVET could safely perform. Physical work still belongs to people: an agent
may prepare a cash-count worksheet, but cannot observe cash in the drawer,
inspect a machine, make a human phone call, or claim those actions happened.

### Non-exhaustive capability map

| Existing workflow | Quiet assistance and delegable work | Completion evidence / boundary |
| --- | --- | --- |
| Today and follow-up queues | Prioritize relevant work, connect related items, prepare a call list, assign eligible internal tasks, clear obsolete generated work, etc. | Linked tasks and outcomes; complete list remains accessible; no duplicate owner for the same work |
| Member profile and timeline | Prepare a contact brief, find a receipt or old conversation, explain membership history, assemble the next action | Source links and freshness; only records the actor may read |
| Contact logging | Extract outcome, promised date, preference, topic, and next task from a short note; suggest links to existing work | Original note preserved; accepted fields saved once; no invented call or member statement |
| Leads and sales | Prepare a sales queue, draft follow-ups, compare eligible plans, prepare an offer using approved pricing, identify missing information | Drafts/tasks or a permitted saved action; no fabricated offer, discount, or contact attempt |
| Renewals and retention | Prepare a recovery batch, explain attendance changes, choose a relevant next step, watch for renewal or reply facts | Duplicate suppression and stop conditions; renewal is verified from the domain record |
| Reception | Prepare relevant reminders, find the right member, explain an entry issue, route an unresolved request | Check-in and access decisions still use domain rules; critical path never waits for AI |
| Memberships | Compare permitted alternatives; prepare renewals, freezes, date changes, transfers, etc.; execute an explicitly approved change | Existing validation, approval, audit, and monetary consequences preserved |
| Classes and PT | Find suitable eligible sessions, prepare a reschedule, book within granted authority, coordinate a permitted batch | Recheck capacity, eligibility, credits, conflicts, and cancellation terms at commit |
| Payments and collections | Assemble unpaid-account context, locate receipts, prepare collection work, suggest possible payment matches | Exact arithmetic from services; no claim of payment without recorded evidence |
| End-of-day cash count and ledger | Investigate a difference, collect supporting transactions, prepare a report or adjustment proposal | Explain candidates and unresolved differences; human supplies physical count; posting/approval policy unchanged |
| Operations and handover | Classify a fault, find related repair history, prepare/assign jobs, assemble the next-shift handover | Linked reports and open tasks; cannot certify a repair, cleaning, or inspection without recorded evidence |
| Stock and purchasing | Explain unusual usage, suggest replenishment, prepare a draft order, compare recorded supplier terms | Draft/internal work first; autonomous purchasing remains outside current scope |
| Imports and data cleanup | Map columns, resolve plan labels, detect duplicates, prepare a reviewed import or merge proposal | Preview, provenance, validation, and existing merge/import authorization; preserve historical links |
| Reports and exports | Build a scoped report, answer a question from real figures, prepare an authorized export, schedule an internal recurring report | Verified totals and coverage; protected artifact; export permission and retention respected |
| Settings and automation | Explain current settings, turn an instruction into a proposed rule, preview affected records, save a permitted configuration | Exact conditions/actions/scope visible; enabling a recurring grant is an explicit action |
| Support and gym public profile | Assemble case context, draft a reply, identify unanswered points, prepare factual copy updates | Existing case/publication actions; source-supported claims and language review |
| Platform console | Prepare application/billing/support review, explain exceptions, gather evidence for an operator decision | Separate platform authority; no blanket cross-tenant gym-agent access |
| Member portal | Help a member find eligible classes, retrieve their records, prepare or perform their permitted booking/task | Self-only tools and member authorization; no access to internal staff context |

More desk work, microinteractions, document preparation, supported file analysis,
and contextual shortcuts should emerge from the workflow inventory. Start with
the highest-value journeys; the map is not a requirement to release every row
at once or to introduce new modules solely for AI.

### Delegation contract

A run has a concrete goal, scope, initiating actor, authority, success criteria,
limits, and destination for its result. The application supplies known context.
The agent may plan, select approved tools, inspect results, adapt within scope,
and continue until the goal is met or a specific dependency is identified.

Example: “Prepare Monday's renewal follow-ups for this branch.” With authority
to create internal tasks, RIVET can find eligible members, inspect recent
contacts, exclude resolved work, prepare messages, create/assign deduplicated
tasks, verify them, and return the saved list. It should not require approval
for each search and task. External delivery remains a distinct consequence.

Show brief, truthful state such as “Checking recent contacts”, “Ready to review”,
“Created 12 follow-ups; 3 need your decision”, or “Stopped; 4 tasks were already
saved”. Counts here are illustrative, not product claims. The result links to
the actual records and explains exclusions or partial work that matter.

Support a short correction such as “Only the evening members” from the task
details. Replan remaining work, explain already completed changes, and apply
compensation only where supported. Do not start unrelated duplicate runs.

Recurring delegation is a visible, editable standing instruction with an owner,
scope, schedule/event trigger, permitted actions, limits, and pause control.
“Every Monday, prepare follow-ups” grants preparation, not sending or discounting.
Preview initial effects before enabling a new recurring instruction.

## 7. Authority without approval fatigue

Preparation and execution are both first-class. Use the authority the user
already granted; do not make routine delegation a sequence of redundant dialogs.
Conversely, natural language and model confidence never bypass domain policy.

| Mode | Default behavior | Examples |
| --- | --- | --- |
| Contextual preparation | Automatic within enabled AI/data policy and current read access; no business mutation | Summaries, suggestions, draft messages, candidate matches |
| One-off delegated execution | Perform supported internal/reversible actions within the explicit task grant | Create follow-ups, assign permitted tasks, save an internal report |
| Standing delegated execution | Execute the listed actions within an explicitly enabled, revocable policy | Weekly internal report, follow-up preparation, stale generated-task cleanup |
| Consequence review | Prepare the concrete result, then use the existing required approval; execute once approved | Refund, discount, date override, cash close, posting, permission change, publication, destructive merge |
| External communication | Respect channel capability, recipient scope, consent, content approval, and delivery policy | Reviewed manual WhatsApp handoff; supported email through existing gates |

An explicit instruction may authorize a supported action without another generic
confirmation. Where RIVET already requires approval or a reason, preserve it.
Bundle reviews into one understandable changeset where possible. Bind approval
to exact records, amounts, terms, recipient/content, source revisions, and expiry;
material changes invalidate it. An agent cannot approve its own proposal.

Effective authority is the intersection of current actor access, tenant/branch
scope, current plan entitlements, delegation grant, tool policy, and any required
approval. Enforce it server-side at reads and again immediately before writes.
Delayed work uses a persisted, narrowly scoped delegation principal, not a
captured browser session or an unrestricted service credential. Revoked staff,
suspended gyms, changed roles, expired grants, and disabled features stop the
affected work. A standing gym-owned run needs an explicit accountable owner and
transfer/revocation rules; it must not survive loss of authority by accident.

## 8. Architecture and implementation contracts

### One governed capability layer

Expose well-defined business operations as tools around existing domain
services. UI actions and agents share the same validation, authorization,
idempotency, audit, and error envelope. Add missing domain operations when a
delegable workflow requires them; avoid a giant untyped command or direct
database access. Agents must not manufacture success by writing timeline text.

Each tool defines typed input/output, read scope, permissions, entitlements,
side-effect class, preview behavior, source-version preconditions, idempotency,
approval requirements, verification, and failure/compensation behavior.
An allowed tool name alone is not permission to act on arbitrary record IDs.

Package reusable gym-task instructions as versioned skills/playbooks with a
goal, permitted capabilities, needed context, and verifiable completion criteria.
Allow the agent to compose tools for new task variations within its grant.
Discover/load only the relevant permitted tools and context for the current job.
Test unfamiliar phrasing and combinations, not only fixed demonstration scripts.
Changing an instruction file never changes server-enforced authority.

Prefer scoped queries and commands to browser clicking inside RIVET. A future
external API/MCP or computer-use adapter must use the same grants and audit.
Browser execution is a separately evaluated fallback for a supported integration,
with restricted destinations and explicit handling of irreversible actions;
it is never a route around missing authorization or the manual messaging policy.

### Durable execution

The production path should be:

```text
Domain event / schedule / contextual user request
  -> scoped context and current policy
  -> bounded model judgment or agent plan
  -> typed proposal / permitted tool operation
  -> authorization, approval, and current-state validation
  -> existing domain command
  -> verified outcome, timeline/audit, and result in the existing UI
```

Persist enough state to resume after navigation, process failure, or deployment:
goal, authority, plan revision, source references, steps, tool receipts,
dependencies, waits, result references, and budget. Proposed states are `queued`,
`running`, `waiting_for_approval`, `waiting_for_input`, `waiting_for_event`,
`completed`, `partially_completed`, `failed`, and `cancelled`; keep technical
state names out of user copy. A wait has an owner and timeout/escalation behavior.

Use leases or equivalent concurrency control, bounded retry/backoff, deadlines,
deduplication, and durable event delivery. Couple business changes and the
events that trigger follow-up through a transactional or recoverable outbox
design. Model calls stay outside retried database transactions.

Assume retries and duplicate events occur. Derive stable operation keys and
verify persisted outcomes before repeating a write. After an ambiguous external
timeout, check the provider receipt/state or ask for intervention; do not blindly
resend. Cancellation stops future steps and reports in-flight/completed effects;
it does not pretend to roll back a sent message or posted transaction.

Coordinate human work, existing automations, recurring instructions, and other
agent runs. Use a shared contact/work deduplication boundary and current-source
checks. A renewal or recent contact can invalidate queued AI work immediately.
If a provider does not expose an outcome, keep it unknown.

### Proposed records and client methods

Finalize names against the existing schema in milestone AI-0. These are design
contracts, not existing APIs or a mandate to duplicate equivalent records.

| Record | Minimum purpose |
| --- | --- |
| Capability definition | Versioned tool contract and required policy; normally code-owned |
| Delegation grant / recurring instruction | Granting principal, accountable owner, scope, actions, limits, revision, expiry/revocation |
| Agent run and step | Goal, authority reference, state, source versions, budget, leases, tool receipts, partial result, errors |
| Proposal / approval reference | Exact changeset, evidence, approver, state/version, expiry; reuse existing approval infrastructure |
| Derived context / suggestion | Subject, provenance, source/access scope, freshness, invalidation and useful feedback |
| AI usage / operational trace | Model/prompt/tool versions, latency, safe error categories, token/cost usage, outcome references |

Expose typed methods for preparing context, starting/subscribing to/getting a
task, revising/cancelling it, reviewing proposals, recording useful feedback,
and managing standing instructions. Keep UI access through `GymOSApi` and the
existing realtime/cache layer. Mock mode simulates the same meaningful states
and consequences with explicit fixtures; fake success is not live validation.

Audit who requested work, the delegation and policy used, what executed, who
approved, the domain result, and timestamps. Keep concise activity/evidence,
not private chain-of-thought. Raw prompts and full member notes should not be
ordinary logs. Retention, export, tenant purge, financial retention, and access
rules must cover new records, caches, embeddings, traces, and generated files.

### Runtime and model selection

Keep the existing stack. First evaluate a bounded model/tool layer with Convex
as business authority and durable application-state owner. Compare a compatible
agent runtime, including eve, where it materially supplies durable execution,
tool orchestration, or evaluation. Record the decision and tradeoffs in docs/09.
Do not scaffold over the application or introduce a second business database.
If an external runtime owns execution checkpoints, explicitly define the
boundary and recovery protocol so only Convex commits business changes.

Check installed APIs and current official documentation before implementation.
For example, eve's documentation currently requires Node 24, while this repo
declares Node >=20: compatibility must be established rather than assumed.
Use current stable compatible dependencies and commit the lockfile; do not pin
arbitrary versions in this plan. [Official eve setup documentation](https://eve.dev/docs/getting-started).

Evaluate current capable models on RIVET tasks in Arabic and English. Use small,
fast models for bounded extraction when they pass; use stronger reasoning where
planning and ambiguity require it. Route by measured quality, latency, and cost.
Version prompts and model configuration, define approved fallbacks, and run
regression evaluations before model/provider upgrades. Do not lock product
identity to a model brand or resurrect Jev's free-only restriction.

Bound model/tool steps, elapsed time, per-run spend, tenant concurrency, and
monthly spend. Record concrete pilot limits before activation, with useful
budget-exhausted behavior and no surprise automatic purchases. Event-driven
preparation, cached context, and bounded retrieval should prevent whole-history
scans and a fresh model call on every render.

Use multi-agent execution only where specialization or independent parallel work
improves evaluated results. All child work inherits narrower authority and a
shared parent budget; it cannot grant itself tools, access, or more money.
Simple workflows should remain simple. The distinction between fixed workflows
and adaptive agents is useful architectural guidance, not a demand to make every
step autonomous. [Anthropic's agent architecture guidance](https://www.anthropic.com/research/building-effective-agents).

## 9. Data and execution boundaries

Treat imported files, member notes, support messages, retrieved pages, and tool
content as untrusted evidence. Instructions embedded in them cannot change
system policy, reveal other members, obtain secrets, add tools, or authorize an
action. Validate structured model outputs and record references server-side.

Data sent to a model must satisfy the selected provider's approved processing,
retention, and regional requirements. Minimize personal fields, exclude sensitive
notes unless the particular task and actor are authorized, and isolate tenants
in retrieval, caching, tracing, and generated artifacts. Secrets remain in
provider/server configuration and never enter model context or tool output.

For supported analytical code/file tasks, use an isolated environment with
scoped input, resource limits, restricted network access, and validated outputs.
No production database credentials or arbitrary shell access. Validate report
totals using domain services and protect generated downloads with current access
checks and expiry. Adding new file-upload types is a separately recorded feature.

Provide global, tenant, capability, and run-level stop controls. Distinguish
read/preparation mode from write mode. Stopping AI leaves ordinary gym workflows
available and does not delete domain history. Tenant settings should explain
practical behavior, allowed work, and external data use in plain language.

## 10. Flagship journey: renewal follow-up from start to finish

Use a synthetic fixture such as Omar; these details are illustrative.

1. His membership ends in eight days. Attendance was about three visits per
   week and is now absent for twelve days. A recorded conversation mentions
   difficulty finding an evening class.
2. RIVET creates one connected opportunity in the existing Today/renewal work:
   “Check in with Omar about evening classes.” It shows the supporting facts
   and eligible availability, with links to the source records.
3. Opening the item reveals a concise member brief and an editable message in
   his preferred language. Recheck capacity before offering a booking. Existing
   contact preferences and recent contacts govern whether outreach is suitable.
4. The staff member can call or review the manual WhatsApp draft. Opening
   WhatsApp does not mark the message sent or the conversation completed.
5. They write “Travelling until Sunday, call Monday evening, interested in
   renewing.” RIVET prepares the appropriate contact outcome and follow-up,
   displays the resolved date/time, and highlights any ambiguity.
6. Saving records the note and accepted fields once. The travel explanation
   suppresses the relevant absence suggestion for its bounded period without
   modifying attendance history, hiding an unpaid balance, or claiming travel
   is independently verified.
7. If a follow-up already exists, update/link the permitted work instead of
   creating a duplicate. If another staff member contacts him, refresh the
   remaining work before acting. If he renews, stop obsolete renewal work.
8. The outcome appears in the same timeline and queue. Measure staff effort,
   errors, unnecessary contacts, and the renewal outcome separately.

The same machinery must support “Prepare this branch's renewal follow-ups” as a
delegated batch. Validate each member, retain exclusions, show progress and
partial results, and continue safely after interruption. This proves actual
execution, not only a collection of suggestion cards.

## 11. Milestones and concrete delivery order

Track status under these IDs in the canonical backlog. Deliver vertical slices;
avoid building a generic agent platform for months before a useful workflow.
The first loop is a starting point, not the final extent of AI-native RIVET.

### AI-0 — Workflow inventory, baseline, and technical decision

Inventory existing screens/actions by role and branch. Mark each as read,
prepare, execute with a grant, review before execution, or physical/unsupported.
Identify missing tools, all current automations that may conflict, and at least
one additional useful QOL improvement per selected journey. Record proposed
additions in the canonical backlog; do not manufacture low-value AI usage.

Capture a manual baseline for renewal follow-up, task preparation, and report
assembly. Define fixtures, outcome checks, initial quality/latency/cost targets,
and provider/data-handling decisions. Select the smallest compatible runtime
that satisfies the durable-run contract, using a synthetic resume/revocation
prototype. Establish concrete pilot budgets before any live provider activation.

Exit: a reviewed capability inventory, architecture decision, representative
evaluation set, measurable baseline, and a runnable synthetic technical proof.
Unavailable credentials must not prevent local contracts, fixtures, or UI work.

### AI-1 — Shared foundation with the first useful member context

Implement scoped context, typed tools, proposal/run records, authority checks,
usage limits, safe traces, cancellation, feature controls, and mock parity.
Add member context beside an existing contact action, including source links,
freshness, missing-data behavior, and ordinary fallback.

Exit: real backend-to-UI context flow; cross-tenant/branch denial; invalidation
after source/access change; malformed-model, timeout, and unavailable-model cases;
no dependency of check-in/payment on model availability.

### AI-2 — Complete renewal loop and first executable desk delegation

Ship section 10 across Today, member profile, contact logging, renewal work,
manual WhatsApp, and the timeline. Include one contextual “prepare follow-ups”
batch that actually saves authorized tasks and drafts and verifies its results.
Handle source changes, deduplication, travel/freeze suppression, and renewal stop.

Exit: single-member and batch journeys pass with real domain mutations in
isolated staging; interruption/retry does not duplicate tasks; no false send or
contact claim; English/Arabic/phone interactions pass. Summaries alone do not
complete this milestone.

### AI-3 — Persistent delegation and reusable desk capabilities

Add inspect/resume/revise/cancel/takeover behavior and standing instructions.
Complete at least three distinct jobs: prepare a follow-up batch, generate a
scoped management report/export, and assemble/assign the next-shift handover.
Support user steering without restarting completed work, concrete grouped
approvals, and helpful completion/exception reporting in existing surfaces.

Exit: work survives navigation and worker restart; revocation stops pending
writes; scheduled runs stay within grants; each job produces verified saved
records or protected artifacts; uncertainty and partial results are truthful.

### AI-4 — Expand across finance, operations, imports, and more

Prioritize payment-difference investigation, sales preparation, operations
triage, import assistance, class/PT tasks, natural-language filters, etc. using
measured value and capability readiness. Extend coverage into the member portal
and platform console only with their separate authorization models.

For every slice, deliver its real tool path, existing-UI integration, approval
behavior, fallback, evaluations, accessibility/localization, and outcome measure.
An approved financial operation may execute through the normal domain service;
AI must not remain permanently limited to telling the user where to click.

Exit: selected desk tasks can be completed end to end, and remaining coverage
is explicit in the canonical inventory. Newly discovered QOL work is recorded
and verified with the same standards.

### AI-5 — Controlled pilot, evidence, and expansion of autonomy

Release through internal fixtures, isolated staging, selected-tenant preparation
mode, reviewable execution, and explicitly enabled standing authority. These are
capability-level controls, not a mandatory approval prompt for every use.

Measure usefulness, task completion, corrections, unnecessary contacts, latency,
cost, and failure recovery. Compare assisted workflows with a baseline or
appropriate controlled cohort; a payment or renewal after a suggestion is not
proof of incremental revenue. Expand autonomy only for tasks with demonstrated
reliability and clear domain policy. Record release evidence in docs/12 and
CURRENT_STATE, and revisit model/runtime choices as capability improves.

Exit: live evidence for the exact released scope, known limitations, effective
stop controls, cost headroom, incident ownership, and a repeatable improvement
process. Marketing describes those results without claiming unverified AGI,
market-first status, or universal superiority.

## 12. Evaluation and acceptance

Maintain versioned synthetic or appropriately authorized/de-identified fixtures
for realistic gym tasks. Include English, Arabic, mixed-language notes, local
date ambiguity, sparse history, conflicting records, and adversarial content.
Use separate held-out cases; do not optimize only for the published demo member.

Evaluate the full run and persisted business result, including tool selection,
approvals, and recovery. Model-rated prose quality is only one signal; exact
domain assertions and human review remain necessary. Trace-based review and
repeatable datasets support different stages of this process.
[OpenAI's agent evaluation guidance](https://developers.openai.com/api/docs/guides/agent-evals).

| Area | Required evidence |
| --- | --- |
| Context and summaries | Each material claim supported; source links authorized; amounts/dates correct; unknowns and stale sources visible |
| Note extraction | Correct fields and dates; ambiguity surfaced; no overwrite of staff edits; original note preserved |
| Delegated execution | Real requested result; bounded actions; saved state verified; no false success when a tool fails |
| Authorization | Tenant/branch/role/entitlement denial, inaccessible source passages, sensitive notes, protected downloads, revoked delayed grants |
| Money and approvals | Existing invariants retained; exact approved changeset; changed amounts/terms invalidate approval; no unauthorized financial write |
| Concurrency and recovery | Human edits during a run, duplicate events, parallel runs, worker crash after commit, approval expiry, ambiguous provider timeout, cancellation during write |
| Contact and scheduling | Recent-contact dedupe, manual handoff truthfulness, quiet hours, consent/channel changes before delivery, renewal/freeze stop, capacity recheck |
| Prompt injection | Notes/files/tool results cannot widen scope, change policy, obtain secrets, invoke unauthorized tools, or leak tenant data |
| User experience | Ordinary work survives outage; keyboard/focus and phone flows work; Arabic/English parity; no list jumps, overwritten drafts, or repeated irrelevant nudges |
| Cost and speed | Per-run/tenant limits enforced; prompt/context size bounded; cached context used appropriately; unrelated work remains responsive |

Initial proposed pilot thresholds below are implementation targets, not measured
claims. AI-0 may refine them with a documented rationale before the pilot:

- Zero unauthorized reads/writes, duplicate financial effects, fabricated
  completed actions, or bypassed approvals in the release acceptance suite.
  A finite passing suite is not proof that a system can never fail.
- At least 95% exact extraction of required unambiguous fields on the held-out
  bilingual set; ambiguous inputs must abstain or request clarification.
- At least 90% successful end-to-end completion of the initially supported
  delegated jobs on held-out cases, with no critical policy failures. Report
  task-type results and sample size, not only an aggregate score.
- At least 30% reduction in median staff time for the flagship preparation and
  logging journey against its recorded baseline; report correction effort too.
- No model wait on check-in/payment execution. Target cached context visible
  within one second and ordinary on-demand drafts at p95 within five seconds
  on the measured pilot setup; longer tasks show durable progress promptly.
- Define and meet actual currency-denominated run/monthly budgets before live
  activation. Report cost per successfully completed task, including retries.

Investigate dismissals, frequent corrections, unsupported conclusions, repeated
clarifications, and needless approvals. Acceptance rate alone can hide bad
suggestions or rubber-stamping. Review outcomes before modifying prompts,
models, ranking, or standing policies; do not self-modify production authority.

## 13. Verification commands and release procedure

These commands exist today; run the checks appropriate to each implementation
slice and the full required release gates before release:

```bash
pnpm test
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm build
pnpm test:e2e
python3 docs/arabic/verify-lock.py
git diff --check
```

Add documented commands for deterministic AI fixtures and opt-in live model
evaluations when implementing them. They do not exist merely because this plan
requires them. Keep normal CI credential-free; separately record actual
provider/model and credentialed staging evidence, skipped checks, and cost.

Deployment and environment handling follow docs/12 and AGENTS.md. Use only
`pnpm convex:deploy` for deploy/dry run, and names-only environment inspection.
Never expose secrets through commands, logs, traces, artifacts, or chat. This
documentation change performs no deployment, provider activation, or production
write. Recheck the current branch and concurrent work before implementation.

For each release record source SHA, target, model/prompt/tool configuration
versions, enabled capabilities and tenants, execution mode, evaluation results,
provider evidence, budgets, owners, and rollback/stop procedure. Rehearse stopping
new runs, revoking pending grants, handling in-flight effects, and returning to
ordinary workflows without losing recorded business events.

## 14. Decisions, assumptions, and implementation handoff

The product owner requested quiet, integrated AI plus broad delegation of desk
tasks. The sequence, schemas, metrics, and interaction examples in this document
are concrete engineering proposals to refine against evidence, not separately
approved commercial or provider commitments.

| Item | Working direction / required resolution |
| --- | --- |
| Product surface | Existing UI and task flows; contextual delegation; no redesign required |
| Scope | More useful QOL and desk-task capabilities are encouraged within the discovery contract |
| Runtime | Preserve the approved stack; AI-0 selects a compatible runtime and documents checkpoint ownership |
| Models and providers | Select by current bilingual evaluations, processing requirements, quality, latency, and cost; no provider selected by this plan |
| Standing authority | Explicit, scoped, revocable grants; current domain approvals and permissions remain binding |
| Messaging | Manual WhatsApp and existing gated Resend behavior; new channels require their own decision |
| Commercial packaging | AI allowances, limits, and pricing are undecided; do not silently alter Basic/Pro promises |
| Data handling | Confirm provider processing/retention, tenant controls, trace retention, and purge behavior before live member data |
| Pilot | Choose participating gyms, accountable owners, concrete budgets, success measures, and incident responsibility before activation |
| New integrations or physical capabilities | Record separately; prepare useful work using existing supported data while dependencies remain unavailable |

A slice is complete when the actual authorized workflow works through the real
backend and existing UI, required checks pass, results are truthful, and current
state/backlog/runbook evidence is updated. A demo, a disconnected card, a mock
response, or an agent that only narrates what it would do does not satisfy it.

When handing off, report what was implemented, what remains, commands to run,
tests/evaluations and their results, compromises/assumptions, release status,
and the files to read first. Continue looking for more ways to remove desk work
and make the whole product feel attentive, capable, and dependable.
