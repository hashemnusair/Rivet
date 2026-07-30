# 07 — Security and Tenancy

## Security posture

GymOS contains personal, financial, attendance, and potentially health-adjacent data. Build it as a real multi-tenant administrative system, not a single-tenant CRUD app with an `organizationId` dropdown.

## Tenant isolation

- Resolve tenant context from the authenticated organization membership, never from an untrusted body field alone.
- Scope every tenant query.
- Validate branch access independently from tenant access.
- Do not expose whether a foreign-tenant record exists.
- Use database constraints and, where practical, PostgreSQL row-level security as defense in depth.
- Automated tests must attempt horizontal and vertical privilege escalation.

## Authentication

- Secure, HTTP-only session cookies are preferred for the browser app unless the chosen identity architecture requires another approach.
- Protect state-changing requests against CSRF as appropriate to the session design.
- Rate-limit authentication and sensitive endpoints.
- Support session revocation and inactive-user denial.
- Never store passwords without a modern password-hashing implementation; a managed identity provider is acceptable.

## Authorization

Enforce permissions in backend services/routes for every action. Frontend permission checks are usability only.

Sensitive examples:

- Reading financial reports.
- Viewing sensitive notes.
- Overriding a check-in.
- Changing membership dates.
- Applying discounts.
- Refunding or voiding payments.
- Closing or approving a cash shift.
- Managing users and permissions.
- Exporting member data.

## Audit requirements

Audit at minimum:

- Authentication/security events.
- Member archive and sensitive-field changes.
- Membership sale, freeze, extension, cancellation, date override, and visit adjustment.
- Payment, discount, refund, void, cash adjustment, and shift close/approval.
- Check-in override.
- Role, permission, user, branch, tax, receipt, and automation-rule changes.
- CSV import/export.

Audit events must be append-only for normal application users.

## Data minimization

- Collect only fields needed for gym operations.
- Keep ordinary notes separate from sensitive/health notes with separate permissions.
- Avoid storing raw biometric data. Prefer QR/NFC or external access-control references.
- Do not create a searchable shared member directory across gyms.
- Cross-gym consumer identity is a future opt-in system, not an MVP shortcut.

## Privacy controls

- Record communication preferences and consent where required.
- Separate operational notices from marketing consent.
- Support export and deletion/anonymization workflows subject to financial/audit retention requirements.
- Retained financial or audit records should minimize personal content while preserving legal/operational integrity.
- Do not place secrets or unnecessary personal data in logs.

## Application security

- Validate input at API boundaries.
- Escape/sanitize rich text; prefer plain text for notes in the MVP.
- Protect file uploads by type, size, scanning strategy, and private object access.
- Use signed or authenticated URLs for private photos/documents.
- Apply secure headers and a restrictive content security policy compatible with the app.
- Prevent mass assignment by using explicit schemas.
- Use idempotency keys for payment creation and other retry-prone money operations.
- Use database transactions around commercial operations.

## Operational security

- Environment-separated secrets.
- Least-privilege database and cloud credentials.
- Encrypted transport.
- Encrypted managed storage where available.
- Automated backups and restore drills.
- Migration rollback/forward-fix plan.
- Dependency and secret scanning in CI.
- Error tracking with redaction.

## Threat scenarios that must be tested

1. Receptionist attempts to view another branch's financial report.
2. Salesperson changes a membership price beyond permission.
3. User substitutes another organization ID in an API request.
4. Repeated payment request is retried after a timeout.
5. Receptionist rapidly scans one QR multiple times.
6. Deactivated employee reuses an old session.
7. Staff edits a member URL to access a foreign-tenant member.
8. User attempts to delete a payment or audit event.
9. CSV formula injection is included in exported data.
10. Logs accidentally capture message content, tokens, or sensitive notes.
