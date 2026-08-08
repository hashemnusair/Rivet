# 11 — Full Implementation Agent Prompt

Copy the prompt below into the implementation agent together with access to this repository.

---

You are the implementation agent responsible for completing the GymOS MVP in `/Users/hashemnusair/Documents/gym-os-agent-pack`.

Your assignment is to implement the entire plan in `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`, not merely analyze it or complete the first phase.

Read these files completely before editing:

1. `AGENTS.md`
2. `README.md`
3. `FRONTEND_HANDOFF.md`
4. `docs/00_PRODUCT_BRIEF.md`
5. `docs/01_SCOPE_AND_ROADMAP.md`
6. `docs/05_DOMAIN_MODEL.md`
7. `docs/06_API_AND_MOCK_CONTRACT.md`
8. `docs/07_SECURITY_AND_TENANCY.md`
9. `docs/08_ACCEPTANCE_CRITERIA.md`
10. `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`
11. `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`

The approved architecture is Next.js + Convex + Clerk + Vercel. The Convex/Clerk/Vercel decision in `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` supersedes the older FastAPI/PostgreSQL/Redis default. Do not create a parallel FastAPI backend.

Operating instructions:

- Begin by inspecting `git status`, local branches, remote `main`, recent commits, and the current test baseline.
- Fetch and synchronize safely before editing. Preserve any user-owned changes and stop only if an overlapping dirty change cannot be handled safely.
- Keep implementation on `main` for this repository unless the user explicitly requests a review branch.
- Implement every phase of `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md` on the active branch.
- Make logical checkpoint commits, but do not leave completed work stranded on an unnecessary feature branch.
- Push the verified result to `main`; Vercel deploys the Next.js application from `main`.
- Preserve the approved frontend. Do not redesign it or replace it with a scaffold.
- Keep all operational data access behind `GymOSApi` and the established hooks. Do not add direct backend calls to product pages as a shortcut.
- Implement a production Convex adapter and retain `MockGymOSApi` only for explicit preview/test mode.
- Production must fail closed if Convex or authentication configuration is missing. Never silently fall back to mock data in production.
- Enforce authentication, organization scope, branch scope, granular permissions, mandatory reasons, idempotency, and immutable audit events on the server.
- Preserve public UUIDs at the `GymOSApi` boundary even when Convex document IDs are used internally.
- Preserve integer minor-unit money, JOD's three decimal places, UTC storage, tenant-local business days, membership-status precedence, check-in decision ordering, void/refund semantics, and receipt-number guarantees.
- Do not expose secrets, commit environment files containing values, print tokens, or place privileged Clerk operations in browser code.
- Use current stable compatible packages and commit any intentional lockfile changes.
- Do not add the independent trainer marketplace, native mobile apps, inventory/POS, double-entry accounting, biometric storage, or unapproved external messaging/billing integrations.
- Do not leave placeholders, unimplemented methods, temporary success responses, disconnected screens, skipped required tests, or production code paths backed by frozen seed arrays/session storage.

External services:

- Elias already has access to the Clerk, Convex, and Vercel projects. Reuse the existing projects and configurations when available.
- Keep secret values outside Git.
- If a required credential or dashboard permission is genuinely unavailable, continue all work that does not require it, document the exact external step, and ask for the smallest necessary access request. Do not use missing deployment access as a reason to stop local implementation.
- A Clerk production instance and custom domain may remain externally deferred only if the product owner has not completed the domain setup. The code, environment-variable contract, and deployment path must still be production-ready.

Verification requirements:

- Add GitHub Actions for frozen install, typecheck, lint, unit/component tests, production build, and Playwright.
- Add Convex authorization, tenant-isolation, branch-scope, schema, domain-invariant, money-changing, audit, automation, and adapter contract tests.
- Keep the current mock-mode test suite green.
- Add an authenticated Clerk-to-Convex smoke path for a trusted development or preview environment.
- Run the complete product-level release sequence in `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md` using real Convex data.
- Run the final commands from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

Before delivery:

- Update `README.md`, `FRONTEND_HANDOFF.md`, `.env.example`, and relevant decisions documentation to match the implementation.
- Record all meaningful assumptions and external deferrals.
- Confirm `git diff --check` passes.
- Inspect the final diff for secrets, debug files, generated junk, and unrelated changes.
- Confirm the working tree is clean after the final commit.
- Push `main` after verification; do not open a pull request solely to avoid merging a finished slice.

Do not stop after producing a plan, schema, CI workflow, or partial reference-data slice. Continue until the full completion plan is implemented and verified, or until a genuinely external blocker makes a specific completion criterion impossible. When blocked, finish every independent phase first and provide concrete evidence of the remaining blocker.

Your final report must include:

- Implemented functionality by domain.
- Remaining work and exact reason.
- Local commands.
- Deployment and migration commands.
- Environment-variable names without secret values.
- Test commands and exact results.
- Tenant-isolation and authorization evidence.
- Money-changing and audit evidence.
- Known compromises and assumptions.
- Files the next agent should read first.
- Branch name, final commit SHA, push result, and pull-request URL.
---
