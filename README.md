# GymOS / RIVET

RIVET is a Jordan/MENA-first revenue and operations system for gyms. The operating loop is lead → membership → payment → check-in → renewal, with branch-aware access, reconciliation, automations, and an auditable member timeline.

The approved runtime is Next.js + Convex + Clerk + Vercel. `GymOSApi` remains the only page-facing data boundary. `MockGymOSApi` is retained for explicit preview and test mode; production builds always select the Convex adapter and fail closed when Convex or identity configuration is unavailable.

## Read order

1. `AGENTS.md`
2. `FRONTEND_HANDOFF.md`
3. `docs/00_PRODUCT_BRIEF.md`
4. `docs/01_SCOPE_AND_ROADMAP.md`
5. `docs/05_DOMAIN_MODEL.md`
6. `docs/06_API_AND_MOCK_CONTRACT.md`
7. `docs/07_SECURITY_AND_TENANCY.md`
8. `docs/08_ACCEPTANCE_CRITERIA.md`
9. `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`
10. `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`

## Repository layout

```text
/
├── apps/web/                  # Next.js App Router, Clerk, Convex functions
│   ├── convex/                # schema, server functions, seed, scheduled work
│   ├── src/lib/api/           # GymOSApi, ConvexGymOSApi, mock adapter
│   └── e2e/                   # mock journeys and trusted Convex smoke
├── docs/
├── .github/workflows/ci.yml
└── pnpm-lock.yaml
```

## Local development

Install with the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

For deterministic visual review and the existing Playwright suite:

```bash
NEXT_PUBLIC_DATA_MODE=mock pnpm dev
```

For a linked Convex development deployment, put the value-free variables from `apps/web/.env.example` in `apps/web/.env.local`, then run:

```bash
pnpm convex:dev
```

The combined command starts Convex and Next.js together:

```bash
pnpm dev:full
```

Mock mode is explicit. It is intended for preview/tests only and is ignored by production builds.

## Quality commands

```bash
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

`pnpm test:e2e` runs seeded preview journeys. The trusted Clerk-to-Convex smoke is opt-in and requires `PLAYWRIGHT_CONVEX_SMOKE=1` plus a storage-state file outside Git.

The trusted smoke is the production-shaped check: Playwright reuses a signed-in Clerk development/preview session, starts Next.js with `NEXT_PUBLIC_DATA_MODE=convex` and demo auth disabled, opens `/dashboard`, and verifies that the authenticated tenant workspace is read from Convex. It is intentionally not part of the normal mock suite. For GitHub Actions, add `CONVEX_DEPLOY_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and a `PLAYWRIGHT_CLERK_STORAGE_STATE` JSON session for a dedicated non-production Clerk account, then manually run the `GymOS CI` workflow. Locally, point `PLAYWRIGHT_CLERK_STORAGE_STATE` at that JSON file and run:

```bash
PLAYWRIGHT_CONVEX_SMOKE=1 PLAYWRIGHT_CLERK_STORAGE_STATE=/absolute/path/clerk-storage-state.json pnpm --filter web exec playwright test e2e/convex-smoke.spec.ts
```

The session file is a Playwright browser state artifact, not a credential to commit or paste into chat. The isolated Development Clerk + Convex staging smoke passed locally on 8 August 2026, and the four CI secrets are now configured; the GitHub workflow remains a manual release-gate check.

## Convex deployment, seed, and rollback

Regenerate the Convex client types and verify the server TypeScript before deploying:

```bash
pnpm convex:codegen
pnpm convex:typecheck
```

Deploy the schema and functions to the selected Convex deployment:

```bash
pnpm convex:deploy
```

Set Convex-side environment values through the Convex CLI or dashboard. Keep the actual values outside Git:

```bash
pnpm --filter web exec convex env set CLERK_FRONTEND_API_URL "$CLERK_FRONTEND_API_URL"
pnpm --filter web exec convex env set ENTRY_PASS_SIGNING_SECRET "$ENTRY_PASS_SIGNING_SECRET"
pnpm --filter web exec convex env set CLERK_SECRET_KEY "$CLERK_SECRET_KEY"
pnpm --filter web exec convex env set RESEND_API_KEY "$RESEND_API_KEY"
pnpm --filter web exec convex env set RESEND_FROM_EMAIL "noreply@rivetjo.com"
pnpm --filter web exec convex env set RIVET_APPLICATION_RECIPIENTS "you@example.com,partner@example.com"
```

### Gym applications and access

Gym owners do not create their own RIVET workspace. `/signup` is a public application form that records the gym name, owner name, email, contact number, and selected plan in the Convex `gymApplications` table. The submission sends a confirmation from `noreply@rivetjo.com` to the applicant and a notification to the comma-separated `RIVET_APPLICATION_RECIPIENTS` list through Resend. Platform administrators review applications at `/platform/applications`; approval/rejection decisions are audited and send a separate status email. After approval, RIVET provisions the gym and issues access; `/login/gym` is sign-in only for invited gym teams. Verify `rivetjo.com` in Resend and keep `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RIVET_APPLICATION_RECIPIENTS` in the Convex deployment environment.

Run the deterministic reference tenant seed after deploying a new development/preview deployment:

```bash
pnpm --filter web exec convex run seed:seedDemoTenant
```

The seed is an internal, idempotent mutation. It creates the Forge Fitness reference organization, branches, staff, roles, plans, members, memberships, charges, payment, receipt, check-in, CRM, public directory, customer, platform, and automation records. It is not reachable from browser code.

Before a schema or data migration, use the Convex deployment's dashboard backup/export facility and record the deployment name and commit SHA. Restore through the provider's documented dashboard workflow; rerun the idempotent seed only for a clean reference deployment, never over a pilot without an explicit data review. Vercel application rollback is performed from the Vercel deployment dashboard or with the linked Vercel CLI; application rollback does not roll back Convex data, so coordinate both actions.

## Vercel and Clerk configuration

Set the names in `apps/web/.env.example` in the Vercel project and the Convex deployment as appropriate. The application variables are:

| Name | Scope |
| --- | --- |
| `CONVEX_DEPLOYMENT` | local/CLI deployment selection |
| `CONVEX_DEPLOY_KEY` | local/CI Convex CLI secret |
| `NEXT_PUBLIC_CONVEX_URL` | browser Convex URL |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | browser/auth site URL contract |
| `NEXT_PUBLIC_DATA_MODE` | local/test selector; production is forced to Convex |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | browser Clerk key |
| `CLERK_SECRET_KEY` | server-only Clerk key for invitations |
| `CLERK_FRONTEND_API_URL` | Clerk JWT issuer configured in Convex |
| `ENTRY_PASS_SIGNING_SECRET` | Convex-only HMAC secret |
| `RESEND_API_KEY` | Convex-only email delivery secret for gym applications |
| `RESEND_FROM_EMAIL` | Verified sender, normally `noreply@rivetjo.com` |
| `RIVET_APPLICATION_RECIPIENTS` | Comma-separated RIVET partner notification recipients |
| `NEXT_PUBLIC_SITE_URL` | canonical Next.js origin |
| `PLAYWRIGHT_CONVEX_SMOKE` | trusted smoke switch |
| `PLAYWRIGHT_CLERK_STORAGE_STATE` | local path to trusted Playwright state |

Vercel's root directory is `apps/web`. The target is a Next.js server deployment; static export is not supported because Clerk's request proxy needs a server runtime. Do not set `NEXT_PUBLIC_RIVET_DEMO_AUTH` on any deployment. The demo bypass is refused in production builds. The Vercel production build also fails before Next.js starts when `NEXT_PUBLIC_CONVEX_URL` or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is missing, preventing a public bundle from silently shipping without its identity/data clients.

The repository pins Vercel's application build command to `pnpm build`. Convex schema/function deployment is intentionally separate: run `pnpm convex:deploy` from a trusted operator environment with `CONVEX_DEPLOY_KEY`, then deploy the Next.js application. Do not make Vercel Preview builds depend on a production Convex deploy key.

`www.rivetjo.com` is the live public origin and `rivetjo.com` redirects to it. The production Clerk instance, DNS records, and first production test user are now configured. The isolated staging Clerk-to-Convex smoke passes, but the deployment remains on release hold until the Vercel Production and Convex environment values are verified against the production Clerk instance and a production-shaped pilot check is completed. Follow the ordered domain-specific checklist in `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` before inviting a real gym.

The production Clerk instance and custom-domain DNS setup have been completed. Google sign-in is optional and currently deferred; email/password is the supported production path. Accounts do not transfer between Clerk instances, so any development users must be recreated in production. Preview deployments may continue using the development Clerk/Convex pair; never reuse a production Convex deploy key in Preview.

## Security and data rules

Convex resolves the authenticated Clerk subject, active organization membership, role permissions, and branch scope on every public operation. Cross-tenant lookups return stable non-disclosure errors. Sensitive actions require server-side permissions and reasons and append immutable audit events. Public IDs remain UUIDs at the `GymOSApi` boundary even though Convex document IDs are used internally.

Money is stored as integer minor units plus currency; JOD uses three decimal places. Timestamps are UTC, business-day decisions use the tenant timezone, membership status and check-in precedence are server-side invariants, payments are idempotent, receipts are organization-sequenced, and void/refund facts are additive and distinct.

MVP approval semantics are post-action review: large refunds, over-limit discounts, and shift variances are completed and audited before review. A rejection records accountability and does not rewrite settled financial history. Pre-authorization remains a pilot-policy decision.

Outbound automation delivery is sandbox/log based until an approved provider is selected. The trainer marketplace, native mobile apps, inventory/POS, double-entry accounting, biometric storage, and unapproved external billing or messaging integrations are not part of this MVP.

## CI

`.github/workflows/ci.yml` has visible jobs for frozen install, web and Convex typecheck, lint, unit/component tests, production build, Playwright preview journeys, Convex code generation, and a manually dispatched trusted Clerk-to-Convex smoke. Codegen reports an explicit notice when its deploy key is unavailable. The manually dispatched smoke fails with the exact missing secret instead of silently skipping. Secrets remain unavailable to forked pull requests.

After CI is enabled in GitHub, protect `main` with pull requests, up-to-date branches, and the static/browser checks as required statuses. This repository deploys to Vercel from `main`; verify the production deployment after merge. Application deployment remains separate from Convex data migrations.

## Product boundaries

The B2B gym workspace is the operating core: members, memberships, CRM, reception, payments, shifts, automations, dashboards, and audit. The approved consumer layer includes public gym discovery, free-trial requests, My Gyms, and server-valid entry passes. The RIVET platform console includes the tenant directory, persistent subscription/billing records, and support workflow. An independent trainer marketplace remains out of scope.
