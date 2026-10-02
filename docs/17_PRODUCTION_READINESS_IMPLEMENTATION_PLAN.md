# 17 — Production Readiness Implementation Plan

Status: implementation plan; no product code or production data is changed by this document.

## Latest local implementation status — 28 August 2026

The committed repository-hardening sprint final application/code verification
tip is `3c99fc7`; the final pushed history also includes this documentation
reconciliation,
after starting from `e1cac31127a94659ad95f1e0f5f45f536678fa6f`. The planned
P0/P1 slices include explicit branch scope, retail finance/accounting,
invitation and
multi-org security, public media and abuse controls, production fail-closed
configuration, provisioning retry preservation, real Clerk customer signup,
atomic inventory transfers, and truthful deferred handling for Facilities and
Automations. This sprint also adds public recovery, CRM identity/progression,
permanent role-routing browser coverage, CI browser/repository safety gates,
the Next production dependency repair, and RIVET image warning fixes. The
primary Operations scope is Inventory, Checkout, and Machines.

The final independent security review also fixed required upload-intent and
storage ownership checks, member-photo branch authorization, authorization
before purchase-order and PT idempotent replay responses, and strict Clerk
invitation/application/workspace metadata matching. External edge/IP/device
rate limiting and provider-backed/Production verification remain open.

Credential-free local validation passed: **148 Vitest files / 913 tests**,
**14 repository safety tests**, application and Convex TypeScript checks, full
lint and secret-output audit, the production Next build with **51 route
entries**, full Playwright with **39 passes / 14 explicit credential-gated
skips / 0 failures**, `pnpm audit --prod` with no known vulnerabilities, and
`git diff --check`.

GitHub Actions [33127740606](https://github.com/hashemnusair/Rivet/actions/runs/33127740606)
passed for the exact application/code tip. Vercel Production deployment
[`dpl_28TJU394KFMmiE1bxddpZj2TVMc5`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/dpl_28TJU394KFMmiE1bxddpZj2TVMc5)
is `READY` for the same tip, and the canonical site returned HTTP 200.

This is repository and web-deployment evidence, not a Convex deployment claim.
No Convex Production deploy, provider/configuration change, credentialed
staging run, or Production data mutation was performed in this sprint. The 14
skipped browser journeys require explicit isolated credentials;
live provider-backed invitation/signup verification and Production smoke,
rollback, capacity/headroom, and backup/recovery gates remain open.

This plan converts the repository-wide readiness audit into an ordered engineering and verification program. It is intentionally specific about boundaries, evidence, migrations, and stop conditions because RIVET handles tenant access, member personal data, inventory, payments, receipts, cash drawers, and financial history.

## Executive summary

RIVET has moved beyond a screen-level prototype. The repository contains a substantial Convex-backed multi-tenant application with Clerk identity, branch-scoped operations, subscription administration, CRM, reception, payments, receipts, shifts, accounting, PT, media, support, audit, and a production-shaped mock adapter. The current credential-free gate is strong: 148 Vitest files and 913 passing tests, 14 repository safety tests, application and Convex TypeScript checks, full lint and secret-output checks, a 51-route production Next build, and 39 passed / 14 explicitly skipped credential-gated Playwright journeys.

The remaining work is not another broad redesign. It is a correctness and proof phase. The highest risks are silent branch selection, incomplete retail refund/accounting behavior, invitation and production fail-closed boundaries, provisioning retry safety, and the absence of credential-complete two-tenant staging evidence. These issues can create the wrong operational record, expose data, misstate cash or profit, or make a successful deployment look functional while still using a preview path.

Implementation must proceed in this order. The Convex target check and dry run happen before staging; an actual Production deploy happens only after staging has passed.

1. Make every mutation require an explicit branch.
2. Close the retail sale → receipt → shift → refund/void → stock → accounting lifecycle.
3. Harden identity, tenancy, media, production mode, abuse controls, and security headers.
4. Make provisioning retries preserve authoritative state.
5. Replace the customer signup preview with a real Clerk signup flow.
6. Verify the exact Convex target and operator shell, run the guarded dry run, and clear capacity/backup gates before staging; do not deploy Production yet.
7. Run authenticated, isolated, two-tenant/two-branch staging acceptance; keep
   the credential-free Playwright suite as a permanent CI gate while
   credentialed staging journeys remain local-only.
8. Enable and verify platform subscription reconciliation in isolated staging, separately from member renewal jobs.
9. Deploy the current Convex backend through the guarded wrapper strictly after staging passes, then verify the target and health.
10. Decide and then implement the remaining P1 operational/provider surfaces: inventory transfers, automations, facilities, email, CRM offers, platform branch administration, and Arabic/RTL completion.
11. Finish performance, observability, accessibility, mobile, rollback, and supervised Production evidence.

No item is “live” merely because code, a mock test, a successful build, or a Vercel deployment exists. A live claim requires evidence from the correct environment and the correct identity/data path.

## Current baseline and strengths

The plan starts from the current repository rather than the original MVP checklist.

### Audit scope and evidence boundary

This readiness review began against commit `fca26086af9ce603e2cac8ca1fbd7e32424953ce` on **2026-08-25**. The earlier 128 test files / 743 passing tests and the intermediate 136 files / 828 tests are historical audit baselines; current evidence is recorded above as 148 Vitest files / 913 tests plus 14 repository safety tests. All of these are local/repository evidence and are not a claim that the current SHA is deployed to Convex Production. CI, Vercel, isolated staging, and Production evidence must be recorded separately against the exact SHA and target. This plan makes no claim that the current Convex backend is live.

### Already substantial

- Next.js App Router frontend with a `GymOSApi` data-access boundary, Convex as the authoritative backend, and Clerk as the identity provider.
- Tenant, branch, role, permission, audit, and module-entitlement enforcement in backend paths, with MockGymOSApi parity for preview and unit tests.
- Platform applications, provisioning, four subscription tiers, annual pricing, invoices, suspension, support, and subscription lifecycle projections.
- Gym operations including members, memberships, CRM, reception, check-ins, payments, receipts, cash shifts, refunds/voids, PT, inventory, retail checkout, suppliers, purchase orders, equipment, and machine issue workflows.
- Management reporting and ledger primitives, with append-only financial/audit facts and history-preserving archive/deletion rules.
- Media upload/finalization authorization, sanitized public assets, brand/profile work, operational email queue primitives, automation command primitives, and native Arabic fields/RTL readiness.
- Realtime seams and failure/stale-snapshot handling on several important surfaces.
- Secret-safe Convex deployment and environment-name wrappers, production build
  validation, generated-code checks, CI repository gates, and credential-free
  Playwright coverage.

### Current evidence limits

- The latest local checks are not a substitute for authenticated staging or Production verification.
- The latest Operations release includes backend changes whose Convex Production deployment is a separate release gate; confirm the exact current head and deployment before claiming it is live.
- Credentialed staging identities and provider configuration are not assumed to exist.
- Live operational email, WhatsApp, SMS, supplier messaging, and payment providers remain disabled unless separately approved and evidenced.
- Credential-free Playwright is a CI release gate in mock/preview mode;
  credentialed Clerk/Convex staging journeys remain separate and are not
  Production evidence.
- A Convex capacity/free-plan warning is an unresolved hard pre-pilot gate; no pilot or live provider activation is approved until headroom or billing resolution is evidenced.

## Guiding rules

1. Convex owns tenant, branch, role, permission, business state, and audit decisions. Clerk owns credentials and authenticated identity.
2. “All branches” is a read-only comparison scope. A write never silently falls back to the first branch.
3. Every cross-tenant or out-of-scope identifier returns a non-disclosing failure, normally `NOT_FOUND`.
4. Money is integer minor units with ISO currency and JOD’s three-decimal precision. Never use floating-point stored money.
5. Commercial operations are atomic and idempotent. A retry must not create a second payment, receipt, stock movement, journal posting, or email.
6. Membership, payment, receipt, refund, void, shift, ledger, stock movement, and audit history is preserved. Do not physically delete facts to make a screen look clean.
7. UI gates improve usability; backend authorization is the security boundary.
8. Production must fail closed. Missing or contradictory Convex/Clerk configuration cannot select seeded mock data or a demo identity.
9. Provider absence or provider failure is shown as unavailable/failed, never as sent, paid, delivered, or connected.
10. No Production mutation, invitation, email recipient, data cleanup, schema migration, or provider activation occurs without explicit approval for the exact target and action.
11. Every implementation slice adds focused tests, updates the current-state/release documentation, and records what was actually verified.
12. CI runs the sanctioned credential-free Playwright suite without Production
    credentials. Browser evidence from credential-gated staging journeys still
    requires the approved isolated target and cleanup record.

## Cross-cutting immutable audit contract

Every sensitive mutation in the plan must use one auditable contract. The audit event is append-only and is created in the same transaction as the state change, or the operation remains explicitly pending/failed until both facts are durable. A UI toast or a successful provider call is not audit evidence.

### Required audit fields

- `actorId` and authenticated identity class; never a caller-supplied display name alone.
- `organizationId` and `branchId` when the action is branch-scoped. Platform-wide actions must record an explicit platform scope rather than inventing a branch.
- Action/event type, correlation ID, idempotency key/request key, and source surface.
- Required reason and, when policy requires it, approving actor/approval event.
- Immutable before/after snapshots or a safe redacted diff containing the values needed to explain the financial, access, lifecycle, or public-state change.
- Outcome (`succeeded`, `rejected`, `pending`, or `failed`) and stable error code when rejected/failed.
- Creation time and links to the affected durable record, compensating record, payment/receipt/shift/journal/stock movement, or provider attempt.

### Sensitive-action audit matrix

| Action | Required authorization/approval | Required before/after evidence | Required retry/read tests |
|---|---|---|---|
| Price override or custom sale price | Explicit price permission and reason; approval if policy requires | Original price, override, currency, product/charge, branch | Duplicate key, unauthorized caller, stale price, append-only read |
| Discount | Discount permission/limit and reason | List price, discount amount/type, final price, approver | Limit breach, duplicate retry, report/receipt linkage |
| Refund or void | Refund/void permission, reason, original payment/receipt | Original amount, reversal amount, method, shift, stock/journal links | Over-refund, duplicate retry, cross-tenant/branch, immutable history |
| Membership freeze/unfreeze | Membership/date permission and reason | Prior status/dates, new status/dates, affected term/balance | Boundary dates, retry, member ownership, timeline/read authorization |
| Membership date change/extension | Date permission and reason; approval where configured | Prior start/end, new start/end, plan/term and balance impact | Unauthorized role, overlap, retry, report/timeline consistency |
| Permission/role/branch-scope change | Users/roles permission; higher-level approval for escalation | Prior role/permissions/branches, new values, grantor | Privilege escalation, deactivated actor, cross-tenant read, append-only read |
| Cash variance/shift adjustment or close approval | Shift permission and reason; required reviewer for variance policy | Expected/counted/variance, method, shift, reviewer, resolution | Duplicate close, concurrent close, report/reconciliation consistency |
| Subscription plan/lifecycle change | Platform permission, required reason, approval policy | Prior/new plan/status/dates, entitlements, public state, invoice links | Retry, stale snapshot, audit/read authorization, MRR consistency |
| Product deletion/tombstone or archive | Operations permission, exact confirmation, reason | Product identity, references/guards, retained snapshots, deletion result | Open-PO/refund guard, retry, historical movement/readability |

### Audit implementation and acceptance

Likely implementation points are `apps/web/convex/domain.ts`, `accounting.ts`, `accountingLedger.ts`, `operations.ts`, `security.ts`, `platformProvisioning.ts`, `subscriptionReconciliation.ts`, `audit` helpers, `schema.ts`, and the matching MockGymOSApi/adapters. Add a shared audit assertion/test helper rather than duplicating weak field checks.

Tests must prove that each matrix action is authorized at the Convex boundary, has the required reason/approval, records actor/organization/branch/idempotency/before-after facts, remains append-only, cannot be edited or deleted by ordinary users, and is readable only by the permitted role/scope. Include duplicate requests, partial failures, cross-tenant identifiers, out-of-scope branches, inactive actors, and audit/event ordering. Acceptance requires a durable event for both success and intentional rejection of every listed action; missing audit evidence is a release blocker for the affected workflow.

## Ordered implementation phases

### Phase 0 — Baseline and release guard for every slice

This is a recurring gate, not a substitute for the ordered work below.

#### Problem

The repository’s historical documentation contains many release entries and some superseded counts or deployment claims. A new fix can be judged against the wrong head or an inherited failure.

#### Business risk

An agent can report a green test from stale code, deploy the wrong Convex target, or accidentally treat a pre-existing failure as fixed. Documentation can imply a provider or Production workflow is active when it is not.

#### Implementation tasks

- Record `git status`, current branch, current `HEAD`, and `origin/main`; preserve user-owned changes.
- Confirm package installation and run credential-free application typecheck, Convex typecheck, lint/secret audit, unit/domain tests, production build, and `git diff --check`.
- Confirm whether generated Convex files are synchronized without exposing environment values.
- Compare `CURRENT_STATE.md`, this plan, and `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md` with the actual head.
- Label every result as local, CI, Vercel, isolated staging, or Production evidence.

#### Likely files/modules

- `CURRENT_STATE.md`
- `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`
- `docs/13_NEXT_IMPLEMENTATION_ROADMAP.md`
- root and `apps/web/package.json`
- `.github/workflows/ci.yml`
- `apps/web/scripts/safe-convex-cli.mjs`
- `apps/web/scripts/validate-vercel-env.mjs`

#### Migrations and compatibility

No data migration. Do not rewrite historical documentation; add a dated/current-head note and correct only claims that are demonstrably stale.

#### Tests and evidence

Use the repository’s normal `pnpm` wrappers. Do not print secrets or run
value-bearing Convex environment inspection. CI includes the static gate, the
credential-free Playwright job, repository safety assertions, and optional
credential-gated Convex codegen; it has no Production deploy step.

#### Acceptance criteria

- Starting head and all baseline results are recorded.
- No work begins with an unexplained red baseline.
- The exact Convex target and whether the current functions are deployed are known before a deploy request.

#### Dependencies and stop conditions

Stop if the worktree contains unexplained user changes, the selected deployment cannot be identified, or a required check fails without clear ownership. Do not “fix” a baseline failure inside an unrelated workstream.

---

### P0.0 — Capacity and service-plan headroom gate before any pilot

#### Problem

The current audit records a Convex capacity/free-plan warning. The repository can be locally green while the selected deployment is at or near an operational limit.

#### Business risk

A pilot can hit unavailable functions, delayed jobs, failed writes, or unexpected billing during member, payment, inventory, or subscription activity. A capacity warning is therefore a launch blocker, not a post-launch observation.

#### Implementation tasks

- Name the accountable infrastructure/deployment owner and product approver in the release record; do not leave ownership implicit.
- Inspect the selected Convex deployment’s current database I/O, function calls, storage, bandwidth, scheduled jobs, and plan limits using the provider dashboard or a safe aggregate/read-only report. Do not record environment values or member data.
- Choose and document the resolution: reduce/reshape reads, add bounded pagination/retention, upgrade/bill the service plan, or postpone the pilot. The plan intentionally chooses no capacity threshold or billing amount.
- Record the evidence source, selected target, current usage/headroom, owner, decision, and follow-up monitor. If the provider has an alert/budget control, configure it only after the owner chooses the threshold.
- Recheck headroom after the P0 read-shape and subscription work before pilot approval.

#### Likely files/modules

`docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, `CURRENT_STATE.md`, `convex/health.ts`, `telemetry.ts`, query/index modules, `schema.ts`, deployment/provider dashboard records, and the release checklist.

#### Migrations and compatibility

No data migration is implied. Query/index changes must preserve complete financial/report totals and tenant/branch scope. Plan/billing changes are provider actions and require explicit approval; they must not be represented as code-only completion.

#### Tests and evidence

Run large-fixture/read-shape tests, job backlog/lease checks, health checks, and an owner-reviewed provider usage/headroom capture. Evidence must identify the exact deployment and be separate from local test results.

#### Acceptance criteria

- The owner has selected and recorded a capacity/billing resolution.
- The selected Convex deployment has documented headroom suitable for the planned pilot, or the pilot is explicitly blocked.
- There is a monitoring/alert owner and a safe response path.

#### Dependencies and stop conditions

This is a hard pre-pilot gate. Stop all staging-to-Production promotion and live provider activation while the warning is unresolved, the target is ambiguous, the owner is unnamed, or evidence is not tied to the selected deployment.

### P0.0b — Restorable backup and recovery gate

#### Problem

Production mutations, schema changes, scheduler activation, and pilot cleanup require a recovery plan. “A backup exists” is not sufficient if it cannot be restored or its freshness is unknown.

#### Business risk

A failed migration, accidental cleanup, duplicate financial operation, or provider/job defect could become permanent. Without an owner-selected recovery policy, the team cannot know whether the data loss window or recovery time is acceptable.

#### Implementation tasks

- Name the backup/restore owner and a separate reviewer where the organization requires separation of duties.
- Have the owner choose and record the backup freshness policy, retention period, encryption/key ownership, recovery point objective (RPO), and recovery time objective (RTO). Do not invent values in code or this plan.
- Confirm a restorable backup/export exists for the exact Production target before any Production schema/data mutation or pilot cleanup.
- Verify backup integrity using a provider-supported manifest/checksum or equivalent safe evidence without exposing member/payment data.
- Perform a restore drill in an isolated non-Production target, validate schema, tenant counts/aggregates, payment/receipt/shift/ledger/stock relationships, and access boundaries, then record the result and cleanup.
- Document forward-fix versus restore decision rules and the exact operator/owner who can invoke them.

#### Likely files/modules

`docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, `CURRENT_STATE.md`, provider backup/export dashboard, `apps/web/convex/schema.ts`, `health.ts`, reconciliation/report checks, and the release/incident runbook.

#### Migrations and compatibility

No application migration is required by the gate itself. A schema/data migration cannot proceed without a compatible backup/export and a tested restore or forward-fix path. Preserve immutable financial/audit facts during restore validation.

#### Tests and evidence

Backup integrity evidence, isolated restore drill, read-only health check, aggregate reconciliation, authorization/isolation checks, and cleanup record. Test the recovery procedure for an additive schema release and an application rollback.

#### Acceptance criteria

- A restorable backup exists for the exact target and satisfies the owner-selected freshness policy.
- Encryption, key ownership, retention, RPO, RTO, restore owner, and reviewer are recorded.
- A restore drill succeeded in isolation and reconciled the critical financial/stock/audit relationships.

#### Dependencies and stop conditions

This is a hard gate before Production deploy, Production data mutation, scheduler/provider activation, or supervised pilot cleanup. Stop if backup freshness is unknown, integrity cannot be verified, restore fails, encryption/key ownership is unclear, or RPO/RTO/owners have not been selected.

---

### P0.1 — Explicit branch selection across every mutation

#### Problem

Operations now distinguishes concrete branch scope from “All branches,” but other mutation surfaces may still use a first-branch fallback when the selected branch is absent. This can affect reception, check-ins, shifts, leads, member creation/import, journals, PT availability, payments, and other branch-owned records.

#### Business risk

The system can create a correct-looking record in the wrong branch. This corrupts occupancy, stock, cash reconciliation, membership ownership, reporting, staff visibility, and audit interpretation. A gym with multiple branches cannot safely trust the resulting data.

#### Implementation tasks

- Inventory every frontend mutation call and every Convex mutation that accepts or derives a branch.
- Add one shared scope policy: concrete branch required for writes; “All branches” allowed only for read-only aggregation/comparison.
- Remove `branches[0]`/first-available fallbacks from page state, session fallback, checkout, dialogs, and mutation payload builders.
- Make the global branch selector and local branch selector share one validated source of truth; reject stale or out-of-scope branch IDs.
- On a branch change, cancel or reset pending mutation forms and invalidate only the affected scoped data.
- Give every mutation surface a clear “Choose a branch” state and disable submit until scope is valid.
- Keep aggregate read views explicit: show branch labels and totals, never imply that a total is a writable branch.
- Add backend assertions for branch visibility and organization ownership even when the caller supplies a branch ID.

#### Likely files/modules

- `apps/web/src/lib/providers/experience-provider.tsx`
- `apps/web/src/lib/hooks/use-api.ts`
- `apps/web/src/lib/api/GymOSApi.ts`
- `apps/web/src/lib/api/ConvexGymOSApi.ts`
- `apps/web/src/lib/mock/MockGymOSApi.ts`
- `apps/web/src/features/operations/operations-command-center.tsx`
- `apps/web/src/features/operations/retail-checkout.tsx`
- `apps/web/src/app/(app)/reception/page.tsx`
- `apps/web/src/app/(app)/payments/shifts/page.tsx`
- CRM lead/member creation dialogs, PT availability, journals, and any branch-scoped settings surface found by repository search
- `apps/web/convex/security.ts`, `identity.ts`, `domain.ts`, `operations.ts`, `accounting.ts`, `customer.ts`

#### Migrations and compatibility

No destructive migration should be needed if branch IDs already exist. Preserve valid deep links containing `branchId`. For older URLs with no branch, load a read-only chooser rather than silently rewriting them. If persisted preferences contain a branch that no longer exists, clear that preference through a safe forward fix and log an audit/telemetry event without exposing personal data.

#### Tests and evidence

- Component tests for no-branch, one-branch, multiple-branch, stale-branch, and All branches states.
- Convex boundary tests for same-tenant in-scope, same-tenant out-of-scope, foreign-tenant, inactive-branch, and missing-branch mutations.
- Mutation-specific tests for check-in, payment, shift, lead, member, journal, PT, inventory, purchase order, and equipment operations.
- Mock/Convex parity tests proving identical branch filtering and write rejection.
- An authenticated isolated-staging journey with two branches that creates one record in each and verifies no cross-branch movement. This is not a CI Playwright requirement.

#### Acceptance criteria

- No production mutation path silently chooses the first branch.
- All-branch views are visibly read-only and branch-labelled.
- Every write displays the concrete branch and rejects invalid scope at both UI and Convex boundaries.
- A two-branch test proves that payments, shifts, check-ins, stock, leads, and members remain in the branch selected by the operator.

#### Dependencies and stop conditions

This blocks the remainder of the plan. Stop if a mutation’s branch ownership is ambiguous, if a legacy record has no defensible branch assignment, or if fixing the fallback would require rewriting financial history. Escalate the business rule rather than guessing.

---

### P0.2 — Complete the retail refund, stock, shift, and accounting lifecycle

#### Problem

Checkout creates a retail sale, receipt, and stock movement, but the full reversal and accounting path is not yet proven. Permanent product deletion can make a later refund unable to restore a usable balance; retail sales may lack cost basis; cash refunds may bypass the active shift; and sales/refunds can remain outside management accounting until manual posting.

#### Business risk

The gym can show the wrong inventory, drawer balance, gross margin, profit, or refund state. Staff may refund cash that is not reconciled to a drawer, or a retry can produce a duplicate financial/stock event. This is a P0 money and trust issue.

#### Implementation tasks

- Define an immutable retail-sale snapshot containing product public ID, SKU, name, unit, quantity, sale price, cost basis at sale, tax/discount facts if applicable, branch, member/guest snapshot, payment method, and idempotency key.
- Extend stock movement snapshots so historical identity survives product master deletion. Resolve deleted product references through a tombstone/snapshot, not a dangling live-product lookup.
- Make checkout atomic: validate branch, active product, available quantity, price, payment method/reference, shift policy, and idempotency; create sale, payment/receipt, stock movement, and any journal source in one transaction or one auditable saga with a deterministic recovery state.
- Define refund and void behavior separately. A void before settlement and a refund after collection must preserve the original receipt/payment, write a compensating movement, and restore branch inventory exactly once.
- Require an open compatible cash shift for cash collection and cash refund, or explicitly record an approved non-drawer policy. Do not allow a cash event to disappear from reconciliation.
- Keep card/Visa and CliQ external-reference requirements stable; do not invent a payment provider.
- Add cost-of-goods accounting from the captured cost basis. Decide whether COGS posts immediately at sale or through a controlled posting queue; document the policy.
- Add dedicated retail-sale, refund, void, and inventory-restoration journal mappings and audit events.
- Ensure management reports include posted/unposted retail sources with honest status; never imply COGS is configured when it is not.
- Define idempotent retry behavior for checkout, refund, void, receipt creation, movement creation, and journal posting.
- Block permanent deletion when an open PO, refundable/voidable sale, committed stock, or unresolved dependency cannot be represented safely. If deletion is allowed, write the tombstone and all historical snapshots before deleting the mutable product row.

#### Likely files/modules

- `apps/web/convex/operations.ts`
- `apps/web/convex/accounting.ts`
- `apps/web/convex/accountingLedger.ts`
- `apps/web/convex/reconciliation.ts`
- `apps/web/convex/domain.ts`
- `apps/web/convex/schema.ts`
- payment/receipt/shift handlers in `domain.ts` and the relevant API adapters
- `apps/web/src/features/operations/retail-checkout.tsx`
- `apps/web/src/app/(app)/payments/receipts/[receiptId]/receipt.client.tsx`
- `apps/web/src/app/(app)/payments/shifts/page.tsx`
- `apps/web/src/lib/api/GymOSApi.ts`
- `apps/web/src/lib/api/ConvexGymOSApi.ts`
- `apps/web/src/lib/mock/MockGymOSApi.ts`
- `apps/web/convex/operations.test.ts`, `domain.operations.test.ts`, `accounting.test.ts`, `accountingLedger.test.ts`, `reconciliation.test.ts`, and new end-to-end domain tests

#### Migrations and compatibility

Additive schema fields are preferred: retail cost basis, product identity snapshots, tombstones, source/journal linkage, and reversal links. Backfill only from reliable historical data; mark unknown cost basis as explicitly unknown rather than inventing it. Existing membership receipts, payment enums, and card key compatibility must remain intact. A migration must be resumable, idempotent, audited, and safe if interrupted. Never delete historical payment, receipt, shift, ledger, or audit rows.

#### Tests and evidence

- Unit/domain tests for sale, partial/invalid stock, guest/member, all payment methods, duplicate retry, missing shift, refund, void, over-refund, deleted-product refund, and branch isolation.
- Ledger tests for revenue, inventory, COGS, cash/card/CliQ settlement, reversal, unposted queue, period close, and re-run idempotency.
- Mock/Convex parity tests for all states.
- A transaction-level test that injects a failure after each step and proves deterministic recovery/no duplicate.
- Isolated staging evidence: open shift → sale → receipt → close/reconcile → refund/void → stock check → statement/report check. Use disposable data and a cleanup ledger; no Production mutation.

#### Acceptance criteria

- Every successful checkout has one immutable sale, receipt/payment, stock movement, branch, payment method, and accounting status.
- Every valid refund/void restores stock and accounting exactly once and remains printable/auditable.
- Cash collection/refund appears in the correct shift and reconciliation.
- COGS is either correctly posted from captured cost basis or visibly marked unconfigured; no false profit is shown.
- Product deletion cannot make historical refunds, movements, or reports fail.

#### Dependencies and stop conditions

The accounting policy for retail COGS, tax, refunds, and cash refunds must be approved before changing journal mappings. Stop if a historical record cannot be reconciled without inventing money or identity. Stop before a schema migration if a backup/export and a forward/recovery procedure are not available.

---

### P0.3 — Harden identity, tenancy, media, production mode, and abuse boundaries

This phase groups security defects that must be closed before authenticated staging is treated as meaningful.

#### P0.3a — Invitation acceptance and safe user projections

**Problem and risk.** `users.ensureUserRecord` and membership resolution can promote an `invite:*` row by email without proving the Clerk invitation/ticket state, and active membership lookup can ignore pending/revoked semantics. A raw user document can expose `authSubject` and Convex internals.

**Implementation tasks.** Add explicit invitation states (`pending`, `accepted`, `revoked`, `expired`/failed as appropriate), bind acceptance to the authenticated Clerk subject and invitation evidence, make revocation authoritative, and make acceptance idempotent. Resolve only accepted/current membership rows. Return a safe user projection from `users.current`/equivalent APIs; never return `_id`, `_creationTime`, `authSubject`, internal invitation tokens, or provider metadata unless an explicitly authorized internal projection requires it.

**Likely files/modules.** `apps/web/convex/users.ts`, `identity.ts`, `security.ts`, `invitations.ts`, Clerk invitation adapter code, `src/lib/auth/rivet-identity.tsx`, `ConvexGymOSApi.ts`, `MockGymOSApi.ts`.

**Migrations/compatibility.** Backfill existing invite rows to an explicit state using conservative defaults. Pending rows must not become active merely because they are old. Preserve accepted memberships. Do not expose existing invitation secrets; expire/revoke them through a controlled forward migration.

**Tests.** Wrong identity, wrong email, pending, revoked, failed, expired, second-organization invitation, existing active member, repeated acceptance, deactivated user, and safe-projection serialization tests in Convex and Mock.

**Acceptance.** Only a correctly authenticated, accepted invitation yields active workspace access; repeated acceptance is harmless; foreign or revoked identities receive non-disclosing denial; raw identity internals never cross the public adapter boundary.

**Dependencies/stop conditions.** Confirm the Clerk invitation API/state available to the selected environment. Stop if the proposed state cannot distinguish an authenticated person from an email-only placeholder.

#### P0.3b — Public media ownership and upload cleanup

**Problem and risk.** Public media projection currently relies too heavily on `status=active`; a stale, private, foreign, or misreferenced asset could expose a URL. Unfinalized uploads can remain without quota/TTL cleanup.

**Implementation tasks.** Enforce `visibility`, `ownerType`, `ownerPublicId`, exact organization ownership, and published-profile references in `gymMediaAssetView` and every public projection. Separate private/member assets from public gym assets. Add upload quotas, pending-upload TTL cleanup, finalization idempotency, and safe replacement/archive retention. Ensure signed/private URLs cannot be used as public assets.

**Likely files/modules.** `apps/web/convex/media.ts`, `mediaSanitizer.ts`, `domain.ts`, `schema.ts`, public experience data/projections, profile settings components, cleanup cron/job modules, media tests.

**Migrations/compatibility.** Additive ownership/visibility fields with a conservative backfill. Do not publish ambiguous existing assets; quarantine or mark them needing review. Keep finalized public URLs stable where ownership is verified.

**Tests.** Private, foreign, stale-reference, wrong owner type, unpublished, replacement, unfinalized expiry, quota, MIME/size, and signed URL visibility tests. Include a public projection test that cannot observe a foreign asset URL.

**Acceptance.** Only an active, published, public gym-owned asset appears in public/customer projections; abandoned uploads are bounded and removable; private media remains inaccessible.

**Dependencies/stop conditions.** Requires a storage cleanup mechanism and a clear retention period. Stop before broad backfill if asset ownership cannot be determined safely.

#### P0.3c — Production fail-closed mode and security headers

**Problem and risk.** An explicit mock data mode can be honored in a non-Vercel production runtime, selecting seeded data/demo identity. The application has only minimal default security headers.

**Implementation tasks.** Make `NODE_ENV=production` require Convex and production Clerk configuration regardless of `NEXT_PUBLIC_DATA_MODE`; reject mock/demo identity at runtime. Expand the environment validator with safe presence/class checks for Convex URL, Clerk publishable/secret classes, issuer/frontend URL, entry-pass signing secret, and site URL without printing values. Add CSP/frame-ancestors, HSTS in HTTPS production, referrer policy, permissions policy, MIME sniffing and clickjacking protection compatible with Clerk/Convex/Vercel. Document the header exceptions.

**Likely files/modules.** `apps/web/src/lib/api/ConvexGymOSApi.ts`, `src/lib/auth/rivet-identity.tsx`, `src/lib/providers/experience-provider.tsx`, `apps/web/scripts/validate-vercel-env.mjs`, `apps/web/next.config.mjs`, `src/middleware.ts` if present, root/app layouts, deployment docs.

**Migrations/compatibility.** No data migration. Mock remains explicit for local/test only. Roll out headers in report-only or preview-compatible form if CSP would affect existing provider flows; do not weaken production policy silently.

**Tests.** Production+mock configuration must throw; production+missing required config must fail closed; preview/local mock must continue to work; validator tests must never print secret values. Header assertions for protected/public responses and direct-route behavior.

**Acceptance.** A production build/runtime cannot render seeded mock data or a demo identity. Required headers are present and documented. Unauthorized direct URLs do not include sensitive server-rendered data.

**Dependencies/stop conditions.** Confirm the production environment variable names/classes from the Vercel/Clerk configuration without reading values in agent output. Stop if a header breaks Clerk or Convex authentication until the exact compatible policy is identified.

#### P0.3d — Multi-organization selection and abuse controls

**Problem and risk.** Selecting the first active organization/membership when no organization is specified is nondeterministic for multi-gym users. Public application/trial/entry-pass/check-in operations lack uniform rate limits and idempotency.

**Implementation tasks.** Require explicit organization selection when multiple active memberships exist; persist and validate a selected organization/branch only after checking current identity scope; never use array order. Make stale selections fail safe. Add rate limiting, request IDs/idempotency, CAPTCHA or honeypot where appropriate, and abuse telemetry for public gym applications, customer trial creation, entry passes, check-ins, and invitation claims. Keep errors non-disclosing.

**Likely files/modules.** `apps/web/convex/security.ts`, `identity.ts`, `customer.ts`, `gymApplications.ts`, `invitations.ts`, entry-pass/check-in handlers in `domain.ts`, `src/lib/auth/rivet-identity.tsx`, destination/scope helpers, HTTP/action boundary, schema indexes, rate-limit utility.

**Migrations/compatibility.** Additive idempotency/rate-limit records with TTL/indexing. Existing one-organization sessions remain unchanged. Do not use IP as the only identity; combine bounded IP/device/request signals and privacy limits.

**Tests.** Two active organizations, explicit selection, stale selection, same user across branches, repeated keys, key variation, burst requests, legitimate retry, foreign identifiers, and non-disclosing error tests. Add a bounded load/abuse test against isolated development only.

**Acceptance.** A user with multiple gyms is never routed based on database row order; repeated public requests are bounded and safe; legitimate retries are idempotent; no sensitive existence information leaks.

**Dependencies/stop conditions.** Requires an approved rate-limit storage policy and privacy review. Stop before production activation if limits are unbounded or would block legitimate gym/member traffic without a tested override.

---

### P0.4 — Make provisioning retries preserve authoritative state

#### Problem

A partially failed Clerk/Convex provisioning retry can reset an existing organization to trial or change an already accepted owner membership back to pending. A success/failure notification can also be inaccurate when only part of the workflow completed.

#### Business risk

An admin retry can downgrade a paying gym, remove owner access, duplicate branches/roles, or leave a public directory row claiming success while the workspace is unusable.

#### Implementation tasks

- Model provisioning as an idempotent state machine with durable step status, request key, correlation ID, and last safe checkpoint.
- Before every retry, load authoritative organization/subscription/membership/branch facts and preserve stronger existing state.
- Treat Clerk organization/user/invitation calls as idempotent external steps; store provider identifiers and reconcile instead of recreating.
- Make retries resume failed steps only; never reset plan, lifecycle, accepted membership, public state, or audit history unless an explicit compensating operation is requested.
- Return truthful status: complete, partially complete/action required, retryable failure, or permanently failed.
- Add reconciliation tooling that reports mismatches without mutating Production automatically.

#### Likely files/modules

- `apps/web/convex/platformProvisioning.ts`
- `platformProvisioningAction.ts`
- `platformProvisioning.retry.test.ts`, `platformProvisioning.test.ts`
- `domain.ts`, `schema.ts`, `gymApplications.ts`
- platform admin page/API adapter and `MockGymOSApi.ts`
- audit/correlation logging modules

#### Migrations and compatibility

Additive provisioning attempt/step/idempotency fields or table. Backfill existing completed rows conservatively. Existing organizations must be treated as authoritative; no bulk reset. If a provider identifier is missing, reconcile manually or create only the missing safe step.

#### Tests and evidence

- Failure injection after each Clerk/Convex step.
- Retry after partial success, repeated retry, concurrent retry, already-paying org, accepted owner, duplicate branch, and notification failure.
- Mock/Convex parity and audit-before/after assertions.
- Isolated staging application → approval → forced partial failure → retry → owner access → plan/public-state verification.

#### Acceptance criteria

- A retry never downgrades an existing authoritative plan/lifecycle or deactivates an accepted owner.
- Repeated retries converge to one organization, one initial branch, one owner membership, and one auditable provisioning outcome.
- Admin status and applicant notifications describe the actual state.

#### Dependencies and stop conditions

Requires a clear authority order between Clerk, Convex organization facts, subscription records, and application status. Stop if the system cannot distinguish a failed step from a completed step without guessing.

---

### P0.5 — Replace the customer signup preview with a real Clerk flow

#### Problem

The customer signup page collects a password but does not persist or submit it as a real account-creation flow. It behaves like a browser preview rather than a durable Clerk identity journey.

#### Business risk

Customers can believe they created an account when they cannot sign in later, and staff may receive trial/application records without a durable owner identity. Password handling in the application would also create unnecessary security risk.

#### Implementation tasks

- Choose the approved Clerk customer signup path (hosted/embedded Clerk sign-up) and remove local password collection/storage.
- On successful Clerk sign-up, create or resolve the customer profile through the authenticated Convex boundary.
- Preserve gym/branch/trial context through a signed, short-lived, non-sensitive state token or server-side pending request; never trust a caller-supplied member/customer ID.
- Handle existing email, verification required, abandoned flow, duplicate submission, and return-to-gym cases.
- Keep public gym application signup separate from customer/member account signup.
- Add accessible English/Arabic-ready error and verification copy.

#### Likely files/modules

- `apps/web/src/app/customer/signup/page.tsx`
- `apps/web/src/app/customer/signup/layout.tsx`
- Clerk sign-up components/config and `src/lib/auth/rivet-identity.tsx`
- `apps/web/convex/customer.ts`, `users.ts`, `identity.ts`
- public experience/trial submission helpers and signup tests

#### Migrations and compatibility

Existing preview/session records must not be silently converted to identities. Provide a safe sign-in/claim path or mark legacy preview records as unclaimed. Do not migrate plaintext passwords because none should have been stored.

#### Tests and evidence

- Component tests for sign-up/verification/error/return state.
- Convex ownership tests for authenticated customer creation, gym/branch context, duplicate retry, and caller-supplied ID substitution.
- Isolated staging Clerk flow with disposable email and cleanup evidence.

#### Acceptance criteria

- A customer can create/verify/sign in through Clerk and return to the selected gym/trial without losing context.
- No password is stored or transmitted through RIVET application APIs.
- Existing customer records cannot be claimed by an unrelated identity.

#### Dependencies and stop conditions

Requires a configured non-Production Clerk identity path. Stop before enabling the UI if Clerk sign-up/verification state cannot be exercised in isolated staging.

---

### P0.6 — Verify the Convex target and prepare the guarded deploy

#### Problem

Frontend CI/Vercel success does not prove that the current Convex functions are deployed to the intended Production deployment. The Operations backend and later fixes must not be claimed live until the exact target is verified. This phase verifies the target and runs a dry run before staging; it does not deploy Production.

#### Business risk

The frontend can call an older backend, or an operator can deploy to Development while believing Production changed. A wrong target can expose test data or leave a release half-applied. A local deploy key can also override an apparent `--prod` selector, so the command flag alone is not target evidence.

#### Implementation tasks

- Confirm the exact current commit and intended Convex Production deployment URL in the provider dashboard and the Vercel Production configuration. The Vercel `NEXT_PUBLIC_CONVEX_URL` must match the selected Production URL; a deployment label or project name alone is insufficient.
- Use an approved, target-bound operator shell/profile. Verify the selected project/deployment context and credential class out-of-band before running the command; do not assume `--prod` overrides a configured local deploy key. The runbook must warn that a local deploy key may take precedence and the CLI may report that it is ignoring `--prod`.
- Inspect environment configuration only with `pnpm convex:env:names -- --prod` (names only). Never print values, copy credentials into the transcript, or use a staging/codegen key for Production.
- Confirm the P0.0 capacity/headroom and P0.0b restorable-backup gates are complete.
- Run only the repository wrapper in the approved operator shell: `pnpm convex:deploy -- --dry-run -y`. Inspect schema/index impact; do not deploy in this phase.
- Never use raw `convex deploy`, verbose/debug flags, `--admin-key`, value-bearing env inspection, or secret assignments in commands/logs.
- Record the target URL/selector, commit, credential/operator-shell classification, dry-run schema/index result, Vercel URL match, and rollback/forward-fix owner without secrets.

#### Likely files/modules

- `apps/web/scripts/safe-convex-cli.mjs`
- `apps/web/package.json`
- `apps/web/convex/health.ts`
- `apps/web/scripts/validate-vercel-env.mjs`
- `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`
- `CURRENT_STATE.md`
- Convex schema/generated files when codegen is part of the release

#### Migrations and compatibility

Prefer additive/widening schema changes. No index deletion or destructive migration is permitted without a separately approved migration plan and backup. Deploy wrappers and environment-name commands remain the only supported operator path.

#### Tests and evidence

- Local codegen/typecheck and schema tests.
- Names-only environment inspection and operator-shell/credential selector verification.
- Dry run result showing the exact target and no unexpected index deletion.
- Frontend/Vercel URL-to-Convex-target consistency check.
- Capacity/headroom and restorable-backup evidence linked to the same target.

#### Acceptance criteria

- The intended target is verified, the dry run is clean, and the backend is explicitly marked **not deployed** at the end of this phase.
- No unexpected schema/index changes occurred and the Vercel URL matches the selected Production target.
- No secret values appear in output, documentation, or commit history.

#### Dependencies and stop conditions

Requires an approved target-bound operator shell and the P0.0/P0.0b gates. Stop on target ambiguity, local-key/selector mismatch, Vercel URL mismatch, missing backup/export, unresolved capacity warning, unexpected index deletion, schema validation failure, or any secret-output concern. Production deployment is a later post-staging phase and requires a fresh explicit approval for the exact action.

---

### P0.7 — Authenticated isolated staging acceptance

#### Problem

Unit/domain tests and credential-free builds cannot prove Clerk identity, two-tenant isolation, real branch scope, provider configuration, or direct-route behavior. The existing staged journey set is incomplete or credential-gated.

#### Business risk

A release can pass local tests while wrong users enter a gym, cross-tenant identifiers resolve, membership/payment/refund flows fail in real sessions, or public/protected SSR paths leak data.

#### Implementation tasks

- Provision disposable Development Clerk identities for platform admin, gym owner, manager, receptionist, salesperson, trainer, auditor, and customer/member roles. Treat **customer** and **member** as distinct test concepts: a customer is the authenticated public/member-portal identity being claimed or enrolled; a member is the gym-owned member record linked to a gym membership. A customer may become linked to a member, but a caller must never claim a member record by email or ID alone.
- Use an isolated non-Production Convex deployment with a unique run ID and an explicit cleanup ledger.
- Deploy the candidate backend to that isolated non-Production target through its approved staging path, and record the exact commit/target. This is separate from the Production dry run and must never reuse a Production deploy key.
- Complete journeys for provisioning, owner setup, staff security, CRM, membership lifecycle, reception, finance/refund, PT, operations/inventory/equipment, media, member portal, realtime, and isolation/audit.
- Use two gyms and at least two branches to prove horizontal and vertical isolation.
- Exercise the role matrix across both gyms: platform admin, owner, manager, receptionist, salesperson, trainer, auditor, authenticated customer, and gym member, including inactive/deactivated states where applicable.
- Verify direct protected URLs return the correct redirect/forbidden state and no sensitive SSR HTML/network payload.
- Test offline/reconnect or stale snapshot behavior where realtime is used.
- Use the approved in-app browser/manual/browser-client route for
  credentialed staging or Production evidence. The credential-free Playwright
  suite is a permanent CI gate for preview behavior, but it must not be called
  Production evidence.
- Cleanup only disposable records, restore changed settings, and retain redacted evidence.

#### Likely files/modules

- `apps/web/e2e/` existing journey definitions and staging harness
- `.github/workflows/ci.yml` for static, credential-free browser, and explicitly
  credential-gated codegen checks
- `apps/web/convex/*` boundary tests
- `src/lib/hooks/use-realtime-api.ts`
- protected layouts: `src/app/(app)/layout.tsx`, `src/app/platform/layout.tsx`, `src/app/customer/layout.tsx`
- `CURRENT_STATE.md`, runbook, staging cleanup ledger

#### Migrations and compatibility

No Production data migration. Staging data must be namespaced/run-keyed and cleanup-safe. Never reuse a Production identity or target URL.

#### Tests and evidence

Credential-complete journeys with explicit allow/deny assertions, two-tenant IDs, branch labels, receipts/audit facts, and cleanup. Record whether each result is automated browser-client, manual, or backend-only.

#### Acceptance criteria

- All required role journeys pass against isolated non-Production data, including trainer, auditor, member, and the separately identified customer flow.
- Cross-tenant and cross-branch access is denied without existence leakage.
- Direct-route HTML/network checks show no protected data to anonymous/wrong-role users.
- Cleanup and restoration evidence is complete.

#### Dependencies and stop conditions

Requires disposable Clerk identities and an isolated Convex deployment. Stop if a run targets Production, if cleanup is not deterministic, if role state is missing, or if an identity/provider result cannot be attributed to the current commit.

---

### P0.8 — Enable and verify subscription reconciliation

#### Problem

Platform subscription invoice/grace/suspension logic exists, but the scheduler path is default-off until the exact feature flag/configuration is enabled. Code presence and manual preview results do not prove scheduled operation. This is distinct from member-level renewal/expiry jobs.

#### Business risk

Gyms can remain active after non-payment, be suspended too early, receive duplicate invoices, or fail to regain access after payment. Platform MRR and entitlements can drift from authoritative organization facts. Confusing this with member renewal jobs can produce the wrong customer access or billing action.

#### Implementation tasks

- Treat `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED=1` as the only enabled value; absent, empty, or any other value remains default-off.
- Verify the **platform subscription reconciliation** state machine in `subscriptionReconciliation.ts`: due date, invoice creation, three-day reminder, end date, grace window, gym suspension, restoration, cancellation, and idempotent rerun.
- Keep it separate from **member renewal jobs** in `membershipJobs.ts`/`renewalJobs.ts`, which govern individual membership terms, renewals, expiry, and member-facing facts. They must have separate audit/event types, tests, metrics, and failure handling even if they share cron infrastructure.
- Make invoice/grace timing and timezone policy explicit; do not infer a business rule from a browser date.
- Ensure organization `subscriptionPlan` is authoritative for MRR/entitlements and projection lag cannot show a stale plan.
- Preserve audit events and tenant/public/private state changes for each transition.
- Enable `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED=1` only in isolated staging first; verify scheduler/cron execution and failure/retry/lease behavior. Do not enable it in Production merely because the code deployed.
- Add manager/platform notices and truthful “pending/failed” states; no live email unless separately approved.
- Prepare a controlled Production activation checklist and rollback switch.

#### Likely files/modules

- `apps/web/convex/subscriptionReconciliation.ts`
- `subscriptionReconciliation.test.ts`
- `membershipJobs.ts`, `renewalJobs.ts`, `crons.ts`
- `platformOverview.ts`, `platformProvisioning.ts`, `domain.ts`
- platform subscription UI and `MockGymOSApi.ts`
- operational email/notification modules

#### Migrations and compatibility

Backfill only missing lifecycle facts with deterministic rules and an audit record. Do not rewrite paid invoice/payment history. Scheduler leases/idempotency keys must be additive and safe to retry.

#### Tests and evidence

- Clock-controlled unit tests for each lifecycle boundary and grace day.
- Concurrent scheduler/retry tests and duplicate invoice prevention.
- Staging with disposable gyms in active, trial, past-due, grace, suspended, cancelled, and restored states.
- Read-only Production preview/aggregate check before any Production flag activation.

#### Acceptance criteria

- One due cycle produces one invoice/notice/audit set.
- Grace and suspension happen at the documented boundary, not on UI refresh.
- Payment/restoration returns entitlements and public state correctly.
- `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED=1` is the only enabled value; the feature is default-off otherwise and does not enable member renewal jobs.
- Feature flag can be disabled without losing history; no accidental Production activation occurs.

#### Dependencies and stop conditions

Requires approved billing/grace policy, scheduler health, exact environment ownership, P0.0/P0.0b gates, and isolated staging evidence. Stop on clock/timezone ambiguity, duplicate transition risk, confusion with member renewal jobs, an enabled value other than the exact flag value, or a missing rollback switch.

### P0.9 — Deploy Convex Production strictly after staging

#### Problem

The backend can be dry-run-valid and staging-tested without being deployed to the intended Production target. Conversely, deploying before authenticated staging would make an unproven backend live.

#### Business risk

Production can receive a release that has not passed the role/isolation/money/subscription journeys, or the deploy can land on a different Convex deployment than Vercel uses. A failed deployment can also leave the frontend/backend versions mismatched.

#### Implementation tasks

- Require completed P0.0, P0.0b, P0.1–P0.8 evidence for the exact commit before requesting the Production deploy.
- Obtain fresh explicit approval for the exact commit, target URL/selector, schema/index result, and deploy action.
- Reuse the verified target-bound operator shell and credential selector from P0.6; re-check that a local deploy key is not overriding the intended Production target.
- Run the repository wrapper only: `pnpm convex:deploy -- -y` after the approved dry run; never use raw or verbose deploy commands.
- Run read-only Production `health:check`, safe aggregate checks, and recent error/capacity observation after deployment.
- Confirm Vercel Production’s `NEXT_PUBLIC_CONVEX_URL` matches the deployed target and the application commit is the approved one.
- Keep `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED` off in Production unless a separate activation approval follows successful post-deploy checks.

#### Likely files/modules

`apps/web/scripts/safe-convex-cli.mjs`, `apps/web/convex/health.ts`, `apps/web/package.json`, Vercel project configuration, `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, `CURRENT_STATE.md`, and the P0.6 staging evidence record.

#### Migrations and compatibility

Deploy only additive/widening schema changes cleared by the dry run. No index deletion, destructive migration, Production seed/import/restore/delete, or product-data mutation is part of this release gate. If the deploy fails, use the documented forward-fix/rollback procedure; do not retry against an unverified target.

#### Tests and evidence

- Exact-commit static/codegen/typecheck/build evidence.
- Completed authenticated staging evidence, including cleanup, role matrix, branch isolation, financial lifecycle, and subscription staging.
- Guarded Production dry run/deploy output with target and schema/index result but no secrets.
- Post-deploy health, Vercel URL match, safe aggregate, and capacity observation.

#### Acceptance criteria

- Production deployment occurs only after staging acceptance and explicit approval.
- The exact approved backend commit is deployed to the exact selected target, with no unexpected index/schema change.
- Health is `ok`, Vercel points to that target, and no Production subscription scheduler/provider flag is enabled unintentionally.
- The release record clearly distinguishes local, CI, Vercel, staging, and Production evidence.

#### Dependencies and stop conditions

Stop if P0.7 staging is incomplete, P0.0/P0.0b evidence is stale or missing, the target selector/credential shell differs from the dry run, Vercel URL does not match, health fails, capacity remains unresolved, or approval is absent. Do not deploy solely because CI or Vercel is green.

---

## P1 — Remaining operational/product scope after P0 proof

These workstreams begin only after P0.0/P0.0b and P0.1–P0.9 are complete or explicitly accepted as a supervised pilot exception.

### P1.1 — Atomic branch-to-branch inventory transfer

#### Problem and risk

Each branch correctly has an independent balance, but a gym with stock in one branch has no complete, atomic transfer workflow. Manual adjustment can lose stock, double-count it, or leave no explanation.

#### Implementation tasks

- Add a transfer aggregate with source branch, destination branch, product identity snapshot, quantity, status, reason, idempotency key, and actor/audit facts.
- Require source availability and branch authorization; reserve/decrement source and receive/increment destination exactly once.
- Support draft/requested, approved, in-transit if operationally needed, received, cancelled, and reversed states. Keep the MVP simpler if a single atomic transfer is sufficient.
- Expose transfer history in stock movements and branch comparison; do not treat All branches as a write scope.

#### Likely files/modules

`convex/schema.ts`, `operations.ts`, `domain.ts`, `security.ts`, `GymOSApi.ts`, `ConvexGymOSApi.ts`, `MockGymOSApi.ts`, Operations UI/tests, accounting/reconciliation if transfers affect valuation.

#### Migrations/compatibility

Additive transfer tables/movement reference fields. Existing balances remain unchanged. Historical movement snapshots remain immutable.

#### Tests

Test same-product source/destination, insufficient source, duplicate retry, cross-tenant/branch denial, cancellation/reversal, concurrent transfer, and reporting.

#### Acceptance criteria

The source decrements and destination increments exactly once, with one auditable transfer and no balance drift.

#### Dependencies and stop conditions

Stop if branch ownership or inventory valuation policy is unclear.

### P1.2 — Automations and Facilities launch decision

#### Problem and risk

Automation backend primitives exist while the UI is intentionally “Coming soon”; facilities/cleaning/inspection workflows exist in parts of the domain but may not be visible in the current Operations workspace. Dead-end links create false expectations, while reintroducing a half-functional queue recreates confusion.

#### Implementation tasks

- Decide, with product owner approval, whether Automations and Facilities are in the supervised pilot or explicitly deferred.
- If deferred, remove/replace dead-end CTAs, preserve backend/history, and label the capability accurately.
- If launched, implement the smallest coherent workflows: facilities tasks by zone/status/assignee/due date; automation rule review/enable/disable/run history with quiet hours, dedupe, suppression, and failure retry; no unbounded rule builder promises.
- For machine/equipment maintenance, keep issue → safety → work order → completion lifecycle distinct from facilities cleaning tasks.

#### Likely files/modules

`convex/automations.ts`, `automations.scheduler.test.ts`, `convex/domain.ts`, facilities/equipment operations handlers, `src/app/(app)/automations/*`, Operations UI, navigation, notification/email modules.

#### Migrations/compatibility

Do not delete historical rules, tasks, issues, or work orders. Archive/disable safely. Any enabled automation must have explicit tenant/module entitlement and an auditable owner.

#### Tests

Test enabled/disabled/expired rules, suppression, quiet hours, retries, facilities assignment/completion, equipment safety, branch scope, and dead-link behavior.

#### Acceptance criteria

Either every related surface shows an honest deferred state, or the bounded pilot slice works with durable history and truthful statuses.

#### Dependencies and stop conditions

Stop without an approved message/provider policy and an explicit product decision about whether the capability is in the pilot.

### P1.3 — Operational email provider staging

#### Problem and risk

Durable Resend queue and webhook primitives exist, but live delivery is disabled. “Sent” without provider evidence is misleading and enabling email prematurely can contact real people.

#### Implementation tasks

- Keep global kill switch and per-tenant/message-type allowlist default-off.
- Configure a non-Production provider target/sandbox and verify application, receipt, trial, renewal, expiry, staff, and manager templates.
- Verify leases, retry/backoff, deduplication, bounce/complaint/suppression handling, provider IDs, and terminal manager notices.
- Separate essential service messages from marketing consent and honor language preference.
- Define recipient allowlist, sender/domain, retention, and redaction policy.

#### Likely files/modules

`convex/operationalEmail.ts`, `notificationDelivery.ts`, `gymApplications.ts`, email settings components/tests, `marketing.ts`, `crons.ts`, environment/runbook docs.

#### Migrations/compatibility

No historical delivery rewrite. Backfill unknown consent conservatively as suppressed/unknown. Provider message IDs and attempts are additive. Never expose API keys in docs/output.

#### Tests

Run provider-sandbox delivery, retry, failure, duplicate, bounce, suppression, language, and disabled-mode tests.

#### Acceptance criteria

Every displayed delivery state matches an observed provider response or an explicitly recorded disabled/unavailable state.

#### Dependencies and stop conditions

Stop without explicit recipient, sender/domain, provider, and activation approval.

### P1.4 — CRM offers and conversion evidence

#### Problem and risk

CRM offer facts exist, but provider delivery, branded offer documents, acceptance, retry, and webhook evidence are incomplete. Staff can believe an offer was delivered or accepted when only a local record exists.

#### Implementation tasks

- Decide whether offers are an internal follow-up note or an actual customer-facing offer in the pilot.
- If customer-facing, add durable offer version, price/term snapshot, recipient consent, delivery attempts, provider IDs, acceptance/expiry, and conversion linkage.
- Reuse the one-member timeline and preserve historical offer facts; do not create a parallel customer identity or independent marketplace.
- Make retry/idempotency and provider failure visible.

#### Likely files/modules

`convex/domain.ts`, offer lifecycle tests, CRM lead detail/list components, member timeline, operational email/provider boundary, `MockGymOSApi.ts`.

#### Migrations/compatibility

Existing offer records remain historical. Add explicit `draft/local_only` status where delivery was never attempted. Do not claim prior offers were delivered.

#### Tests

Test draft/send/fail/retry/expire/accept/convert, duplicate retry, consent, language, and branch/tenant scope.

#### Acceptance criteria

Delivery is truthful and there is one auditable conversion path, or the feature is explicitly internal-only.

#### Dependencies and stop conditions

Stop without a provider or an approved internal-only decision.

### P1.5 — Platform branch administration

#### Problem and risk

Gym detail still has “branch actions are not configured” in a platform-facing view. Platform administrators cannot reliably inspect or help correct a tenant’s branch setup without entering the gym workspace.

#### Implementation tasks

- Define the platform admin branch scope: read-only inspection, support-assisted create/edit/deactivate, or no platform mutation.
- If mutations are approved, add reason-gated audited actions with tenant ownership and no bypass of gym-level invariants.
- Show branch status, address, operating state, and safe aggregate counts without leaking member details.
- Keep branch-specific inventory, staffing, and permissions inside the gym workspace unless explicitly delegated.

#### Likely files/modules

`convex/platformGymDetail.ts`, `platformProvisioning.ts`, `domain.ts`, platform gym detail page/components, `GymOSApi.ts`, `ConvexGymOSApi.ts`, platform authorization tests.

#### Migrations/compatibility

No migration unless branch lifecycle fields are missing. Existing branch IDs/links remain stable. Never merge branches by deleting financial/attendance history.

#### Tests

Test platform-admin allow, gym-staff deny, cross-tenant deny, reason/audit, inactive branch, and aggregate-only projection behavior.

#### Acceptance criteria

The platform surface has a clear supported action set and never exposes member details outside the approved projection.

#### Dependencies and stop conditions

Stop if platform and gym ownership boundaries are not approved.

### P1.6 — Arabic and RTL completion

#### Problem and risk

The application is Arabic-ready in layout/data areas, but general interface copy is not translated. RTL defects in money tables, dialogs, navigation, QR/receipt flows, or admin surfaces can make the product unusable for local gyms.

#### Implementation tasks

- Use native, versioned message catalogs rather than an external translation API in the runtime unless a provider is explicitly approved and funded.
- Establish English source keys, Arabic translations, interpolation rules, plural/date/money formatting, and fallback behavior.
- Add locale selection/persistence at public, customer, gym, and platform shells.
- Audit direction-sensitive layout: navigation, tables, forms, modals, charts, receipt print layout, icons, chevrons, and numeric fields.
- Do not translate member names, gym names, SKUs, audit IDs, or user-entered notes automatically.

#### Likely files/modules

`src/app/layout.tsx`, public/customer/app/platform layouts, shared i18n/locale utilities, `IBM Plex Sans Arabic` setup, all affected feature components, tests, `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`.

#### Migrations/compatibility

No data migration for UI catalogs. Existing bilingual gym/profile fields remain. Missing Arabic keys fall back to English with telemetry, never blank UI.

#### Tests

Run catalog key completeness, interpolation, RTL snapshots/component tests, keyboard/focus, receipt print, and manual desktop/tablet/mobile review.

#### Acceptance criteria

There are no clipped/overlapping critical controls, and numeric/money direction and receipt printing remain correct in both locales.

#### Dependencies and stop conditions

Stop if the translation source or legal terminology is not approved.

## P2 — Performance, observability, accessibility, and pilot closure

### P2.1 — Performance and query shape

#### Problem and risk

Some global lists/queries can grow without pagination; multi-tenant user filtering and reporting may read more data than necessary. The Convex Free-plan warning means inefficient reads can become a cost or availability issue.

#### Implementation tasks

- Measure slowest routes/functions in isolated staging and read-only Production observation before changing behavior.
- Add pagination/limits/cursors to users, members, leads, audit, movements, invoices, support, and reports where appropriate.
- Replace global-read-then-filter patterns with scoped indexes/queries.
- Review realtime subscription scope and fallback polling; retain last good snapshot without duplicate reads.
- Add bounded cache invalidation and query budgets per surface.

#### Likely files/modules

Convex query modules and `schema.ts` indexes; `use-api.ts`, `use-realtime-api.ts`, list/table components, `platformOverview.ts`, reporting modules, telemetry/health.

#### Migrations/compatibility

Add indexes and cursor fields additively. Preserve existing ordering and deep links; document any pagination boundary. No silent truncation of financial reports.

#### Tests

Run large-fixture tests, pagination completeness/order, tenant/branch scope, subscription disposal, load/read-count traces, and report reconciliation.

#### Acceptance criteria

Reads are bounded while results remain complete and correctly ordered for the requested scope.

#### Dependencies and stop conditions

Stop if a performance change can drop financial rows or alter totals.

### P2.2 — Observability, incident response, and release evidence

#### Problem and risk

Logs and redacted correlation IDs exist, but pilot operators still need reliable readiness, job, provider, error, latency, and capacity evidence.

#### Implementation tasks

- Define redacted metrics for auth failures, Convex errors, query latency, job leases/retries, subscription transitions, payment/refund idempotency, email delivery, and reconciliation variance.
- Add health/readiness checks that distinguish app, Clerk, Convex, provider, scheduler, and storage failures.
- Create runbooks for failed deployment, stuck job, wrong branch, duplicate payment, failed refund, media privacy incident, and invitation revocation.
- Set alert thresholds only after baseline observation; avoid logging personal/member/payment content.
- Record exact commit, target, schema result, health result, and rollback owner for each release.

#### Likely files/modules

`convex/health.ts`, `telemetry.ts`, correlation/error utilities, `crons.ts`, notification/email/subscription jobs, `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, CI/Vercel configuration.

#### Migrations/compatibility

Metrics are additive. Keep retention and PII redaction rules explicit. No provider claims without response evidence.

#### Tests

Run redaction tests, health degradation tests, job retry/lease tests, alert fixture tests, and a read-only Production observation.

#### Acceptance criteria

Operators have actionable, privacy-safe evidence for each critical loop and can distinguish app, identity, backend, provider, scheduler, and storage failure.

#### Dependencies and stop conditions

Stop if a required metric would expose member/payment/provider content or if alert thresholds are being invented without baseline observation.

### P2.3 — Accessibility, mobile, and supervised Production pilot

#### Problem and risk

Reception and gym staff use tablets and variable skill levels. A desktop-only or keyboard/focus-broken workflow can fail even when backend tests pass.

#### Implementation tasks

- Test owner, manager, salesperson, receptionist, platform admin, and member flows at desktop/tablet/mobile widths.
- Verify keyboard order, focus return, labels/errors, dialogs, menus, QR/manual fallback, tables, print receipts, high zoom, contrast, reduced motion, and touch targets.
- Complete Arabic/RTL acceptance for changed surfaces.
- Run the supervised pilot sequence only with disposable/approved records, explicit operator approval, backup/export, and cleanup/restoration evidence.
- Observe Production read-only health, error, latency, and capacity signals before enabling additional providers or automation.

#### Likely files/modules

All changed route/components; shared dialog/tabs/layout components; browser-client/manual acceptance scripts; runbook and `CURRENT_STATE.md`.

#### Migrations/compatibility

No data migration. Production pilot mutations require exact approved targets and a recovery path.

#### Tests

Run component/accessibility tests, approved browser/manual checks, authenticated isolated staging, and supervised Production evidence.

#### Acceptance criteria

The complete P0 workflow has no unresolved data, money, access, or misleading-state issue at supported device sizes and locales.

#### Dependencies and stop conditions

Stop before supervised Production work if backup/export, exact target, operator approval, or a recovery owner is missing.

## Testing matrix

| Layer | What it proves | Required coverage | Release use |
|---|---|---|---|
| Pure/domain unit | Dates, money, lifecycle, projections, idempotency helpers | Boundary values, invalid transitions, rounding, stale/missing inputs | Required on every slice |
| Convex handler/security | Real authorization, tenancy, branch, transaction, audit behavior | Allow/deny, cross-tenant/branch, inactive actors, retries, non-disclosing errors | P0 gate |
| Mock/Convex parity | Preview behavior matches backend contract | Same payloads, statuses, errors, projections, lifecycle | Required before UI sign-off |
| Component/UI | Loading, empty, error, forbidden, retry, focus, tab/dialog behavior | Every changed mutation and branch selector | Required before merge |
| Accounting/reconciliation | Money and stock conservation | Sale/refund/void/shift/COGS/journal/report totals | P0.2 gate |
| Authenticated isolated staging | Clerk/provider/config integration | Two gyms, two branches, role matrix, cleanup | P0.7 gate |
| Read-only Production verification | Correct deployment and runtime health | URL/target, health, errors, aggregate projections | Before live claims |
| Accessibility/RTL/mobile | Operator usability | Keyboard, focus, touch, zoom, Arabic/RTL, receipt print | P2 gate |
| Performance/read shape | Bounded reads and latency | Large fixtures, pagination, subscriptions, reports | P2 gate |
| CI repository + browser | Repeatable repository hygiene and credential-free role/public regression coverage | Typecheck, Convex typecheck/codegen, lint, tests, build, audit, diff/clean-worktree checks, mock Playwright | Required on push |

### Standard credential-free commands

Use the repository’s package-manager wrappers from the repository root. Exact commands may be adjusted to the current package scripts, but the normal floor is:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

The production build must run the environment validator. Do not add a secret to make a local build pass. Do not run provider or Production mutations as part of these commands.

## Staging and Production rollout plan

### Stage 1 — Repository and local contract

- Complete P0.1–P0.5 code and credential-free tests.
- Confirm MockGymOSApi parity and generated Convex types.
- Record unresolved decisions as stop conditions rather than burying them in UI copy.

### Stage 2 — Pre-staging target, capacity, and recovery gates

- Complete P0.0 capacity/headroom and P0.0b backup/restore decisions, evidence, integrity check, and isolated restore drill.
- Select an exact non-Production Convex deployment and disposable Clerk instance/identities for staging; separately identify the intended Production target.
- Verify target-bound operator shell/credential selector, names-only environment posture, and Vercel Production URL mapping.
- Run P0.6’s guarded Convex dry run against the intended target. Do not deploy Production in this stage.

### Stage 3 — Isolated development/staging acceptance

- Run P0.7 two-gym/two-branch authenticated journeys with platform admin, owner, manager, receptionist, salesperson, trainer, auditor, customer, and member identities.
- Deploy the candidate backend to the isolated staging target before the journeys; record the target/commit and keep the Production target untouched.
- Run P0.8 platform subscription reconciliation with `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED=1` in isolated staging only; keep member renewal jobs separately observed.
- Exercise email/provider sandboxes only with approved disposable recipients.
- Retain cleanup ledger, redacted logs, before/after configuration, role matrix, and subscription transition evidence.
- Do not advance to Production if a money, access, tenant, branch, backup, capacity, or truthful-provider-state criterion fails.

### Stage 4 — Convex Production release, strictly post-staging

- Confirm P0.7/P0.8 staging acceptance for the exact commit and obtain fresh explicit approval for the exact target, schema/index result, and deploy action.
- Reconfirm the restorable backup/export, owner-selected recovery policy, and operator-shell/credential selector.
- Run the already-reviewed guarded deploy, inspect output for unexpected schema/index changes, and stop on any target/selector mismatch.
- Run read-only health and aggregate checks. Do not seed, import, restore, delete, or mutate product data as a smoke test.
- Keep `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED` default-off in Production until a separate post-deploy activation approval is granted.

### Stage 5 — Vercel and public runtime

- Confirm Vercel Production built the intended commit and uses the selected Production Convex URL and production Clerk classes.
- Check public site, protected direct-route redirects/HTML, security headers, and no mock/demo state.
- Keep CI static, credential-free browser, and optional codegen gates. Do not add
  credentialed staging writes or a Production deploy to CI.

### Stage 6 — Supervised pilot

- Obtain explicit approval for disposable/real pilot records and any recipient/provider activation.
- Run onboarding → owner setup → staff security → CRM/trial → membership/payment → check-in → receipt/refund/shift → subscription transition → audit.
- Observe health, errors, capacity, reconciliation, and support feedback.
- Pause expansion if any money, access, tenant isolation, stock conservation, or truthful-provider-state criterion fails.

## Rollback and data-safety rules

- Never use `git reset --hard`, destructive database commands, or broad deletes to recover a release.
- Prefer an application rollback to a known-good frontend commit and a Convex forward-fix. Convex schema/data rollback must be planned per migration; do not assume a deploy can be reversed automatically.
- Additive schema changes must tolerate old and new code during the transition where possible.
- Keep payment, receipt, refund, void, shift, ledger, stock movement, membership, timeline, audit, and provider-attempt facts immutable. Correct with compensating records, not edits/deletes.
- Product/member/gym cleanup must use the domain’s audited archive/tombstone rules. Permanent deletion is allowed only where references and historical identity remain safe.
- Before Production mutations, confirm a current backup/export and exact target. Keep a redacted before/after record and cleanup owner.
- Disable a feature flag, scheduler, provider allowlist, or route exposure before attempting a data repair when that stops further damage.
- A rollback is not complete until health, auth, branch scope, financial totals, and public/private projections are rechecked.

## Prioritized backlog

| Priority | Work item | Blocks | Completion evidence |
|---|---|---|---|
| P0 | Convex capacity/headroom and service-plan resolution | Any pilot or live provider activation | Owner-selected billing/read-shape decision and target-bound usage/headroom evidence |
| P0 | Restorable backup/recovery gate | Production deploy, scheduler/provider activation, pilot cleanup | Owner-selected freshness/retention/encryption/RPO/RTO, integrity check, isolated restore drill |
| P0 | Explicit branch selection for every mutation | All later confidence claims | Two-branch allow/deny tests and staging proof |
| P0 | Retail refund/void, stock restoration, cost basis, shift, and accounting lifecycle | Financial/Operations pilot | Sale→refund/void→shift→statement conservation |
| P0 | Invitation acceptance and safe user projection | Authenticated staging | Accepted/revoked/foreign identity matrix; no internal leakage |
| P0 | Public media ownership/upload cleanup | Public profile/media confidence | Foreign/private/stale URL denial and cleanup evidence |
| P0 | Production fail-closed mock mode and security headers | Public release safety | Production config tests and header/direct-route checks |
| P0 | Multi-org selection and abuse controls | Multi-gym/customer launch | Deterministic selection, rate/idempotency tests |
| P0 | Provisioning retry preservation | Platform onboarding | Failure-injection/convergence evidence |
| P0 | Real Clerk customer signup | Customer trials/member portal | Disposable Clerk sign-up/verify/sign-in journey |
| P0 | Exact Convex target and pre-staging dry run | Staging promotion | Target-bound operator shell, names-only env check, Vercel URL match, guarded dry-run evidence |
| P0 | Authenticated two-tenant staging | Pilot readiness | Cleanup-safe role/branch/isolation journey set |
| P0 | Subscription reconciliation activation proof | Subscription automation | Controlled-clock staging lifecycle and rollback switch |
| P0 | Post-staging Convex Production deploy | Live backend claim | Staging-complete approval, guarded deploy, target/health/Vercel match evidence |
| P1 | Atomic branch inventory transfer | Multi-branch operations | Stock conservation and audit tests |
| P1 | Automations/facilities launch decision and slice | Honest navigation/pilot scope | Either complete deferred state or working bounded workflow |
| P1 | Operational email provider staging | Truthful delivery | Sandbox provider IDs/retries/bounces/allowlist evidence |
| P1 | CRM offers delivery/acceptance decision | CRM revenue loop | Internal-only truth or provider-backed lifecycle |
| P1 | Platform branch administration | Platform support workflow | Approved action boundary and audit tests |
| P1 | Arabic/RTL catalog and layout completion | Local operator usability | Key completeness and RTL/mobile acceptance |
| P2 | Performance/query/read budgets | Capacity and scale | Large-fixture traces and bounded reads |
| P2 | Observability/incident runbooks | Safe pilot operations | Redacted metrics, alerts, health, rollback evidence |
| P2 | Accessibility/mobile/supervised Production pilot | Launch sign-off | Complete role/device/locale acceptance |

## Definition of done

The readiness program is complete only when:

- P0 workstreams have passed focused tests, Mock/Convex parity, and authenticated isolated staging where specified.
- The Convex capacity/headroom gate is cleared by an owner-selected resolution, and the restorable backup/recovery gate has passed integrity and isolated restore checks.
- Every mutation has explicit tenant and branch scope; All branches cannot write.
- Checkout, payment, receipt, shift, refund/void, inventory, COGS, and accounting facts conserve money and stock under retry/failure.
- Invitation, customer ownership, media privacy, production mode, organization selection, and abuse/security boundaries pass adversarial tests.
- Provisioning and subscription reconciliation are idempotent, auditable, and proven in isolated staging.
- The selected Convex Production deployment is explicitly verified and, if deployed, was deployed only after staging acceptance; no live claim is made for an undeployed backend.
- Vercel runtime points to the correct backend and cannot render mock/demo state in production.
- Provider delivery states are truthful; disabled providers are not described as active.
- The agreed Automations, Facilities, CRM offers, platform branches, inventory transfer, and Arabic scope is either implemented and tested or clearly deferred without dead links.
- Performance, accessibility, mobile, RTL, observability, backup/rollback, and support runbooks are reviewed.
- CI includes static/codegen/build/test gates plus the credential-free mock
  Playwright suite; it does not depend on credentialed staging or Production
  credentials.
- `CURRENT_STATE.md`, `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, this plan, and any decision log accurately distinguish code, staging, Production, and deferred evidence.

## First implementation slice that can begin without external credentials

Start with P0.1, the branch-scope contract and audit. It is repository-contained and does not require Clerk, Convex Production, Vercel, Resend, WhatsApp, SMS, or payment-provider credentials.

1. Search all mutation entry points for implicit first-branch selection and missing branch payloads.
2. Introduce or standardize a small shared scope helper/type for `all` read-only versus concrete branch write scope.
3. Update MockGymOSApi and pure/component tests first so the intended contract is executable without external services.
4. Add Convex boundary tests for the same-tenant/out-of-scope/foreign/inactive cases using existing local test helpers.
5. Patch one vertical at a time—reception/check-ins, shifts/payments, CRM/member creation, journals/PT, then Operations—without changing financial history.
6. Run the credential-free baseline and document the exact changed surfaces.

This slice should not be followed by a Production deploy automatically. After branch scope is correct, proceed to P0.2’s retail accounting design/implementation, then the security and lifecycle phases in the order above.

## Documentation maintenance

Use this file for the ordered implementation program. Use `CURRENT_STATE.md` for what is actually implemented and verified at the current head. Use `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md` for environment ownership, safe commands, release evidence, and operator stop conditions. Use `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` for unresolved business policies such as COGS, tax, refund handling, grace timing, provider scope, and translation terminology.

When a workstream changes state:

- Add the commit or current head.
- State whether evidence is local, CI, Vercel, isolated staging, or Production.
- Record tests and exact target without secrets.
- Record migrations, backup/rollback, and cleanup evidence.
- Do not mark a provider, deployment, or authenticated workflow complete from code inspection alone.
