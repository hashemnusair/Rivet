# GymOS — Agent Implementation Pack

Working title: **GymOS**. Rename it later without changing the product scope.

This repository is intended to be implemented in two deliberate passes:

1. **Frontend Agent** — builds a complete, locally previewable product UI using typed mock data.
2. **Backend / Integration Agent** — preserves the approved UI, implements the API, database, authentication, jobs, audit controls, and replaces mocks with real data.

## Read order

### Both agents
1. `AGENTS.md`
2. `docs/00_PRODUCT_BRIEF.md`
3. `docs/01_SCOPE_AND_ROADMAP.md`
4. `docs/05_DOMAIN_MODEL.md`
5. `docs/06_API_AND_MOCK_CONTRACT.md`
6. `docs/07_SECURITY_AND_TENANCY.md`
7. `docs/08_ACCEPTANCE_CRITERIA.md`

### Frontend agent only
8. `docs/02_FRONTEND_AGENT_TASK.md`
9. `docs/03_FRONTEND_HANDOFF_TEMPLATE.md`

### Backend / integration agent only
8. Read the completed `FRONTEND_HANDOFF.md` created by the frontend agent.
9. `docs/04_BACKEND_INTEGRATION_AGENT_TASK.md`

## Product in one sentence

A Jordan/MENA-first revenue and operations system for gyms that manages the full lifecycle from lead to membership, check-in, payment, renewal, and reactivation.

## Intended repository structure

```text
/
├── AGENTS.md
├── README.md
├── FRONTEND_HANDOFF.md          # created by frontend agent
├── apps/
│   ├── web/                     # Next.js frontend
│   └── api/                     # FastAPI backend, created in pass two
├── packages/
│   └── contracts/               # shared schemas/types or generated client
├── docs/
└── infra/                       # optional local/deployment configuration
```

## MVP boundary

The B2B gym-management application remains the operating core. On 2026-07-31 the product owner explicitly added a focused consumer layer (subscribed-gym discovery, free trials, My Gyms, and entry QR) plus a RIVET platform-owner console. The independent trainer marketplace remains out of scope. See `FRONTEND_HANDOFF.md` for the decision and mock/backend boundary.

## Definition of success

A gym owner, manager, salesperson, and receptionist can each use a role-appropriate interface to operate one or more branches. The system must make renewals, follow-ups, check-ins, payments, and sensitive staff actions visible and auditable.

## Running the frontend

```bash
pnpm install
pnpm dev:full       # Convex sync + http://localhost:3000
```

Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

## Deployment

This is no longer a static export. Clerk authenticates through `src/proxy.ts`, which needs a Next.js server runtime — a static host (including the Cloudflare Pages setup this repo used previously) cannot serve it.

**Vercel** is the configured target; `apps/web/vercel.json` pins the framework and the `dub1` region, which is the same `eu-west-1` the Convex deployment runs in, so server code sits next to its database.

1. Import the repository, then set **Root Directory** to `apps/web`. Vercel picks up the pnpm workspace at the repo root on its own.
2. Add these environment variables (values come from the Clerk and Convex dashboards — see `apps/web/.env.example`):

   | Variable | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API keys |
   | `CLERK_SECRET_KEY` | Clerk → API keys |
   | `CLERK_FRONTEND_API_URL` | Clerk → Integrations → Convex |
   | `NEXT_PUBLIC_CONVEX_URL` | Convex → deployment URL |
   | `NEXT_PUBLIC_CONVEX_SITE_URL` | Convex → deployment URL |
   | `NEXT_PUBLIC_SITE_URL` | the deployed origin, e.g. `https://rivet.jo` |

3. Push the Convex functions and schema to the production deployment with `pnpm convex:deploy`, and set `CLERK_FRONTEND_API_URL` on the Convex side too — `convex/auth.config.ts` reads it to verify Clerk JWTs.
4. Use a Clerk **production** instance for the live domain. Development instances serve cookies from `clerk.accounts.dev`, which forces a cross-domain handshake on first load; that is harmless locally but not what you want in production.

**Never set `NEXT_PUBLIC_RIVET_DEMO_AUTH` on a deployment.** It disables every identity check — the middleware, the gym workspace guard, the member gate and the platform console. It exists so Playwright can drive seeded personas without creating Clerk users, and `src/lib/auth/demo-auth.ts` refuses it in production builds so a stray variable cannot publish the app unauthenticated.

<!-- Deployment trigger marker: 2026-08-04 -->
