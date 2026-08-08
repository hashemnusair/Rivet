# GymOS / RIVET handoff

Updated 2026-08-08 after production Clerk setup, staging write verification, platform-operations controls, and reporting hardening. The approved frontend remains the product surface; the production data seam now points at Convex through `GymOSApi`.

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
- Public gym directory/catalog, customer profiles, customer memberships, trial bookings routed to gym-scoped leads, platform invoices/support cases, and server-signed short-lived entry passes.
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

## Verification status

The current local verification is green for all credential-free product checks:

- `pnpm typecheck` — pass.
- `pnpm convex:typecheck` — pass.
- `pnpm lint` — pass with zero warnings.
- `pnpm test` — 223 tests passed across 22 files, covering Convex security, adapter, schema, platform application review/provisioning, platform control mutation boundaries, audit, refund bounds, approval permissions, automation scheduling, mock-mode, component, and reception coverage.
- `pnpm test:e2e` — 15 preview journeys passed and 2 trusted Convex journeys were intentionally skipped without their explicit credential switches.
- `pnpm build` — passed on Next.js 16.2.12; 38 App Router routes were compiled and generated, with protected operational routes remaining dynamic.
- `pnpm convex:codegen` — passed against the linked development deployment; regenerated bindings are committed.
- `convex run seed:seedDemoTenant` — passed against the linked development deployment and returned 2 branches, 4 staff, and 2 customers.
- `convex run health:check` — returned `status: ok` from the linked development deployment.
- GitHub Actions — static/typecheck/lint/unit/build and Playwright jobs passed on the prior branch head. Convex codegen remains repository-secret-gated, and a manually dispatched authenticated Clerk smoke now fails clearly when any required secret is missing instead of reporting a misleading success.

The isolated staging Clerk-to-Convex read smoke and the opt-in operational write flow now pass with the external Clerk session stored outside Git. The remaining release gate is production-specific: verify the Vercel Production values and production Convex deployment against the production Clerk issuer, then run a pilot check without touching the staging fixture. Playwright preview mode remains deterministic and uses `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`; both trusted paths set it to `0`, use `NEXT_PUBLIC_DATA_MODE=convex`, and require the storage-state file.

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

The production Clerk instance, custom-domain DNS records, and first production test user are now in place. The remaining release gate is to verify that Vercel Production and the selected Convex deployment both use the matching production Clerk issuer/keys and production Convex URL, then run the trusted Clerk-to-Convex smoke. Google sign-in is intentionally deferred and is not required for email/password accounts. This repository deploys to Vercel only from `main`, so verify the production deployment after each configuration change. Live WhatsApp/SMS/email delivery and external SaaS billing remain behind provider boundaries, as required by the MVP scope. No unapproved marketplace, mobile, inventory, accounting, biometric, or billing surface was added.

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
