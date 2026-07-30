# 01 — Scope and Roadmap

## Scope rule

The MVP must be broad enough to run a gym's core commercial operations, but narrow enough to finish. Features are grouped by implementation priority.

## P0 — Required for initial usable release

### Tenant and branch administration

- Create organization and branches.
- Tenant timezone, currency, locale, tax settings, and receipt numbering.
- User invitation and deactivation.
- Roles: owner, manager, salesperson, receptionist, trainer, read-only auditor.
- Permission matrix with branch scope.

### Members

- Create, edit, archive, search, and filter members.
- Profile photo, contact details, emergency contact, notes, tags, preferred language.
- Unique member number within tenant.
- Duplicate warning by phone/email.
- Member 360 timeline.

### Memberships

- Configurable plans and prices.
- Time-based and visit-based memberships.
- Start/end dates, branch access, visit balances, status, payment status.
- New sale, renewal, upgrade, manual extension, freeze, unfreeze, cancellation.
- Approval requirement for configured actions.
- Membership history must remain immutable; changes create new events/adjustments.

### Leads and CRM

- Lead capture and manual creation.
- Stages: new, attempted, contacted, trial booked, trial completed, offer sent, won, lost.
- Owner, source, expected value, next follow-up, notes, contact attempts, loss reason.
- Sales queues: overdue, due today, new/unassigned, trials awaiting follow-up, expiring members, expired members.
- Convert lead into member without duplicating contact data.

### Reception and check-in

- Fast search by member number, phone, name, or QR payload.
- Check-in decision: allowed, warning, or blocked.
- Display photo, active membership, balance, expiry, remaining visits, branch access, and critical notes.
- Manual override requires permission and reason.
- Occupancy count and recent check-ins.

### Payments and reconciliation

- Collect payment against membership or balance.
- Methods: cash, card, bank transfer, other configurable methods.
- Partial payments and outstanding balances.
- Numbered receipt.
- Discount with reason and optional approval.
- Void/refund workflow with reason, permission, and audit event.
- Reception shift open/close and expected-versus-counted cash.
- Daily reconciliation report.

### Automations

Implement rule evaluation and delivery abstraction, even if outbound integrations begin in sandbox mode.

Initial triggers:

- Membership expires in 14, 7, 3, or 1 day.
- Membership expired.
- No check-in for configurable number of days.
- New lead has no first contact within target time.
- Follow-up becomes overdue.
- Payment remains outstanding.

Initial actions:

- Create staff task.
- Queue message using template.
- Notify manager in-app.

### Dashboards

- Owner dashboard.
- Branch manager dashboard.
- Sales dashboard.
- Reception dashboard.

### Audit

- Actor, tenant, branch, timestamp, action, entity, before/after summary, reason, request correlation ID.
- Sensitive events cannot be edited or deleted through the application.

## P1 — Add after the core loop works

- Class schedules, capacity, bookings, waitlists, and no-shows.
- PT packages and session deductions.
- Trainer client list and availability.
- Corporate accounts and linked members.
- Product/POS inventory.
- Equipment/facility maintenance.
- Better campaign analytics.
- Configurable commissions.
- Offline-tolerant reception check-in queue.
- Public member web portal.

## P2 — Expansion

- Native member mobile app.
- Opt-in gym discovery and offers.
- Gym-controlled trainer marketplace.
- Independent verified trainer marketplace.
- Cross-gym user identity with explicit consent.
- Advanced churn prediction and anomaly detection.
- Country-specific e-invoicing and payment integrations.

## Explicit non-goals for initial implementation

- Do not implement every P1/P2 screen as a fake placeholder.
- Do not model full double-entry accounting.
- Do not store fingerprint images or raw biometric templates.
- Do not let one tenant search another tenant's members.
- Do not make the UI dependent on an AI service.

## Recommended implementation milestones

1. Frontend shell, design system, navigation, and typed mocks.
2. Members and Member 360.
3. Membership plans and subscriptions.
4. CRM and renewal queues.
5. Reception and check-in.
6. Payments and reconciliation.
7. Automations, audit, dashboards, and import/export.
8. Authentication, permissions hardening, tests, and deployment.
