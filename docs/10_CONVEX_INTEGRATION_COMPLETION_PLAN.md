# 10 — Convex Integration Completion Plan

## Purpose

Complete GymOS as an operationally credible MVP on the approved Next.js, Convex, Clerk, and Vercel architecture. Preserve the approved frontend, replace production mock behavior through the existing data-access boundary, enforce tenant and branch authorization on the server, persist the full commercial operating loop, and retain mock mode only for deterministic preview and testing.

This is one implementation program. Use one feature branch, make logical checkpoint commits, run the complete verification suite, then push and open one final pull request. Do not create a separate pull request for each phase.

## Current baseline — 2026-08-04

- Git branch `main` is clean and synchronized with GitHub at `ad67092`.
- GitHub reports a successful Vercel deployment for the current commit.
- `pnpm typecheck` passes.
- `pnpm lint` passes with zero warnings.
- `pnpm test` passes with 165 tests across 8 files.
- `pnpm test:e2e` passes with 13 browser journeys.
- `pnpm build` passes and prerenders 347 routes with the Clerk request proxy enabled.
- Clerk authenticates users and Convex currently persists users, organizations, branches, and organization memberships.
- Real identity and role resolution are partially integrated, but gym operational data still comes from `MockGymOSApi`.
- `apps/web/src/lib/api/client.ts` always constructs `MockGymOSApi`; there is no production Convex implementation of the `GymOSApi` contract.
- There is no GitHub Actions workflow. The only GitHub commit status currently reported is Vercel.
- Existing Playwright journeys use `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`, so they verify the deterministic preview path rather than the production Clerk-to-Convex path.

## Architectural authority

`docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` is authoritative: Convex, Clerk, and Vercel supersede the earlier FastAPI, PostgreSQL, and Redis default for this implementation.

- Convex owns persistence, transactional server functions, scheduled work, file storage, and realtime data.
- Clerk owns credentials, sessions, account recovery, and organization-neutral user identity.
- Convex owns organizations, branches, operational roles, permissions, tenant scope, branch scope, business invariants, and audit events.
- Vercel runs the Next.js application and Clerk request proxy.
- The existing `GymOSApi` interface remains the application-facing data boundary.
- Pages and components must not directly import seed data or add ad hoc backend calls.
- Mock mode must remain available for local visual review and deterministic frontend tests, but it must never be selected silently in production.

## Branch and delivery model

1. Create one branch named `codex/complete-convex-integration` from the latest `main`.
2. Keep all work on that branch.
3. Make logical checkpoint commits after a phase is complete and its focused tests pass.
4. Push the feature branch as needed for backup and GitHub Actions verification. This repository deploys to Vercel only from `main`.
5. Do not merge partial phases into `main`.
6. When every completion gate in this document passes, push the final branch and open one non-draft pull request.
7. The pull request description must summarize architecture, migrations, persisted workflows, security boundaries, tests, deployment requirements, known compromises, and rollback considerations.

## Non-negotiable implementation rules

### Tenant and authorization rules

- Every tenant-owned record must carry an `organizationId` directly or through an unambiguous parent relationship.
- Every branch-owned operational record must carry a `branchId` where appropriate.
- Every public Convex query and mutation must resolve the authenticated user on the server.
- Tenant access must be established from an active organization membership stored in Convex, never from a client-supplied role.
- Branch access must be checked on the server for every branch-scoped operation.
- Cross-tenant identifiers must return a stable not-found error rather than disclose that the record exists.
- Deactivated users and inactive memberships must lose access immediately.
- Platform-administrator status may only be granted through an internal/admin-only function and must not be self-service.
- Tenant administrators must not grant permissions they do not possess unless an explicit platform policy allows it.
- Hiding controls remains a usability feature, not an authorization mechanism.

### Identity and identifiers

- Clerk subject IDs identify credentials; they are not tenant roles.
- Convex document IDs may be used internally for relationships.
- Every entity crossing the `GymOSApi` boundary must expose a stable UUID public ID to preserve the documented contract and existing route semantics.
- Seeded UUIDs used by established tests and deep links must remain stable.
- New public IDs must be collision-safe and generated server-side.

### Money, dates, and accounting facts

- Money is always stored as integer minor units plus an ISO currency code.
- JOD uses three decimal places.
- Store timestamps as UTC epoch milliseconds or another consistently documented UTC representation.
- Evaluate business-day boundaries in the tenant timezone, initially `Asia/Amman` for the seeded tenant.
- Never edit or delete settled financial history.
- A void and refund are distinct additive operations.
- Receipt numbers are organization-scoped, sequential, collision-safe, and never reused.
- Payment creation must be idempotent using the caller-supplied idempotency key.

### Audit and sensitive actions

- Audit events are append-only from application users.
- Price overrides, discounts, refunds, voids, freezes, unfreezes, extensions, cancellations, membership-date changes, check-in overrides, shift variances, role changes, permission changes, and user deactivation require immutable audit events.
- For the MVP, approval thresholds are post-action review states: the underlying financial or commercial fact is completed first, and approval/rejection is stored as a separate append-only review without rewriting settled history.
- Mandatory reasons must be enforced by server functions, not only by forms.
- Audit events must record actor, organization, branch when relevant, action, entity type, entity public ID, UTC timestamp, reason, compact before/after state, and correlation ID.
- Secrets, full authentication tokens, and unnecessary sensitive data must never enter logs or audit payloads.

### Error contract

- Preserve the stable `ApiError` behavior expected by the frontend.
- Map Convex errors into the documented envelope semantics: stable code, safe message, optional details, optional field errors, and request/correlation ID.
- Preserve the distinction between `FORBIDDEN`, `NOT_FOUND`, validation failures, conflicts, and domain-state errors.
- UI behavior must never branch on raw Convex error strings.

## Required data model

Extend the existing Convex schema to cover the current frontend contract. Prefer normalized records and explicit immutable event tables over large mutable documents.

### Foundation

- Organizations: name, slug, status, timezone, currency, locale, default language, tax configuration, receipt prefix/footer, and receipt sequence state.
- Branches: organization, public UUID, name, code, address, phone, capacity, active/inactive status, and timestamps.
- Users: Clerk subject, public UUID, email, full name, phone where applicable, platform-admin flag, account status, and timestamps.
- Organization memberships: organization, user, role, branch scope, branch IDs, active/deactivated status, invitation state, and timestamps.
- Role definitions: organization/system role, permission keys, discount limit, immutable system-role marker, and timestamps.
- Payment methods: organization, key, label, enabled status, cash classification, display order, and timestamps.
- Notification settings: manager alerts, automation delivery mode, quiet hours, and language defaults.
- Idempotency records: organization, operation, idempotency key, result reference, request hash, and creation/expiry metadata.

### Commercial operations

- Membership plans and plan prices.
- Members, contact details, emergency contact, preferred language, tags, notes, archive state, and tenant-unique member number.
- Membership terms with immutable commercial terms and explicit links between renewals.
- Membership events and adjustments for sale, renewal, freeze, unfreeze, extension, cancellation, visit deductions, and approval state.
- Charges, payment transactions, allocations, refunds, voids, receipts, and organization receipt counters.
- Cash shifts, counted denominations, expected totals, variances, review status, and adjustment facts.
- Check-ins with decision, warnings/blocks, override actor/reason, source, and duplicate-suppression key.

### CRM and automation

- Leads, stages, owner, source, expected value, next follow-up, loss reason, and conversion references.
- Append-only contact attempts.
- Follow-up tasks with owner, due time, status, outcome, and related lead/member.
- Offers with plan, price, expiry, and status.
- Automation rules, message templates, execution records, deduplication keys, attempts, retry state, and delivery results.
- Append-only audit events.

### Existing consumer and platform surfaces

- Customer/member profiles linked to Clerk users.
- Trial requests linked to the destination gym organization and branch; accepted trial requests must appear in that gym's CRM.
- Customer-to-membership relationships required by My Gyms and membership detail views.
- Short-lived signed entry-pass tokens that can be validated server-side; the production path must not rely on the current demo QR identity.
- Platform subscription records, billing ledger records, and support conversations sufficient to back the existing platform-admin screens. External subscription collection may remain behind an adapter if a billing provider has not been selected, but displayed production records must persist in Convex.

## Execution phases

### Phase 0 — Baseline, CI, and repository hygiene

1. Add GitHub Actions under `.github/workflows/ci.yml` for pull requests and pushes to `main`.
2. Use Node 20 or newer and pnpm with the committed lockfile.
3. Run frozen installation, typecheck, lint, unit/component tests, production build, Playwright browser installation, and Playwright tests.
4. Split browser tests from faster static checks when useful, but make every required job visible as a required status check.
5. Cache pnpm dependencies without caching secrets or build output that can hide failures.
6. Preserve the existing mock-mode Playwright suite.
7. Add a separate authenticated integration/smoke path for a dedicated Clerk development instance and Convex development/preview deployment. It may run only on trusted branches or manually when secrets are unavailable to forked pull requests.
8. Remove deployment-trigger-only markers and document how to redeploy an existing commit through Vercel instead of creating empty product commits.
9. Update stale test counts and authentication notes in `FRONTEND_HANDOFF.md` and `README.md`.
10. Configure repository branch protection after CI exists: require pull requests, required checks, and an up-to-date branch before merge.

Exit criteria:

- The complete baseline suite is green locally and in GitHub Actions.
- The pull request is green without requiring a Vercel branch deployment; verify the production Vercel deployment immediately after merge.
- `main` can be protected using named required checks.
- No application behavior changes are hidden inside CI work.

### Phase 1 — Convex security, tenancy, errors, and audit kernel

1. Add reusable Convex helpers for authenticated user resolution, active organization membership, permission evaluation, branch scope, entity lookup, correlation IDs, and tenant-local time.
2. Define the complete permission catalogue already represented by the frontend.
3. Seed system role definitions and allow tenant-specific permission/discount-limit configuration where the UI supports it.
4. Add append-only audit-event infrastructure and a single helper used by every sensitive mutation.
5. Add a stable domain-error representation and a frontend mapper into `ApiError`.
6. Add indexes needed for tenant-scoped lookups, public UUIDs, email/phone duplicate detection, receipt allocation, idempotency, and scheduled queues.
7. Add integration tests proving authentication, deactivation, role enforcement, branch enforcement, cross-tenant non-disclosure, platform-admin restrictions, and immutable audit behavior.

Exit criteria:

- New public functions cannot be written without using the security helpers.
- Cross-tenant and branch-scope tests fail if a scope check is removed.
- Sensitive mutations have a tested audit path.
- Frontend receives stable domain codes instead of raw server errors.

### Phase 2 — Session and reference data

1. Complete production session resolution for users with multiple organization memberships and branch scopes.
2. Provide organization selection only when a user belongs to multiple gyms; never provide persona selection in production mode.
3. Implement persistent organization settings, branches, notification settings, role definitions, payment methods, staff invitations, and staff access changes.
4. Integrate Clerk invitations for staff onboarding through a server-only action or a documented provider adapter. Never expose the Clerk secret key to browser code.
5. Implement membership-plan list/create/update/archive behavior with tenant-scoped prices and visit/time-based plan rules.
6. Extend the seed function so the real Convex deployment recreates the approved Forge Fitness reference scenario deterministically.
7. Add audit events for settings, branch, plan, role, permission, invitation, and deactivation changes.

Exit criteria:

- A real owner can manage settings, branches, staff access, payment methods, and plans.
- Manager and lower-role restrictions are enforced server-side.
- Changes persist across reloads and deployments.
- An authenticated user from another organization cannot read or mutate the records.

### Phase 3 — Production data adapter and migration switch

1. Implement `ConvexGymOSApi` against the existing `GymOSApi` interface.
2. Reuse the authenticated `ConvexReactClient` configured by the root provider so calls carry the Clerk token.
3. Keep TanStack Query and the existing `useApiQuery`/`useApiMutation` hooks as the page-facing integration layer.
4. Add an explicit data-mode configuration such as `NEXT_PUBLIC_DATA_MODE=mock|convex`.
5. Default deployed production builds to Convex and fail closed if required Convex configuration is missing.
6. Allow explicit mock mode only for local preview and deterministic test workflows.
7. Do not add direct Convex hooks to individual product pages as a shortcut; identity/bootstrap providers may remain specialized where already established.
8. Convert Convex documents into existing domain types at the adapter boundary, including public UUIDs, role-name mapping, money, timestamps, pagination, and errors.
9. Migrate reference-data methods first and prove the settings and plans screens no longer read mock data in Convex mode.

Exit criteria:

- Production data mode never constructs `MockGymOSApi`.
- Mock mode still passes the entire existing suite.
- Reference-data pages function without direct backend imports.
- The adapter has contract tests covering mapping and error behavior.

### Phase 4 — Members and the unified timeline

1. Implement member list, search, filter, pagination, create, update, archive, and duplicate detection.
2. Enforce tenant-unique member numbering with branch-aware prefixes where configured.
3. Persist notes and contact attempts as append-only timeline facts.
4. Build the unified chronological timeline from member, membership, payment, check-in, CRM, message, and audit-related events without duplicating facts.
5. Preserve sensitive-note permissions.
6. Add CSV import support for members: upload, preview, column mapping, validation, duplicate detection, dry run, resumable/chunked commit, summary, and audit event.
7. Add tests for duplicates, archive behavior, branch access, imports, and cross-tenant lookup.

Exit criteria:

- Member workflows persist after refresh.
- Member 360 displays coherent real data.
- Import failures are reviewable and resumable without partial silent corruption.
- Timeline ordering and tenant scope are tested.

### Phase 5 — Memberships and commercial invariants

1. Implement membership list/detail, sale, renewal, freeze, unfreeze, extension, cancellation, and visit balances.
2. Preserve historical terms; renewals create linked new terms rather than overwriting old dates.
3. Port membership-status derivation to server-side domain logic using the existing precedence.
4. Enforce approval thresholds for configured discounts and sensitive actions.
5. Ensure visit balances cannot silently become negative.
6. Write timeline and audit facts in the same transaction as each commercial mutation.
7. Add unit and integration tests for status boundaries, tenant-local dates, renewal history, approvals, and mandatory reasons.

Exit criteria:

- Membership sale and renewal history remain immutable and coherent.
- Freeze, extension, and cancellation behavior matches the frontend contract.
- Removing a server permission or reason check causes a test failure.

### Phase 6 — Payments, receipts, and reconciliation

1. Implement charges, partial payments, allocations, outstanding balances, discounts, refunds, voids, and receipts.
2. Make payment creation idempotent by organization and caller-supplied key; reject reuse with a different request payload.
3. Allocate receipt numbers atomically per organization.
4. Enforce the same-business-day void rule in the tenant timezone.
5. Keep refund and void semantics distinct and additive.
6. Implement printable/reloadable receipts backed by persistent records.
7. Implement cash-shift open/close, expected cash from transaction facts, counted cash, variance reasons, and manager review.
8. Add tests for integer money, JOD formatting inputs, partial payment, idempotency, receipt collisions, refund/void behavior, shift totals, and audit facts.

Exit criteria:

- A membership sale can atomically create membership, charge, optional payment, receipt, timeline entries, and audit events.
- Runtime receipts survive reloads.
- Shift expected cash is derived from persistent payment facts.
- Money-changing authorization and audit tests pass.

### Phase 7 — Reception and check-in

1. Implement lookup by member number, phone, name, and signed QR payload.
2. Port the existing check-in decision ordering to server-side logic without changing precedence.
3. Implement allowed, warning, blocked, and override outcomes.
4. Enforce branch access, membership state, dates, visit balance, duplicate suppression, outstanding-balance warning, and expiry warning.
5. Require override permission and reason.
6. Persist occupancy and recent-check-in projections.
7. Validate short-lived entry-pass tokens server-side and prevent replay where appropriate.
8. Preserve the reception keyboard contract and current UI.

Exit criteria:

- A receptionist can check in a newly sold member using real data.
- Visit passes decrement transactionally.
- Duplicate scans are suppressed.
- Overrides are permissioned, reasoned, and audited.

### Phase 8 — CRM and acquisition loop

1. Implement leads, stages, assignment, expected value, notes, contact attempts, tasks, offers, loss reasons, and queues.
2. Make contact attempts append-only.
3. Make lead-to-member conversion transactional and duplicate-aware.
4. Implement renewal queues from real membership data.
5. Persist consumer trial requests and route them into the selected gym's CRM with correct tenant and branch scope.
6. Ensure a gym cannot discover another gym's private lead or customer data through shared consumer identity.
7. Add tests for stage transitions, task completion, conversion, trial routing, duplicate prevention, and tenant isolation.

Exit criteria:

- The public trial flow creates a real gym-scoped lead.
- Staff can work that lead through conversion without retyping contact data.
- Renewal queues reflect persisted membership state.

### Phase 9 — Automations, notifications, and durable work

1. Implement Convex scheduled functions and durable execution records for the required triggers.
2. Support expiry thresholds, expired memberships, inactivity, untouched new leads, overdue follow-ups, and outstanding payments.
3. Implement task creation, queued templated messages, and manager in-app notifications.
4. Add deduplication keys, retry policy, attempt history, suppression reasons, and failure visibility.
5. Keep outbound delivery behind a provider abstraction.
6. Use a sandbox/log provider by default; do not require live WhatsApp, SMS, or email credentials for tests.
7. Respect tenant quiet hours and preferred language.

Exit criteria:

- Re-running an evaluator does not duplicate the same action.
- Failures can retry and remain visible.
- Scheduled work is durable and observable in Convex.
- Tests cover trigger boundaries, deduplication, retries, and tenant scope.

### Phase 10 — Platform and customer persistence

1. Back customer signup/profile, My Gyms, membership detail, trial state, and entry pass with real identity and Convex records.
2. Back platform tenant directory, subscription state, billing ledger, and support inbox with real persisted records.
3. Enforce platform-admin authorization for every platform function.
4. Keep external SaaS billing collection behind an adapter until a provider is explicitly selected; do not fabricate successful external charges.
5. Preserve the public directory boundary: only opted-in/public gym data is visible without tenant membership.

Exit criteria:

- Customer and platform pages do not silently fall back to session storage or frozen seed arrays in Convex mode.
- Platform data is inaccessible without the Convex platform-admin flag.
- Public gym discovery exposes only explicitly public fields.

### Phase 11 — Dashboards, cleanup, and production hardening

1. Replace dashboard aggregates only after their source workflows are persistent.
2. Remove production dependencies on mock prerender IDs and session-storage personas.
3. Keep `resetDemo()` and `setBehavior()` available only in explicit mock mode.
4. Remove dead transitional code after import-graph verification.
5. Add loading, empty, error, forbidden, and not-found coverage for the Convex adapter.
6. Add structured server logging with correlation ID, organization, actor, function, and outcome while redacting secrets.
7. Maintain a health query and document deployment verification.
8. Review all new TSX with the established accessibility, RTL, responsive, and interaction requirements.

Exit criteria:

- No production route uses the mock client, seeded persona state, or session storage as the source of truth.
- Dashboards reconcile with underlying persisted facts.
- Static analysis finds no unreachable migration modules.
- Production errors are observable without leaking secrets.

### Phase 12 — Full verification and delivery

Run and record all of the following from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Also run:

- Convex schema/code generation checks.
- Convex unit/integration tests.
- Tenant-isolation and authorization tests.
- Money-changing and audit tests.
- An authenticated Clerk-to-Convex smoke flow against a development or preview deployment.
- The complete product-level release sequence below.

Update:

- `README.md` with exact local and deployment commands.
- `FRONTEND_HANDOFF.md` with the final adapter state, removed seams, tests, and remaining compromises.
- `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` with any material decisions made during implementation.
- `.env.example` with variable names only and no secrets.
- Backup/restore, seed, and rollback notes for Convex and Vercel.

After verification:

1. Confirm `git diff --check` passes.
2. Review the final diff for secrets, generated junk, debug output, and unrelated files.
3. Commit remaining documentation and verification updates.
4. Push `codex/complete-convex-integration`.
5. Open one ready-for-review pull request into `main`.

## Product-level release sequence

The work is not complete until a seeded or pilot organization can perform this sequence using real Convex data:

1. A platform administrator creates or activates a gym organization.
2. The owner configures branches, staff access, roles, permissions, payment methods, and membership plans.
3. A salesperson receives a lead, records contact, schedules follow-up, and converts the lead without duplicating the person.
4. The salesperson sells a membership with a partial or full payment.
5. The system creates immutable commercial facts, a receipt, timeline entries, and audit events.
6. A receptionist finds the member and checks them in.
7. The visit and occupancy state update consistently.
8. An expiring membership enters the renewal queue and triggers a deduplicated task or sandbox message.
9. A renewal creates a new linked term while preserving the prior term.
10. The receptionist closes a cash shift and a manager reviews any variance.
11. The manager can trace every sensitive action through the audit log.
12. The member sees the correct gym and membership in My Gyms and can generate a server-valid entry pass.
13. A user from another organization cannot read or mutate any private record from the sequence.

## Explicit non-goals

- Independent trainer marketplace.
- Native mobile applications.
- Full class scheduling, capacity, and waitlists.
- Full inventory and point-of-sale management.
- Double-entry accounting.
- Biometric template storage.
- Advanced churn prediction.
- Live WhatsApp, SMS, or email delivery before a provider is selected and approved.
- External subscription collection before a billing provider is selected; persistent platform billing records and provider boundaries are still required.
- Visual redesign of the approved frontend unless a functional contradiction requires a narrowly scoped adjustment.

## Final completion report

The implementation agent must report:

- What was implemented.
- What remains and why it is outside the approved scope or blocked by an external product decision.
- Commands to run locally.
- Deployment commands and required environment-variable names.
- Tests run and exact results.
- Known compromises and assumptions.
- Database/schema migration and seed behavior.
- Security and tenant-isolation evidence.
- The first files another agent should read.
- Branch name, final commit SHA, pushed remote, and pull-request URL.
