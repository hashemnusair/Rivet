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
```

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
| `NEXT_PUBLIC_SITE_URL` | canonical Next.js origin |
| `PLAYWRIGHT_CONVEX_SMOKE` | trusted smoke switch |
| `PLAYWRIGHT_CLERK_STORAGE_STATE` | local path to trusted Playwright state |

Vercel's root directory is `apps/web`. The target is a Next.js server deployment; static export is not supported because Clerk's request proxy needs a server runtime. Do not set `NEXT_PUBLIC_RIVET_DEMO_AUTH` on any deployment. The demo bypass is refused in production builds.

The production Clerk instance and custom-domain DNS setup remain an external release step. Until the product owner completes that setup, use the existing development instance only for trusted development/preview verification. Accounts do not transfer between Clerk instances.

## Security and data rules

Convex resolves the authenticated Clerk subject, active organization membership, role permissions, and branch scope on every public operation. Cross-tenant lookups return stable non-disclosure errors. Sensitive actions require server-side permissions and reasons and append immutable audit events. Public IDs remain UUIDs at the `GymOSApi` boundary even though Convex document IDs are used internally.

Money is stored as integer minor units plus currency; JOD uses three decimal places. Timestamps are UTC, business-day decisions use the tenant timezone, membership status and check-in precedence are server-side invariants, payments are idempotent, receipts are organization-sequenced, and void/refund facts are additive and distinct.

Outbound automation delivery is sandbox/log based until an approved provider is selected. The trainer marketplace, native mobile apps, inventory/POS, double-entry accounting, biometric storage, and unapproved external billing or messaging integrations are not part of this MVP.

## CI

`.github/workflows/ci.yml` has visible jobs for frozen install, web and Convex typecheck, lint, unit/component tests, production build, Playwright preview journeys, Convex code generation, and a manually dispatched trusted Clerk-to-Convex smoke. The codegen and authenticated smoke jobs stay credential-gated so forked pull requests never receive secrets.

After CI is enabled in GitHub, protect `main` with pull requests, up-to-date branches, and the static/browser checks as required statuses. Vercel preview and production deployments remain separate from application data migrations.

## Product boundaries

The B2B gym workspace is the operating core: members, memberships, CRM, reception, payments, shifts, automations, dashboards, and audit. The approved consumer layer includes public gym discovery, free-trial requests, My Gyms, and server-valid entry passes. The RIVET platform console includes the tenant directory, persistent subscription/billing records, and support workflow. An independent trainer marketplace remains out of scope.
