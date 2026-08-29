# RIVET engineering handoff plan

Last updated: 29 August 2026
Handoff baseline: `main` at `04b1f0ffa1c751af86d4d3d279b72a0dc5b819b8`;
current Convex and Vercel Production verification is recorded below.

## Purpose

This is the shortest path for the next engineer or release operator to continue
RIVET safely. It describes the current implementation, the next work in order,
the validation gates, and the ownership boundary between engineering and the
people who control Production providers.

Do not turn this file into another issue tracker. The canonical issue-level
backlog is [`docs/13_PRODUCT_AND_OPERATIONS_TODO.md`](docs/13_PRODUCT_AND_OPERATIONS_TODO.md),
the system and release procedure is
[`docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`](docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md),
and the complete chronological implementation record is
[`CURRENT_STATE.md`](CURRENT_STATE.md). Preserve
[`FRONTEND_HANDOFF.md`](FRONTEND_HANDOFF.md) as a frozen historical artifact.

## Current state at handoff

- Current-head platform-owner acceptance passed for Overview, Applications,
  Gyms, Pricing & entitlements, Billing, and Support with no page or console
  errors. The previously completed active-owner acceptance used Elias Test.
- With explicit approval, Hashem Test was hidden through the audited platform
  listing control. The state persisted after reload, public discovery retained
  Elias Test but no longer listed Hashem Test, and the hidden tenant's direct
  URL returned not-found without leaking its disposable QA content. Historical
  tenant records were preserved.
- The obsolete `vercel-production` Convex deploy key was revoked; the separate
  `rivet_prod_cli` operator key and documented non-Production GitHub credential
  remain. No provider or job was enabled.
- Convex's provider-managed backup button is unavailable on the Free plan, and
  no plan/PAYG purchase was made. An exact-target Production snapshot export,
  including file storage, was downloaded outside the repository at mode `0600`
  and passed ZIP integrity verification. Its path and checksum are recorded in
  `CURRENT_STATE.md` and the release runbook.
- Authenticated active-owner acceptance passed against the intended
  `elias test gym 1` Production tenant for dashboard, Operations/inventory,
  retail checkout readiness, Finance/statements/controls, a completed receipt,
  Settings, Renewal recovery default-off, and owner denial from `/platform`.
  The pass was read-only and produced no browser console errors. A current-head
  platform-administrator pass and authenticated mobile viewport remain open.
- `fb43a14` fixes the public gym-detail cold-load race: a valid gym no longer
  flashes **Gym not found** before the first marketplace snapshot. Local gates
  passed with 914 Vitest tests and 39 Playwright passes / 14 isolated-staging
  skips; GitHub Actions run `33240389955` passed, and Vercel Production
  deployment `dpl_Ep5eEmAYBdRrpyqH6Mf1hhvb29rj` is `READY`. The canonical
  Elias Test profile loaded without console errors.
- Elias Test is the intended pilot/test tenant. The separate Hashem Test QA
  tenant is now hidden without deleting its historical records.
- Convex Production August database I/O is 1.65 GB against the 1 GB Free-plan
  allowance. The current export closes the immediate recovery-artifact gap,
  while capacity/billing remains a launch gate. Clerk Production is live; open
  public sign-up and disabled MFA remain explicit product/security decisions.
- Convex Production `descriptive-meerkat-589` received the current backend
  through the guarded `pnpm convex:deploy` dry-run/deploy flow on 29 August.
  Schema validation passed, no indexes were deleted, and post-deploy health was
  `ok`. The renewal aggregate audit returned four zero-count categories. The
  subscription preview processed five organizations, found two eligible
  boundaries, and projected zero invoice, past-due, or suspension actions;
  reconciliation remains disabled.
- Vercel `rivet-web` now builds with `pnpm build`, not the legacy raw Convex
  deploy hook. Its Production `CONVEX_DEPLOY_KEY` was removed after the exact
  operator path was proven. A clean redeploy from `d06021e`,
  `dpl_8thJP5sjVUgH9YZREpQjgerpUbfh`, is `READY`, generated 51 pages, and had
  no initial runtime errors or HTTP 500s.
- Public read-only verification passed for the landing page, directory, and
  gym details. The signed-in active-owner and platform passes are complete and
  Hashem Test is hidden; authenticated mobile and isolated staging remain open.

- The sprint began at `e1cac31127a94659ad95f1e0f5f45f536678fa6f` and the final
  application/code verification tip is `3c99fc7`; the final pushed history
  also includes this documentation reconciliation. No partner commits arrived after the starting SHA
  before the final synchronization checks.
- The web application uses Next.js, Clerk, and Convex through the existing
  `GymOSApi` boundary. Production must use Convex and fail closed when required
  configuration is missing.
- The platform console, gym workspace, members, CRM, reception, payments,
  subscriptions, retail checkout/inventory, equipment operations, support,
  audit, and management reporting have persisted Convex implementations with
  mock parity and authorization tests.
- Management Ledger is a standalone three-statement experience:
  `/finance/income-statement`, `/finance/balance-sheet`, and
  `/finance/cash-flow`. The figures are generated from posted journal facts,
  not frontend placeholders.
- The preceding accounting commit `4b8bcc4` added durable accounting-source
  coverage evidence, conditional
  and deduplicated report warnings, membership revenue recognition, and
  equipment depreciation policies. The source queue stores scope, candidate
  digest, and projection fingerprints so a report only claims completeness
  when the current source population is represented.
- Membership sales and renewals remain deferred until the matching source is
  posted. Recognition then allocates exact integer minor units over eligible
  service days, excludes freezes, observes cancellation, rejects future months,
  and never exceeds the posted deferred amount.
- Equipment depreciation requires a posted acquisition in the same branch and
  currency. Eligible active assets use straight-line monthly depreciation,
  zero residual value, exact final-unit rounding, and a bounded useful life.
- Native Arabic fields, RTL layout support, and IBM Plex Sans Arabic remain.
  The paid General Translation integration has been removed and is not a
  deployment dependency.
- This sprint added public listener retry/timeout recovery, event-backed CRM
  identity/assignment/progression, credential-free role-routing browser
  coverage, CI Playwright and clean-worktree gates, the Next dependency-chain
  repair, and RIVET image aspect-ratio fixes. Production remains Convex-backed
  and fail-closed; the mock adapter is preview/test infrastructure only.
- The repository-hardening sprint itself performed no Convex Production deploy
  or provider change. The subsequent 29 August release closure deployed the
  current backend, decoupled Vercel from backend deploys, and verified a clean
  frontend redeploy. It performed no Production product-data mutation and no
  credentialed staging run.
  GitHub Actions [33127740606](https://github.com/hashemnusair/Rivet/actions/runs/33127740606)
  passed for `3c99fc7`, and Vercel Production deployment
  [`dpl_28TJU394KFMmiE1bxddpZj2TVMc5`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/dpl_28TJU394KFMmiE1bxddpZj2TVMc5)
  is `READY` for that exact tip; the canonical site returned HTTP 200.

## Local validation evidence for final application/code tip `3c99fc7`

The complete credential-free repository gate passed:

- frozen lockfile install;
- complete Vitest suite: 148 files / 913 tests;
- repository deployment-safety suite: 14 tests;
- application TypeScript and Convex TypeScript checks;
- full ESLint and secret-output audit;
- Next.js Production build with 51 route entries;
- full Playwright suite: 39 passed, 14 explicit staging/Convex credential-gated
  skips, and 0 failures;
- `pnpm audit --prod`: no known vulnerabilities;
- `git diff --check`;
- clean worktree after generated types, build, and Playwright.

The 14 skipped browser journeys require explicit isolated staging/Convex
credentials and remain non-Production evidence. The local browser run also
emits expected development-preview Clerk, `NO_COLOR`, and occasional Next Fast
Refresh messages; no application failure or RIVET image aspect warning remains.

## What is complete versus what is not

### Implemented and code-tested

1. Tenant, role, permission, module, and branch authorization around the core
   commercial and management workflows.
2. Active-gym access behavior, unavailable-gym owner recovery, and role-aware
   sign-in routing.
3. Platform gym lifecycle and subscription controls, entitlement projection,
   four-tier plan catalog, and public-directory isolation.
4. Member, membership, CRM, reception, payment, receipt, shift, retail checkout,
   inventory, stock transfer, and equipment workflows.
5. Management Ledger statement routes and accounting source processing,
   including the recognition/depreciation safeguards described above.
6. Provider-independent Production build, environment validation, secret-output
   audit, and guarded Convex CLI wrappers.

### Not yet a finished business or Production claim

1. The business owner/accountant has not formally approved the chart of
   accounts, recognition convention, depreciation convention, opening-balance
   process, inventory valuation, period close, tax, or statutory reporting.
2. Retired/replaced equipment has no authoritative effective retirement or
   disposal date. Such assets stay explicitly unconfigured rather than
   continuing or inventing depreciation.
3. Opening balances and statutory/tax/e-invoicing are not implemented claims.
   The current statements are management reports.
4. The latest Convex schema/functions still require an exact-target Production
   dry run and deploy. The latest web commit requires Vercel deployment
   verification.
5. Authenticated acceptance with an active Production gym owner is still
   required for the changed Operations and Management Ledger surfaces.
6. Edge IP/device rate limiting, provider capacity/headroom, backups, and
   recovery evidence remain provider/operator responsibilities.
7. Clerk invitation/signup, Resend delivery, and isolated multi-tenant
   acceptance require configured identities and provider access.

## Execution plan

### P0 — release the current code safely

Owner: release engineer plus the Production provider owner.

1. Confirm the checked-out SHA and a clean tree:

   ```bash
   git fetch origin
   git rev-parse HEAD
   git rev-parse origin/main
   git status --short --branch
   ```

2. Run the credential-free local gate from the repository root:

   ```bash
   pnpm install --frozen-lockfile
   pnpm --dir apps/web exec tsc --noEmit --pretty false
   pnpm --dir apps/web exec tsc --noEmit -p convex/tsconfig.json --pretty false
   pnpm --dir apps/web lint
   pnpm --dir apps/web test
   pnpm --dir apps/web build
   git diff --check
   ```

3. In provider dashboards, confirm variable presence and environment/target
   alignment without copying values into chat or terminal output. Use the
   value-free checklist in the release runbook. At minimum confirm Clerk
   Production keys/issuer, the Convex URL, `RIVET_SITE_URL`,
   `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_DATA_MODE=convex`,
   `ENTRY_PASS_SIGNING_SECRET`, `RIVET_PUBLIC_REQUEST_PEPPER`, Resend sender,
   and a current backup/export.

4. Confirm the exact Convex Production deployment. The documented target is
   `descriptive-meerkat-589`; stop if the configured operator context resolves
   to anything else. Inspect names only:

   ```bash
   pnpm convex:env:names -- --prod
   ```

5. Run the guarded dry run only after the target and authority are explicit:

   ```bash
   pnpm convex:deploy -- --dry-run
   ```

   Review schema/index output. Stop on any unexpected deletion, destructive
   migration, or target mismatch. Never add verbose/debug flags, an admin key,
   a push-request dump, or secret assignments to the command.

6. With explicit Production authorization, deploy through the wrapper:

   ```bash
   pnpm convex:deploy
   ```

7. Verify the read-only Convex health endpoint, recent error state, and Vercel
   deployment for the exact Git SHA. Do not infer deployment success from the
   Git push alone.

8. Perform a manual, read-first smoke with an active gym owner:

   - sign in and confirm the gym workspace—not the member workspace—opens;
   - open `/operations`, switch branches, and verify inventory remains
     independently scoped per branch;
   - open Checkout and confirm products, available quantities, receipt data,
     and payment choices load without creating a sale;
   - open Machines and verify equipment, issue, and work-order data;
   - open all three `/finance/*` statement routes;
   - change date and branch scope and confirm figures and completeness state
     update without duplicate warnings;
   - inspect browser console/network failures and ordinary laptop/mobile layout.

   Any write test must use a disposable, explicitly approved target and retain
   audit and cleanup evidence.

9. Record exact SHA, Convex deployment, Vercel status, validation results,
   health result, mutations, and cleanup in `CURRENT_STATE.md`. Never record
   secret values or unnecessary personal data.

### P0 — accounting operating procedure

Owner: gym owner/manager for operations; accountant/product owner for policy.

1. Approve or revise the management accounting policies before importing
   historical balances or presenting the reports as complete.
2. Refresh the accounting source queue for the intended organization, branch,
   and period.
3. Resolve every `unconfigured`, `unsupported`, or failed source; do not post
   around missing prerequisites merely to remove a warning.
4. Post the underlying membership sale/renewal before recognition and the
   equipment acquisition before depreciation.
5. Post recognition/depreciation only through the supported source actions.
   Future-period and mismatched branch/currency facts should remain rejected.
6. Re-run the source refresh and confirm queue coverage is proven for the same
   scope before relying on the statements.
7. Tie out net income, the balance-sheet equation, opening/closing cash, source
   links, reversals, and closed-period behavior against approved sample facts.
8. Keep retired/replaced assets out of depreciation until an audited disposal
   date and policy are implemented.

### P1 — close acceptance and operational gaps

1. Run authenticated active-owner acceptance for Operations and all statement
   pages, including loading, empty, error, stale-data, permission, and module
   gates.
2. Complete disposable multi-tenant isolation checks with owner, manager,
   staff, member, and platform identities. Prove that a branch/user cannot read
   or mutate another tenant's records.
3. Verify fresh-user and existing-user Clerk invitation acceptance against the
   live provider configuration, including pending/revoked and retry cases.
4. Verify one complete retail sale and receipt path, plus an approved same-day
   void or bounded refund, and reconcile inventory, payment, receipt, shift,
   journal, member timeline, and audit evidence.
5. Establish external IP/device rate limits in Vercel/WAF for public application,
   invitation-claim, trial, entry-pass, check-in, and other abuse-sensitive
   endpoints. Retain the in-application privacy-safe limits as defense in depth.
6. Confirm capacity, alerting, backup freshness, recovery ownership, and the
   rollback operator for Vercel, Convex, Clerk, and Resend.
7. Close the remaining credentialed acceptance items in the canonical backlog;
   do not mark them complete from unit tests alone.

### P2 — product decisions and later expansion

1. Commercially approve the four subscription tiers, prices, limits, trial,
   annual discount, and downgrade/read-only behavior.
2. Decide and implement audited equipment retirement/disposal and opening
   balance workflows.
3. Complete Arabic copy and manual RTL review without adding another paid
   translation dependency unless the owner explicitly chooses one.
4. Select WhatsApp/SMS/supplier providers only after templates, consent,
   quiet-hours, retries, cost, and accountable ownership are approved.
5. Keep supplier marketplaces, autonomous purchasing, hardware integrations,
   statutory/tax/e-invoicing, and other expansion work outside the release until
   separately scoped.

## Rollback guidance

- Web rollback: select the last known-good Vercel deployment for the same
  Production project and domain. Record the before/after deployment IDs and
  Git SHAs.
- Code rollback: prefer a new audited revert commit on `main`; do not rewrite
  shared history or force-push.
- Convex functions: redeploy a reviewed known-good Git revision through
  `pnpm convex:deploy`. Do not assume reverting web code reverts Convex.
- Data/schema: do not delete indexes, tables, journal facts, receipts, audits,
  or tenant data as a rollback shortcut. Restore only from a confirmed backup
  under an approved recovery procedure.
- Feature containment: where supported, disable the affected capability or
  keep an unconfigured source unposted while the defect is investigated.
- After rollback, repeat health, sign-in routing, tenant isolation, and the
  affected money-changing smoke. Record the incident and cleanup.

## Stop conditions

Stop the release and escalate when:

- local `HEAD`, `origin/main`, Vercel SHA, or Convex target do not align;
- a required variable is missing, weak, or belongs to the wrong environment;
- a deploy proposes an unexpected index/schema deletion;
- a statement claims completeness without a current proven source refresh;
- a tenant/branch authorization result is ambiguous;
- a write would affect a non-disposable Production record without explicit
  approval;
- rollback or backup ownership is unknown;
- completing the release would require inventing accounting or commercial
  policy.

## First files to read

1. [`AGENTS.md`](AGENTS.md) — engineering and secret-safe execution rules.
2. [`CURRENT_STATE.md`](CURRENT_STATE.md) — latest implementation and release
   evidence.
3. [`docs/13_PRODUCT_AND_OPERATIONS_TODO.md`](docs/13_PRODUCT_AND_OPERATIONS_TODO.md)
   — canonical active backlog.
4. [`docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`](docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md)
   — architecture, environment ownership, and release procedure.
5. [`apps/web/convex/accounting.ts`](apps/web/convex/accounting.ts) and
   [`apps/web/convex/managementReports.ts`](apps/web/convex/managementReports.ts)
   — accounting source policies and report projections.
6. [`apps/web/src/features/reports/management-statements-workspace.tsx`](apps/web/src/features/reports/management-statements-workspace.tsx)
   — statement hub/detail UI and completeness presentation.
7. [`apps/web/src/lib/api/GymOSApi.ts`](apps/web/src/lib/api/GymOSApi.ts),
   [`apps/web/src/lib/api/ConvexGymOSApi.ts`](apps/web/src/lib/api/ConvexGymOSApi.ts),
   and [`apps/web/src/lib/mock/MockGymOSApi.ts`](apps/web/src/lib/mock/MockGymOSApi.ts)
   — client contract, Production adapter, and mock parity.
8. [`apps/web/scripts/safe-convex-cli.mjs`](apps/web/scripts/safe-convex-cli.mjs)
   and [`apps/web/scripts/validate-vercel-env.mjs`](apps/web/scripts/validate-vercel-env.mjs)
   — deployment safety boundaries.

## Handoff completion report template

```text
Git
- Released SHA:
- origin/main matches: yes/no
- Working tree clean: yes/no

Local gates
- App TypeScript:
- Convex TypeScript:
- Lint/secret audit:
- Vitest:
- Production build:
- git diff --check:

Providers
- Exact Convex Production target confirmed: yes/no
- Guarded dry run result:
- Convex deploy result:
- Read-only health result:
- Exact Vercel SHA/status:
- Clerk/Convex alignment: yes/no
- Backup and rollback owner confirmed: yes/no

Acceptance
- Active-owner sign-in routing:
- Operations/branch inventory:
- Checkout/receipt:
- Machines/work orders:
- Income statement:
- Balance sheet:
- Cash flow statement:
- Tenant/branch/role denial:
- Browser console/network:

Production writes
- Exact approved targets:
- Mutations performed:
- Audit evidence:
- Cleanup completed:

Open blockers and owner:
```
