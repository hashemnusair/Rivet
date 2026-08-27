# 08 — Acceptance Criteria

## Current implementation and evidence boundary — 28 August 2026

The approved runtime for this repository is Next.js App Router + Clerk +
Convex + Vercel, with `GymOSApi` as the page-facing boundary and
`ConvexGymOSApi`/`MockGymOSApi` as the implementations. The older FastAPI,
PostgreSQL, Redis, and worker assumptions below are superseded. Credential-free
repository evidence is current and recorded in `CURRENT_STATE.md`; authenticated
isolated staging, provider configuration, and Production acceptance remain open
where marked.

The current local gate is: 148 Vitest files / 913 tests, 14 repository safety
tests, application and Convex typechecks, lint plus secret-output audit, a
51-route Next production build, and 39 passed / 14 explicitly skipped
credential-gated Playwright journeys.

## A. Frontend pass

### General

- [x] Runs in sanctioned credential-free preview/test mode without external services or secrets.
- [x] Build, lint, type-check, and tests pass in the current local gate.
- [x] Role-routing coverage exercises owner, manager, salesperson, receptionist, trainer, auditor, member, and platform administrator destinations.
- [x] Two branches and connected realistic mock seed data exist.
- [x] Loading, empty, error, timeout, retry, forbidden, and not-found states are reviewable.
- [x] RTL layout can be toggled or otherwise demonstrated.
- [x] All page data access uses the typed `GymOSApi` interface.
- [x] Mutations update mock state and related totals/timelines where the workflow is implemented.

### Owner/manager

- [ ] Dashboard communicates revenue, renewals, lead performance, branch performance, and exceptions.
- [ ] Sensitive alerts link to the relevant record.
- [ ] Audit log supports filtering and event detail.

### Members and memberships

- [ ] Search/filter members.
- [ ] Create and edit member.
- [ ] View coherent Member 360 timeline.
- [ ] Sell and renew a membership.
- [ ] Freeze, extend, and cancel with reason.
- [ ] Display active, expiring, expired, frozen, cancelled, and visit-based examples.

### CRM

- [x] Work a new lead, including a valid phone-only lead and normalized optional email.
- [x] Log contact outcome and preserve it in the lead timeline.
- [x] Schedule and complete follow-up/trial outcomes, including cancellation and no-show.
- [x] Convert a lead to a member through the supported sale path.
- [x] Work expiring/expired renewal queues in the credential-free workflow.

### Reception

- [ ] Search/scan flow is immediately usable.
- [ ] Allowed, warning, blocked, and override states exist.
- [ ] Quick payment and renewal are reachable.
- [ ] Occupancy and recent check-ins update.

### Finance

- [ ] Collect cash/card/bank-transfer payment.
- [ ] Show partial payment/outstanding balance.
- [ ] Print/view coherent receipt.
- [ ] Demonstrate discount, refund/void, and approval states.
- [ ] Open and close shift with expected/counted cash and variance.

### Handoff

- [ ] `FRONTEND_HANDOFF.md` is complete.
- [ ] Backend integration order is documented.
- [ ] Mock reset and demo workflow are documented.

## B. Backend/integration pass

### Platform

- [x] Local Next.js web and Convex/mock preview startup is documented.
- [x] Convex schema/code generation and TypeScript checks replace the former database-migration acceptance assumption.
- [x] Mock reset and the explicit development/preview seed workflow recreate the approved demo scenario; Production seeding is prohibited.
- [ ] Provider health/readiness and exact-target Production checks are complete.
- [x] Redacted Convex correlation logging and repository secret-output auditing are covered; provider observability remains an operator gate.

### Authentication and tenancy

- [ ] Real authentication replaces preview role switching in production mode.
- [ ] Organization and branch scope are enforced server-side.
- [ ] Permission matrix is enforced server-side.
- [ ] Cross-tenant access tests pass.
- [ ] Deactivated users lose access.

### Domain workflows

- [ ] Member creation and duplicate warning persist.
- [ ] Membership sale creates membership, charge, optional payment, receipt, timeline, and audit facts transactionally.
- [ ] Renewal preserves prior term history.
- [ ] Freeze/extension/cancellation are reasoned and audited.
- [ ] Lead conversion is transactional and avoids duplicates.
- [ ] Check-in decision engine enforces branch and membership rules.
- [ ] Manual check-in override is permissioned and audited.
- [ ] Payment is idempotent.
- [ ] Refund/void creates linked immutable financial records.
- [ ] Shift expected cash is computed from transaction facts.
- [ ] Automation execution is deduplicated and retryable.

### Integration

- [x] `ConvexGymOSApi` implements the approved `GymOSApi` interface.
- [x] No page directly embeds backend-specific data-access logic.
- [x] Form validation and Convex domain errors map to actionable UI states.
- [x] `MockGymOSApi` remains an explicit preview/test implementation; Production builds fail closed to Convex.

### Tests

- [x] Unit tests cover money, membership, check-in, permission, CRM progression, public recovery, and automation logic.
- [x] Convex handler tests cover transactions, validation, audit, authorization, and tenant isolation for implemented domains.
- [x] Credential-free Playwright covers the implemented role, public, CRM, finance, operations, and platform journeys; 14 staging/Convex journeys remain explicitly credential-gated.
- [x] CI runs frozen install, build, lint, typechecks, production dependency audit, repository diff/clean-worktree checks, tests, credential-free Playwright, and optional credential-gated Convex code generation.

## C. Product-level release gate

The following is an authenticated business and release acceptance sequence,
not a claim closed by local mock coverage. Keep it open until an approved
isolated staging or Production run records the exact target, identities,
cleanup, and provider evidence.

Do not call the MVP complete until a seeded or pilot organization can perform this full sequence:

1. Owner creates branches, staff access, and membership plans.
2. Salesperson receives a lead, logs contact, and converts it.
3. Salesperson sells a membership with a partial or full payment.
4. Receptionist finds the member and checks them in.
5. The member becomes visible in attendance and dashboard metrics.
6. An expiring membership enters the renewal queue and triggers a task/message execution.
7. A renewal is completed and historical membership terms remain visible.
8. Receptionist closes a cash shift; manager reviews any variance.
9. Manager can trace all sensitive actions in the audit log.
10. A user from another organization cannot access any of these records.
