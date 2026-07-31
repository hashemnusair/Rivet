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
pnpm dev            # http://localhost:3000 — sign in with any password
```

Quality gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`.

Deployment: the app builds to fully static output, so any static host works.
For Cloudflare Pages connected to GitHub:

| Setting | Value |
|---|---|
| Build command | `pnpm install && pnpm --filter web build` |
| Build output directory | `apps/web/out` |

See `FRONTEND_HANDOFF.md` → *Hosting on Cloudflare Pages* for the details.
