# 08 — Acceptance Criteria

## A. Frontend pass

### General

- [ ] Runs locally without external services or secrets.
- [ ] Build, lint, type-check, and tests pass.
- [ ] Role switcher demonstrates owner, manager, salesperson, and receptionist experiences.
- [ ] Two branches and connected realistic seed data exist.
- [ ] Loading, empty, error, forbidden, and not-found states are reviewable.
- [ ] RTL layout can be toggled or otherwise demonstrated.
- [ ] All data access uses the typed client interface.
- [ ] Mutations update mock state and related totals/timelines.

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

- [ ] Work a new lead.
- [ ] Log contact outcome.
- [ ] Schedule and complete follow-up.
- [ ] Convert a lead to a member.
- [ ] Work expiring/expired renewal queues.

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

- [ ] Local web, API, database, Redis, and worker startup is documented.
- [ ] Migrations run from a fresh database.
- [ ] Seed command recreates the approved demo scenario.
- [ ] Health/readiness endpoints work.
- [ ] Structured request/job logging exists.

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

- [ ] `HttpGymOSApi` implements the approved frontend interface.
- [ ] No page directly embeds backend-specific fetch logic.
- [ ] Form validation errors map correctly.
- [ ] Mock mode remains available or is cleanly removable.

### Tests

- [ ] Unit tests cover money, membership, check-in, permission, and automation logic.
- [ ] Integration tests cover transactions, constraints, audit, and tenant isolation.
- [ ] End-to-end tests cover the six workflows listed in the backend task.
- [ ] CI runs build, lint, type-check, migrations check, and tests.

## C. Product-level release gate

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
