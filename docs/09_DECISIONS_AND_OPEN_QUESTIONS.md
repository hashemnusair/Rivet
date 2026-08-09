# 09 — Decisions and Open Questions

## Decisions already made

- Working title is GymOS.
- B2B gym operations are the product core.
- Frontend is implemented and reviewed separately before backend integration.
- Frontend must run entirely in mock mode.
- The backend later connects through a typed client boundary.
- Initial region is Jordan/MENA.
- Arabic/RTL readiness is required.
- Multi-tenant and multi-branch are foundational.
- The MVP prioritizes members, memberships, CRM, reception, payments, reconciliation, automations, dashboards, and audit.
- Public consumer and trainer marketplaces are future phases.
- Raw biometric storage is out of scope.
- New members default to **Marketing: Opted in** across manual creation, lead conversion, and imports. An explicit opt-out must be preserved. The system-applied default is a product preference, not a claim that the member actively gave consent; preference provenance and withdrawal history remain tracked in the canonical backlog.

## Approved architecture override — 2026-07-31

The product owner selected **Next.js + Convex + Clerk + Vercel** for the active implementation. This is the approved alternative allowed by `AGENTS.md` and supersedes the earlier FastAPI/PostgreSQL/Redis default in `docs/04` for new backend work.

- Convex owns persistence, server functions, realtime queries, file storage where needed, and scheduled/durable application work.
- Clerk owns authentication and organization identity; Convex remains authoritative for tenant data, branch scope, operational roles, permissions, and audit events.
- Vercel provides the Next.js server runtime required by Clerk's request proxy.
- The documented domain invariants, API boundary, multi-tenant isolation, money representation, audit requirements, and acceptance tests remain binding even where the implementation mechanism changes.
- The existing mock adapter remains available only as a preview/testing mode while each workflow is migrated vertically to Convex.
- Gym owners do not self-provision workspaces. The public `/signup` route submits a reviewed application with the gym name, owner name, email, contact number, and selected plan. RIVET creates the organization and issues gym access only after approval; `/login/gym` is sign-in only for invited teams.

## Domain topology — 2026-08-04

The product owner selected one Vercel project with hostname-specific entry points for the first release:

- `rivetjo.com` redirects to `www.rivetjo.com`.
- `www.rivetjo.com` is the public landing and marketing surface.
- `app.rivetjo.com` is the member portal and future PWA surface.
- `dashboard.rivetjo.com` is the gym workspace for owners, managers, reception, and sales.
- `platform.rivetjo.com` is the canonical RIVET platform-owner console.
- `admin.rivetjo.com` is a compatibility alias that redirects to `platform.rivetjo.com`.

All of these domains currently attach to the `rivet-web` Vercel project. The Next.js request proxy maps each hostname's entry points to the existing `/customer`, gym workspace, and `/platform` route trees. Hostnames are navigation and canonical-URL boundaries only; Clerk and Convex authorization remain the security boundary.

## Release hold — production Convex and Clerk configuration (2026-08-06)

`rivetjo.com` is now attached to the live `rivet-web` Vercel project. The apex redirects to `www.rivetjo.com`, and both responses are healthy. DNS records for the Clerk production instance have been added, and a first production Clerk user has been created. The remaining release hold is verification, not another frontend redesign:

- Confirm that the latest production build actually contains the configured `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_DATA_MODE=convex`; a variable can exist in Vercel without being present in an already-built deployment.
- Confirm that Convex production trusts the same Clerk production issuer configured in Vercel (`CLERK_FRONTEND_API_URL`). A signed-in browser must resolve its Convex identity and role rather than falling back to preview/seeded accounts.
- Google sign-in is intentionally deferred. Email/password is the supported pilot path; Google can stay disabled until a project-owned OAuth client is worth the maintenance cost.

### Ordered `rivetjo.com` release checklist

Complete these steps in order. Keep development/preview and production Convex deployments separate; never copy a production deploy key into Preview.

1. **Verify the production Convex deployment.** Confirm the production deployment URL and deploy key, run `pnpm convex:deploy` from the repository when the schema/functions change, and set these Convex-side variables:

   ```text
   CLERK_FRONTEND_API_URL=<production Clerk issuer URL>
   CLERK_SECRET_KEY=<production Clerk secret>
   ENTRY_PASS_SIGNING_SECRET=<random Convex-only secret>
   RIVET_SITE_URL=https://www.rivetjo.com
   ```

   `CLERK_FRONTEND_API_URL` must be set in Convex because `convex/auth.config.ts` reads it there. Setting it only in Vercel leaves every Convex query unauthenticated. Convex environment variables are deployment-specific and `convex env set` defaults to Development, so use `--prod` on every production command (or select the production deployment in the dashboard). Verify the target with `pnpm --filter web exec convex env list --prod --names-only` without printing secret values.
2. **Verify Vercel Production variables and redeploy.** Set the following in the `rivet-web` project with `apps/web` as the root directory, then trigger a fresh production deployment from `main`:

   ```text
   NEXT_PUBLIC_DATA_MODE=convex
   NEXT_PUBLIC_CONVEX_URL=<production Convex URL>
   NEXT_PUBLIC_CONVEX_SITE_URL=<production Convex site URL>
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_…
   CLERK_SECRET_KEY=sk_live_…
   CLERK_FRONTEND_API_URL=<production Clerk issuer URL>
   NEXT_PUBLIC_SITE_URL=https://www.rivetjo.com
   CONVEX_DEPLOY_KEY=<production Convex deploy key for the trusted Convex deploy command; not a browser variable>
   ```

   The production build now stops with a clear error when the public Convex URL or Clerk publishable key is absent. The repository pins Vercel's application build to `pnpm build`; run `pnpm convex:deploy` separately from a trusted environment with `CONVEX_DEPLOY_KEY` so a Preview build cannot accidentally deploy or mutate Convex.
3. **Keep Google deferred unless the pilot requires it.** Email/password is enough to validate the first gym workflow. If Google is enabled later, create a project-owned OAuth client and add the production callback/origin values shown by Clerk.
4. **Verify the production Clerk issuer in both runtimes.** The Vercel publishable/secret keys must be `pk_live_…`/`sk_live_…`, and the production `CLERK_FRONTEND_API_URL` must be set in both Vercel and Convex. Clerk's development users do not transfer between instances.
5. **Verify the public gym application.** Submit a test application from `/signup` and confirm that `gymApplications` contains the gym name, owner name, email, contact number, selected plan, and `pending` status. Configure Resend in Convex with `RESEND_API_KEY`, a verified `RESEND_FROM_EMAIL` (normally `noreply@rivetjo.com`), and `RIVET_APPLICATION_RECIPIENTS`; confirm both the applicant confirmation and the partner notification arrive. Do not provision a workspace from the public form.
6. **Review applications in the platform console.** Open `/platform/applications`, move a submission to review, approve or reject it with a reason where required, and confirm the decision email plus immutable platform audit event.
7. **Provision an approved gym from the platform console.** The protected **Provision gym workspace** action creates the Convex tenant, first branch, subscription assignment, default roles/settings, Clerk organization, and owner invitation. RIVET keeps its own internal organization slug; Clerk organization slugs are optional and do not need to be enabled. Confirm the application changes to `completed`, the workspace is visible to the owner, and the invitation link reaches `/login`. Retry only from the application detail if an external Clerk request fails; the action is idempotent and records the failure.
8. **Run the trusted smoke.** The isolated Development Clerk session and the five GitHub Actions secrets (`CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `PLAYWRIGHT_CLERK_STORAGE_STATE`) are configured; the focused smoke passes locally against `fleet-otter-621`, and manual `GymOS CI` run `31257271522` passed all jobs on `main`. Rerun it after rotating the staging identity or session state. This verifies Clerk-to-Convex tenant access rather than only checking that the landing page renders.

Until this checklist is complete, the site is a public marketing preview, not a real-gym pilot. Accounts created against the development Clerk instance must be recreated in production.

### Environment progress — 2026-08-08

- Convex production has a completed backup export from 8 August 2026. Production data remains intentionally unseeded; do not run `seed:seedDemoTenant` against production without an explicit pilot-data decision.
- Vercel Preview now uses `NEXT_PUBLIC_DATA_MODE=mock`; Production uses `NEXT_PUBLIC_DATA_MODE=convex`. The runtime now honors that explicit Preview mode even though Vercel builds run with `NODE_ENV=production`, while the Production build validator requires `convex`. `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` are Production-only; masked Clerk values remain Preview-scoped and must be reviewed or replaced with a dedicated staging pair before an authenticated Preview deployment is used.
- A fresh local Convex development deployment, `dev/hashem-nusair` (`fleet-otter-621`), is configured with the isolated Development Clerk issuer, a development-only entry-pass secret, the current schema/functions, and the idempotent reference seed. It is not production or a pilot tenant.
- GitHub Actions now has all five non-production smoke inputs: `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `PLAYWRIGHT_CLERK_STORAGE_STATE`. The focused smoke passed locally and manual CI run `31257271522` passed with the signed-in Development Clerk session.

## Implementation decisions agents may make

### Convex completion decisions — 2026-08-04

- `ConvexGymOSApi` is the sole production adapter. `MockGymOSApi` remains available only for explicit non-production preview/test mode; production forces Convex and fails closed when its URL or authenticated session is missing.
- Convex stores the operational model in a normalized `domainRecords` fact table plus explicit foundation, audit, idempotency, sequence, and entry-pass tables. The adapter maps those records into the existing typed `GymOSApi` contract and preserves UUID public IDs.
- Clerk subject resolution, organization membership, role permissions, branch scope, platform-admin checks, stable errors, and append-only audits are server concerns. Browser gates are usability only.
- Staff invitations use a server-only Convex action calling Clerk's invitation API. `CLERK_SECRET_KEY` is a Convex/Vercel server secret and is never sent to browser code. Invitation failures remain visible and audited.
- Approved gym applications use a separate protected Convex action for provisioning. It creates stable tenant/branch identifiers, a trial organization with the selected plan, default settings and role definitions, an owner membership, a Clerk organization, and an idempotent owner invitation. The public application route never creates access; the platform-admin console is the only entry point.
- Customer entry passes use a 15-minute HMAC-signed token, are stored/consumed in Convex, are branch-bound, and are not the prior demo QR value. `ENTRY_PASS_SIGNING_SECRET` is Convex-only.
- Member CSV imports use a server-persisted preview followed by resumable chunks of at most 100 rows. Each chunk has an idempotency key; invalid and duplicate rows are reviewable/skipped, and preview/commit events are audited.
- Free-trial bookings use one shared lifecycle record linked to the gym-scoped CRM lead. Staff can confirm, complete, record a no-show, or cancel from the lead. Cancellation closes the lead; no-show returns it to active contact and creates a high-priority recovery task; completion creates a next-day post-trial follow-up. No-show/cancellation require reasons, terminal outcomes cannot be silently reopened, conversion marks the member-facing booking converted, and every transition is audited. These are MVP defaults to validate with the pilot gym.
- Until the typed client boundary gains a subscription-aware adapter, operational queries and member experience data use a four-second background refresh in Convex mode. Background refresh never reopens the full-page loading gate. This is an explicit MVP consistency compromise: it gives cross-browser updates without coupling page components directly to Convex, while native subscriptions remain a later latency/efficiency optimization.
- Automation evaluation runs from a Convex scheduled function every 15 minutes. The default delivery mode is sandbox/log, quiet hours suppress delivery, and execution/attempt records carry daily deduplication keys and retry metadata.
- Platform billing collection and outbound messaging remain provider adapters. The MVP persists platform ledger/support records and exposes no fabricated external success.
- The final real-data release sequence is credential-gated: Clerk production/custom-domain setup and access to the selected Convex/Vercel deployments are external steps, documented in the README and `CURRENT_STATE.md` rather than simulated in code.

Agents may choose and document:

- Exact visual identity and navigation pattern.
- Authentication provider or local-auth implementation.
- Redis-backed worker library.
- ORM repository conventions.
- Test frameworks.
- Hosting providers.
- Shared-contract generation approach.
- Object storage provider.

Do not let these choices change the product model or acceptance criteria.

## Questions for real customer discovery

These should not block the initial build, but should be answered before a paid rollout:

1. Which access-control devices are common among target gyms?
2. Are memberships predominantly prepaid, installment-based, recurring-card, or manual-renewal?
3. Which local payment methods and receipt/tax requirements are mandatory?
4. How are freezes, discounts, and refunds currently approved?
5. What are common trainer commission models?
6. Do owners need Arabic, English, or both for staff interfaces and receipts?
7. What customer communication channels are actually used: WhatsApp, SMS, calls, email?
8. How should old member spreadsheets and fingerprint-system identifiers be imported?
9. Which reports are requested daily by gym owners?
10. What would make a gym refuse a shared consumer identity/app?

## Pilot decisions to capture later

- Pilot gym profile and branches.
- Existing plans and pricing rules.
- Required custom fields.
- Receipt numbering and tax configuration.
- Approval thresholds.
- Renewal cadence.
- Inactivity thresholds.
- Message templates and languages.
- Data-retention requirements.
- Hardware/integration requirements.

Record product decisions in this file or a dedicated ADR directory rather than burying them in code comments.

## Interim approval semantics for the MVP

Until pilot-specific thresholds are configured, the reference workflow treats a refund above JOD 25.000 as a completed, immutable financial transaction that requires post-action manager review. The review records approval or rejection for accountability; rejection never deletes or rewrites the refund. The actor must already hold `payments.refund` to issue or review it. Discounts above the actor's configured limit and cash-shift variances remain reviewable through their own permissions. Every review is an append-only record, and audit queries derive the displayed decision from that record rather than mutating the original event.

The JOD 25.000 refund-review threshold is an explicit MVP assumption, not a final policy. Replace it with a tenant setting after pilot discovery establishes the required thresholds and whether any gym needs pre-authorization instead of post-action review.

## Tenant operational-policy defaults — 2026-08-09

Entry and membership rules are now tenant settings enforced by Convex, not presentation-only preferences. Until a gym explicitly changes them, RIVET warns (but does not block) for outstanding balances, warns seven days before expiry, suppresses duplicate scans for two minutes, opens the renewal queue fourteen days before expiry, requires at least a one-day freeze, caps manual extensions at 365 days, and prevents overlapping membership terms. Operating-hour enforcement is off by default so an unconfigured branch cannot accidentally lock out every member.

When hours are enabled, each active branch receives a seven-day local-time schedule and outside-hours entry is blocked unless an authorized manager records an override. Membership branch transfers require the date-override permission and a reason, update both the membership and the member's home branch, and append timeline plus audit events. These defaults are pilot assumptions; each gym owner should confirm balance policy, hours, freeze minimum, renewal cadence, overlap handling, and extension authority during onboarding.
