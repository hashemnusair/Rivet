# AGENTS.md

## Mission

Implement GymOS according to the documentation in `/docs`. Optimize for an operationally credible MVP, not a demo full of disconnected screens.

## Handoff document lifecycle

- `FRONTEND_HANDOFF.md` is the frozen historical artifact from the completed frontend-only pass on 2026-07-30. Preserve it as the original frontend → backend contract.
- `CURRENT_STATE.md` is the living implementation and release-status handoff. Current implementation agents update this file instead of rewriting the historical frontend handoff.
- `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md` is the living topology, environment-ownership, and release-verification guide.

## Non-negotiable product principles

1. **Revenue and accountability first.** Every major workflow should help a gym sell, collect, retain, reconcile, or supervise.
2. **One member timeline.** Leads, calls, offers, memberships, check-ins, payments, freezes, messages, and staff actions must converge into a chronological record.
3. **Multi-tenant by design.** A tenant is a gym organization; a tenant can contain multiple branches.
4. **Role-aware UI and authorization.** Hiding a button is not authorization.
5. **Audit sensitive actions.** Price overrides, discounts, refunds, freezes, membership-date changes, voids, and permission changes require immutable audit events.
6. **Arabic-ready.** Layouts and components must support RTL even if the initial copy is English.
7. **Do not build future marketplaces in the MVP.** Preserve extension points only.
8. **No silent scope invention.** Record assumptions in the relevant handoff or decision log.

## Implementation passes

### Pass 1 — Frontend agent

- Work only on the frontend and shared mock contracts.
- Build a polished local preview with realistic seeded data.
- Do not create a fake backend server merely to simulate completeness.
- Keep all data access behind the documented client interface.
- Produce `FRONTEND_HANDOFF.md` before stopping.
- After the original frontend pass, preserve that artifact and record current implementation changes in `CURRENT_STATE.md`.

### Pass 2 — Backend / integration agent

- Treat the approved frontend as an existing product, not a scaffold to replace.
- Implement the API, persistence, authentication, authorization, queues/jobs, integrations, and tests.
- Replace mock adapters through the existing data-access boundary.
- Avoid visual redesign unless necessary to resolve a functional contradiction.

## Default technical direction

Unless the repository already contains an approved alternative:

- Package manager: `pnpm`
- Frontend: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons
- Forms/validation: React Hook Form and Zod
- Charts: Recharts
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic
- Database: PostgreSQL
- Background work: Redis-backed job queue
- API style: versioned JSON REST under `/api/v1`
- IDs: UUIDs
- Timestamps: UTC in storage; tenant-local timezone in display
- Money: integer minor units plus ISO currency code

Do not pin arbitrary dependency versions in documentation. Use current stable compatible releases when implementation begins and commit the lockfile.

## Quality rules

- TypeScript strict mode.
- No `any` unless isolated and justified.
- Accessible labels, focus states, keyboard interaction, and sensible empty/loading/error states.
- No production secrets in the repository.
- Seed/demo data must be clearly separated from production data.
- API errors use one documented envelope.
- Tests must cover authorization boundaries and money-changing operations.
- Avoid deeply coupled page components; domain logic belongs in services/hooks/modules.

## Required agent output

At the end of either pass, report:

- What was implemented.
- What remains.
- Commands to run.
- Tests run and their result.
- Known compromises or assumptions.
- Files another agent should read first.
