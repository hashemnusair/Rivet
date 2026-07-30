# 04 — Backend / Integration Agent Task

## Your responsibility

Take the approved frontend and implement the rest of the MVP: backend services, database, authentication, authorization, background jobs, auditability, imports, tests, and real frontend integration.

The frontend is not disposable. Read `FRONTEND_HANDOFF.md` before changing code.

## Required technical direction

### API

- FastAPI application under `apps/api`.
- Versioned REST API under `/api/v1`.
- Pydantic request/response schemas.
- Generated OpenAPI document committed or reproducibly generated.
- CORS and cookie/token strategy appropriate to local and deployed environments.

### Persistence

- PostgreSQL.
- SQLAlchemy 2-style models and sessions.
- Alembic migrations.
- UUID primary keys.
- UTC timestamps.
- Integer minor units plus currency code for money.
- Soft archive where historical records must remain referentially intact.

### Jobs

Use a Redis-backed worker for scheduled automation evaluation, message dispatch, imports, and other retryable work. Do not rely on in-process web-server background tasks for durable jobs.

### Authentication

Implement secure authentication suitable for an administrative SaaS. The exact provider may be chosen during implementation, but it must support:

- Email/password or managed identity.
- Session revocation.
- Password reset if passwords are local.
- Optional future MFA.
- Organization membership and branch-scoped assignments.

Do not encode authorization solely in frontend claims.

## Core architecture

Suggested modules:

```text
apps/api/app/
├── api/                # route modules
├── auth/
├── core/               # settings, errors, security, logging
├── db/
├── domains/
│   ├── organizations/
│   ├── users/
│   ├── members/
│   ├── memberships/
│   ├── crm/
│   ├── checkins/
│   ├── payments/
│   ├── reconciliation/
│   ├── automations/
│   └── audit/
├── jobs/
├── integrations/
└── tests/
```

Prefer domain services/use cases over business logic in route functions.

## Multi-tenancy requirements

- Every tenant-owned row carries `organization_id` directly or through an unambiguous parent.
- Branch-owned records also carry `branch_id` where operationally relevant.
- Every request resolves an authenticated organization membership and branch scope.
- Repository/service queries must enforce tenant scope.
- Add PostgreSQL row-level security where practical as defense in depth; application authorization remains mandatory.
- Tenant admins cannot grant permissions they do not possess unless explicitly allowed by policy.
- Cross-tenant identifiers should resolve as not found rather than disclose existence.

## Authorization model

Start with roles plus granular permissions.

Example permissions:

```text
members.read
members.write
members.archive
members.sensitive_notes.read
memberships.sell
memberships.freeze
memberships.override_dates
payments.collect
payments.discount
payments.refund
payments.void
reconciliation.open_shift
reconciliation.close_shift
reconciliation.approve_variance
crm.read
crm.write
crm.assign
reports.financial.read
audit.read
users.manage
settings.manage
checkins.override
```

Support branch scope: all branches, selected branches, or current branch.

## Required business invariants

### Memberships

- A membership sale creates an immutable commercial record plus status events.
- Renewals create a new term or explicit renewal record; do not overwrite historical dates.
- Freeze/extension operations record actor, reason, old values, new values, and approval if required.
- Visit balances cannot silently become negative.
- Status should be derived consistently from explicit state and dates, not independently edited in several places.

### Payments

- Money values are integer minor units.
- Payment creation is idempotent using an idempotency key.
- Receipt numbers are tenant-configurable and collision-safe.
- Discounts, refunds, and voids require permissions and reasons.
- Never delete settled payment history.
- A refund is a separate transaction linked to the original payment.
- Reconciliation uses immutable transaction facts and explicit adjustments.

### Check-in

- Evaluate organization, branch access, membership state, dates, visit balance, and block/warning rules.
- A manual override requires permission and reason.
- Duplicate scan suppression should prevent accidental rapid duplicate check-ins.

### CRM

- Contact attempts are append-only activities.
- Follow-up tasks have owner, due time, status, outcome, and relation to lead/member.
- Lead-to-member conversion must be transactional and avoid duplicate person creation.

### Audit

- Record all sensitive mutations.
- Audit data is append-only from application users.
- Store a compact before/after representation and request correlation ID.
- Do not log secrets, full authentication tokens, or unnecessary sensitive content.

## Automations

Implement a simple durable rule system for the P0 triggers and actions.

Minimum components:

- Rule configuration.
- Scheduled evaluator.
- Deduplication key to avoid repeated identical actions.
- Execution record.
- Retry policy.
- Template renderer.
- Delivery provider abstraction.
- Sandbox/log provider for development.
- In-app task/notification provider.

A WhatsApp provider may be added behind the abstraction, but development and tests must not require a live provider.

## Imports

Implement CSV import for members and optionally existing membership balances.

Required behavior:

- Upload and parse preview.
- Column mapping.
- Validation report.
- Duplicate detection.
- Dry run.
- Transactional or chunked import with resumable status.
- Audit event and import summary.

## Frontend integration

- Implement `HttpGymOSApi` against the approved interface.
- Preserve existing domain types where sensible; generate or share contracts to prevent drift.
- Replace mock mode through configuration.
- Keep mock mode available for visual development if practical.
- Provide consistent loading/errors and map API validation errors to forms.

## API error envelope

Use one stable shape:

```json
{
  "error": {
    "code": "MEMBERSHIP_NOT_ACTIVE",
    "message": "The member does not have an active membership for this branch.",
    "details": {},
    "request_id": "uuid"
  }
}
```

Use appropriate HTTP status codes, but frontend behavior should primarily key off stable domain error codes.

## Observability

- Structured logs with request ID, organization ID, actor ID, route, and outcome.
- Health and readiness endpoints.
- Error reporting hook.
- Metrics for request latency, job failures, automation dispatch, and payment/check-in errors.
- Redact sensitive values.

## Testing requirements

### Unit

- Membership state/date calculations.
- Price, discount, balance, refund, and reconciliation calculations.
- Check-in decision engine.
- Permission evaluation.
- Automation deduplication.

### Integration

- Database constraints and migrations.
- Tenant isolation.
- Role and branch authorization.
- Idempotent payment creation.
- Lead conversion.
- Membership sale/renew/freeze/extend.
- Shift close and variance.
- Audit events.

### End-to-end

Use the actual web app plus API for at least:

1. Manager creates a plan and member.
2. Salesperson sells a membership and records payment.
3. Receptionist checks the member in.
4. Salesperson completes an expiring-member follow-up.
5. Receptionist closes a cash shift with variance.
6. Manager reviews audit trail.

## Deployment deliverables

- Local development with one documented command or small set of commands.
- `.env.example` files with no secrets.
- Database migration command.
- Seed command creating the frontend demo scenario.
- Production build commands.
- Backup/restore notes.
- Basic deployment notes for frontend, API, PostgreSQL, Redis, and worker.

## Completion criteria

- Frontend runs on real API data.
- P0 workflows persist and respect authorization.
- Tenant-isolation tests pass.
- Money-changing and sensitive actions are audited.
- Jobs are durable and observable.
- Build, lint, type-check, migrations, and test suites pass.
- Documentation reflects actual commands and architecture.
