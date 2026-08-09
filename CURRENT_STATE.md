# GymOS / RIVET current implementation state

Updated 2026-08-09 after production topology verification, the Production Convex deployment, staging write verification, the disposable production onboarding through workspace provisioning, platform-operations controls, reporting hardening, and the end-to-end free-trial lifecycle pass. This is the living implementation and release-status handoff. The historical frontend-only pass is preserved separately in `FRONTEND_HANDOFF.md`.

## Product surface preserved

The existing RIVET routes remain intact, including the public landing and gym directory, customer signup/discovery/My Gyms, platform console (including the protected `/platform/applications` review queue, tenant subscription controls, plan catalog editor, billing export, and searchable support inbox), gym dashboard, reception, members/member 360, memberships, plans, CRM pipeline and queues, payments/receipts/shifts, automations, reports, audit, and settings. The public `/signup` route now submits a reviewed gym application; gym workspaces are provisioned by RIVET and `/login/gym` is sign-in only for teams that have been given access. `/members/import` remains the permission-gated CSV preview and resumable commit workflow.

The frontend still uses the established warm paper/ink visual system, Radix-based UI primitives, RTL logical properties, keyboard-friendly reception contract, `PageHeader`/`Gate` patterns, and TanStack Query hooks. No page makes a direct Convex or `fetch` call.

## Runtime modes

`apps/web/src/lib/api/client.ts` is the only client factory:

- `ConvexGymOSApi` is selected for production and all explicit `NEXT_PUBLIC_DATA_MODE=convex` runs.
- `MockGymOSApi` is selected only for non-production `NEXT_PUBLIC_DATA_MODE=mock` or the non-production default without a mode variable.
- Production always resolves to Convex, even if `NEXT_PUBLIC_DATA_MODE=mock` is accidentally present. Missing Convex configuration produces a configuration/auth failure; it never opens a seeded tenant.
- `resetDemo`, `setBehavior`, and persona switching are unavailable in Convex mode.

The page-facing seam is `apps/web/src/lib/api/GymOSApi.ts`. Query/mutation pages continue to use `useApiQuery`, `useApiMutation`, and `useInvalidate`; the adapter owns Convex operation names, public-ID mapping, pagination, and error conversion into `ApiError`.

Operational queries and the authenticated member experience use a four-second background refresh while in Convex mode. Refreshes preserve the already-rendered screen instead of replaying loading gates, so cross-browser trial/status changes appear without manual reloads or layout flicker. This polling boundary preserves the typed `GymOSApi` seam; moving selected screens to native Convex subscriptions remains an optimization rather than a correctness requirement.

## Authentication and tenancy

Clerk remains the credential/session provider. `ConvexClientProvider` supplies the authenticated Convex React client and claims/creates the current Convex user through `users.ensureCurrent`. `identity.current` resolves platform-admin status and all active organization memberships. The gym workspace obtains its session from the server, with organization selection available only when multiple active memberships exist.

Convex is authoritative for organization, branch, staff role, permission, and audit state. Every operational query/mutation calls the shared security helpers in `apps/web/convex/security.ts` to resolve the authenticated Clerk subject, active organization membership, role permissions, and branch scope. Cross-tenant records use non-disclosure `NOT_FOUND` behavior; deactivated users and inactive memberships lose access.

Staff invitations are sent by the server-only Convex action in `apps/web/convex/invitations.ts`. `CLERK_SECRET_KEY` is never imported into browser code. Invitation requested/sent/failed events are audited. Tenant users cannot grant a role's permissions or branch scope beyond their own authority.

The seeded Forge Fitness reference scenario is created by the internal, idempotent `seed:seedDemoTenant` mutation. It includes the organization, two branches, roles, plans, members, memberships, charges, payment/receipt, check-in, CRM, automation, public directory, customer, platform, and settings records. It is not callable from product pages.

## Persisted domains

Convex schema and domain functions now cover:

- Organizations, branches, users, memberships, role definitions, settings, payment methods, tenant audit events, platform audit events, idempotency records, sequence counters, and public `gymApplications` records. The platform review queue records approval/rejection decisions in the immutable `platformAuditEvents` stream. A pending application does not create a tenant; protected RIVET provisioning creates the first branch, role definitions, owner access, subscription, and public directory record after approval.
- Plans, members, member imports, memberships/renewals/freezes/extensions/cancellations, charges, payments, receipts, shifts, check-ins, tasks, leads, offers, timelines, and approvals.
- Automation rules/templates/executions/attempts/message deliveries, scheduled evaluation, quiet-hour suppression, retry metadata, and daily deduplication.
- Public gym directory/catalog, customer profiles, customer memberships, trial bookings routed to gym-scoped leads, platform invoices/support cases, and server-signed short-lived entry passes. Linked trials now move through requested, confirmed, completed, no-show, cancelled, and converted states from the CRM lead. Completed/no-show outcomes create deduplicated follow-up work, customer-facing booking status updates from the same record, and every staff outcome appends a timeline plus audit event.
- Platform subscription state and SaaS plan limits can be updated through platform-admin mutations. Updates synchronize the public directory/tenant record when available and append immutable platform audit events. Owner/manager reports compose persisted dashboard and transaction contracts and support CSV export; automation rules can be created from the existing UI with deduplicated task/message actions.
- Provisioned gyms publish a member-facing directory listing by default; platform administrators can hide or republish a listing from the gym controls. Existing production applications still require the normal approve → provision workflow before a real gym appears in discovery.

The normalized Convex `domainRecords` table stores JSON-shaped domain facts with direct organization/branch/member/lead indexes. Public UUIDs are stable at the `GymOSApi` boundary; Convex document IDs remain internal. This is an intentional adapter boundary, not permission for pages to consume untyped records.

## Domain guarantees

- Money is integer minor units with an ISO currency; JOD is formatted and validated at three decimal places.
- Timestamps are UTC. Business dates, same-day void rules, and dashboard/reconciliation windows use the tenant timezone.
- Membership status is derived server-side with precedence: cancelled → frozen → scheduled → expired → depleted → expiring ≤14 days → active.
- Check-in order is server-side: duplicate → inactive member → no membership → invalid term → frozen → depleted → wrong branch → warnings → allowed.
- Sales create immutable historical terms and linked charges; renewals create a new linked term.
- Payment creation is organization/idempotency-key scoped and rejects key reuse with a different request hash. Receipt numbers advance from an organization counter and are never reused.
- Refunds and same-business-day voids are distinct additive facts. Sensitive actions require server-side permission and reasons and write append-only audit events with actor, branch, before/after, reason, and correlation ID.
- MVP approval semantics are explicitly post-action: refunds above JOD 25.000, over-limit discounts, and shift variances complete as immutable facts first; approval or rejection is a separate append-only review record and never rewrites settled financial history.
- Entry passes are HMAC-signed, branch-bound, short-lived, stored in Convex, and consumed on a successful check-in. The Convex customer experience never exposes the old demo QR identity.
- Member imports require `members.write`, validate required columns, identify duplicate rows, persist a preview, commit in chunks of at most 100 rows, use per-chunk idempotency keys, and record audit facts. Invalid/duplicate rows are reviewable and skipped rather than silently created.
- Trial lifecycle transitions require `crm.write` and branch access. Cancellation/no-show outcomes require a reason; cancellation closes the lead, no-show creates a high-priority recovery task, completion schedules post-trial follow-up, terminal states cannot be reopened, and lead conversion marks the customer booking converted.

## Verification status

The current local verification is green for all credential-free product checks:

- `pnpm typecheck` — pass.
- `pnpm convex:typecheck` — pass.
- `pnpm lint` — pass with zero warnings.
- `pnpm test` — 246 tests passed across 23 files, covering Convex security, adapter, schema, platform application review/provisioning, platform control mutation boundaries, audit, trial lifecycle/accountability, duplicate conversion, reconciliation, refund bounds, approval permissions, automation scheduling, marketing-consent defaults, lead assignment, dashboard scope copy, mock-mode, component, reception, customer ownership, and member-portal regression coverage.
- `pnpm test:e2e` — 19 preview journeys passed and 2 trusted Convex journeys were intentionally skipped without their explicit credential switches. The current head adds browser coverage for branch-aware dashboard scope and CRM lead capture.
- `pnpm build` — passed on Next.js 16.2.12; 38 App Router routes were compiled and generated, with protected operational routes remaining dynamic. The first sandboxed attempt could not reach Google Fonts; the network-enabled rerun passed.
- `pnpm convex:codegen` — passed against the linked development deployment; regenerated bindings are committed.
- `convex run seed:seedDemoTenant` — passed against the linked development deployment and returned 2 branches, 4 staff, and 2 customers.
- `convex run health:check` — returned `status: ok` from the linked development deployment.
- GitHub Actions — static/typecheck/lint/unit/build and Playwright jobs passed on the prior branch head. Convex codegen remains repository-secret-gated, and a manually dispatched authenticated Clerk smoke now fails clearly when any required secret is missing instead of reporting a misleading success.

The isolated staging Clerk-to-Convex read smoke and opt-in operational write flow passed on current `main` in manual GitHub Actions run `31325711295`; the operational flow created and archived its disposable member. Push CI run `31325701531` also passed. Playwright preview mode remains deterministic and uses `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`; both trusted paths set it to `0`, use `NEXT_PUBLIC_DATA_MODE=convex`, and require the storage-state file.

Vercel Production was rebuilt from commit `2c42130` with `pnpm build`. Its live bundle contains the Production Convex URL, a `pk_live_` Clerk key resolving to `clerk.rivetjo.com`, and `https://www.rivetjo.com` as the canonical origin. The Production Convex deployment `descriptive-meerkat-589` has the seven expected variable names, was deployed from current `main`, and returned `status: ok` after deployment.

The disposable Production application `Hashem Test` completed submission, applicant confirmation, platform review, approval notification, tenant/first-branch creation, subscription assignment, Clerk organization creation, owner-invitation delivery, new-user account creation, profile completion, and authenticated owner-workspace entry. The remaining pilot gate is to complete first-owner setup, exercise the commercial and reception loop, verify timeline/audit/reconciliation results, and archive/hide the disposable tenant. Production verification also exposed three follow-ups: the first-time invitation redirects to a password-only form instead of an owner account-creation flow, review notes have no independent save action, and transactional/Clerk email branding, sender identity, and Gmail placement need deliberate work. These are recorded in `docs/13_PRODUCT_AND_OPERATIONS_TODO.md`.

## Local and deployment commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm test
pnpm test:e2e
PLAYWRIGHT_CONVEX_SMOKE=1 PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW=1 PLAYWRIGHT_CLERK_STORAGE_STATE=/absolute/path/clerk-storage-state.json pnpm --filter web exec playwright test e2e/convex-operational-flow.spec.ts
pnpm build
pnpm convex:codegen
pnpm convex:deploy
pnpm --filter web exec convex run seed:seedDemoTenant
```

Use `NEXT_PUBLIC_DATA_MODE=mock pnpm dev` for visual review. Use `pnpm dev:full` for a linked Convex development deployment. Before deployment, set `CLERK_FRONTEND_API_URL`, `ENTRY_PASS_SIGNING_SECRET`, `CLERK_SECRET_KEY`, and `RIVET_SITE_URL` in the Convex deployment through the CLI/dashboard. Configure the public Clerk key, server Clerk key, Convex URL, site URL, and other names from `apps/web/.env.example` in Vercel.

Vercel should use `apps/web` as the root directory and the Next.js server runtime. Schema/function rollback and application rollback are separate: use the Convex deployment backup/export workflow before data migrations and Vercel's deployment rollback workflow for application code. Do not rerun the seed over pilot data as a restore operation.

## External deferrals

The Production Clerk instance, custom-domain DNS, Vercel environment split, Production Convex environment/deployment, Resend application mail, first platform administrator, and first invited-owner identity/workspace handoff have been verified. The remaining pilot gate is the disposable production operating loop described above; the invited-owner account-creation UX must be fixed before onboarding a real gym. Google sign-in is intentionally deferred and is not required for email/password accounts. This repository deploys to Vercel only from `main`, so verify the production deployment after each configuration change. Email-template polish/deliverability, live WhatsApp/SMS delivery, and external SaaS billing remain provider-bound follow-ups. No unapproved marketplace, mobile, inventory, accounting, biometric, or billing surface was added.

## Files another agent should read first

1. `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`
2. `apps/web/src/lib/api/GymOSApi.ts`
3. `apps/web/src/lib/api/ConvexGymOSApi.ts`
4. `apps/web/convex/security.ts`
5. `apps/web/convex/domain.ts`
6. `apps/web/convex/schema.ts`
7. `apps/web/convex/seed.ts`
8. `apps/web/convex/invitations.ts`
9. `apps/web/convex/platformProvisioning.ts`
10. `apps/web/convex/platformProvisioningAction.ts`
11. `apps/web/src/lib/providers/app-providers.tsx`
12. `apps/web/.env.example`
13. `apps/web/e2e/convex-operational-flow.spec.ts`
