# 13 — Next Implementation Roadmap for Model 5.6 Luna Max

## Assignment

Continue RIVET from the current `main` branch and make the existing MVP operationally trustworthy. Most P0 screens and Convex workflows already exist. The next job is not to rebuild the frontend or add a new backend. It is to close the remaining authorization, realtime, lifecycle, end-to-end verification, and pilot-readiness gaps.

Work through the milestones below in order. Finish, test, document, commit, and push each logical slice before starting a materially different slice. Do not stop after writing another plan.

## Starting point

Baseline at the time this roadmap was written:

- Branch: `main`.
- Commit: `2164748` (`Complete free trial lifecycle`).
- Architecture: Next.js App Router + Convex + Clerk + Vercel.
- Production data access: `ConvexGymOSApi` behind `GymOSApi`.
- Preview/test data access: explicit `MockGymOSApi` mode only.
- Current automated baseline: 249 Vitest tests, 19 preview Playwright journeys, 2 credential-gated Convex journeys, passing typecheck, Convex typecheck, lint, and production build.
- Existing staged operational path: member creation → membership sale → payment → check-in → timeline/audit → disposable-member archive.
- Existing free-trial path: requested → confirmed → completed/no-show/cancelled → converted, with CRM tasks, timeline entries, customer status, and audit facts.
- Existing production surfaces include platform provisioning, gym settings, staff access, plans, members/import, CRM, reception, payments, shifts, member portal, automations, reporting, support, and audit.

Treat `CURRENT_STATE.md` as the living status document. Verify this baseline against the repository before relying on it because another commit may have landed.

## Read before editing

Read these files completely:

1. `AGENTS.md`
2. `CURRENT_STATE.md`
3. `README.md`
4. `docs/00_PRODUCT_BRIEF.md`
5. `docs/01_SCOPE_AND_ROADMAP.md`
6. `docs/05_DOMAIN_MODEL.md`
7. `docs/06_API_AND_MOCK_CONTRACT.md`
8. `docs/07_SECURITY_AND_TENANCY.md`
9. `docs/08_ACCEPTANCE_CRITERIA.md`
10. `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`
11. `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`
12. `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`
13. `docs/13_PRODUCT_AND_OPERATIONS_TODO.md`
14. `apps/web/src/lib/api/GymOSApi.ts`
15. `apps/web/src/lib/api/ConvexGymOSApi.ts`
16. `apps/web/convex/security.ts`
17. `apps/web/convex/domain.ts`
18. `apps/web/e2e/convex-operational-flow.spec.ts`

## Non-negotiable implementation rules

- Preserve the existing visual system and route structure. Make narrow UI changes only when a workflow or accessibility issue requires them.
- Keep all page-facing data access behind `GymOSApi` and the established provider/hooks. Do not import Convex directly into product pages as a shortcut.
- Convex is authoritative for tenant, branch, role, permission, business state, and audit data. Clerk is authoritative for credentials and sessions.
- Server authorization is mandatory even when the UI hides an action.
- Cross-tenant and out-of-scope branch identifiers must return non-disclosing `NOT_FOUND` behavior.
- Sensitive actions require a reason, permission check, immutable audit event, actor, organization, branch, before/after state, and correlation ID.
- Money remains integer minor units with ISO currency. JOD uses three decimal places. Never use floating-point arithmetic for stored money.
- Preserve historical membership, payment, receipt, refund, void, shift, and audit facts. Do not rewrite history to make a test pass.
- Production must fail closed when Convex or Clerk configuration is missing. Never fall back to mock data in production.
- Do not print, copy, or commit secrets. Environment documentation lists names only.
- Never run `seed:seedDemoTenant` against Production.
- Do not mutate Production without explicit approval for the exact records and actions.
- Do not start class scheduling, POS/inventory, trainer marketplace, native mobile, biometric storage, or double-entry accounting during this roadmap.

## Definition of done for every milestone

A milestone is complete only when:

1. The real Convex implementation and the mock adapter expose compatible behavior through `GymOSApi`.
2. Server authorization and domain invariants are covered by focused tests.
3. Loading, empty, success, error, forbidden, and retry behavior are deliberate.
4. The affected workflow is tested in the browser when it has user-visible behavior.
5. `git diff --check` passes and the diff contains no secrets, debug files, or unrelated changes.
6. `CURRENT_STATE.md` and any affected decision/runbook documentation are updated.
7. The milestone is committed with a focused message and pushed to `main`, unless the product owner explicitly requests a review branch.

## Milestone 0 — Establish a trustworthy baseline

### Work

1. Inspect `git status`, branches, `origin/main`, and the latest commits.
2. Fetch and fast-forward safely. Preserve user-owned local changes.
3. Run the complete credential-free baseline before editing.
4. Compare the actual implementation and test counts with `CURRENT_STATE.md`.
5. Record any pre-existing failure separately; do not disguise it as a regression from the new work.

### Commands

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm convex:typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
git diff --check
```

### Exit criteria

- The worktree and starting commit are known.
- Every credential-free result is recorded with exact pass/fail counts.
- No implementation work begins on an unexplained red baseline.

## Milestone 1 — Finish adversarial authorization and ownership coverage

This is the highest-priority engineering slice. Current helper-level customer ownership tests are useful but do not prove every real query and mutation boundary.

### Work

1. Add action-level tests proving a signed-in customer profile is resolved only from the authenticated Clerk subject.
2. Prove a caller cannot claim another customer by submitting their email, customer ID, membership ID, or trial ID.
3. Prove a trial booking belongs to the authenticated customer and routes only to the selected public gym and branch.
4. Prove platform administrators and gym staff cannot call member-only customer operations merely because they know an identifier.
5. Add cross-tenant and cross-branch tests for:
   - members and member timelines;
   - leads, offers, tasks, and trial bookings;
   - memberships and membership actions;
   - charges, payments, receipts, refunds, and voids;
   - shifts and variance review;
   - check-ins and overrides;
   - entry-pass creation and consumption;
   - staff access and role changes.
6. Test deactivated users, inactive organization memberships, inactive branches, and insufficient branch scope.
7. Test privilege escalation attempts: a staff user cannot grant permissions, roles, discount limits, or branch access beyond their own authority.
8. Fix any server boundary exposed by these tests. UI hiding alone is not a fix.

### Required test style

- Prefer tests that exercise the exported Convex query/mutation/action boundary with authenticated identities and persisted fixtures.
- Keep pure helper tests, but do not use them as the sole proof of authorization.
- Assert stable error codes and non-disclosing behavior, not brittle internal error strings.

### Exit criteria

- Every private identifier family above has an allow case, a permission-denied case, and a cross-tenant or cross-branch case.
- Customer ownership cannot be changed through caller-controlled email or IDs.
- Deactivation removes access on the next authenticated operation.
- All sensitive actions still produce immutable audit events.

## Milestone 2 — Replace polling-first UX with realtime updates on critical surfaces

The current four-second background refresh is an acceptable fallback, but the most operationally important screens should update through Convex subscriptions without manual refresh or full-page loading flicker.

### Work

1. Design a typed subscription capability at the data-access boundary. Extend `GymOSApi` or add a provider-owned subscription seam; do not let pages directly import Convex operations.
2. Migrate these surfaces first:
   - platform gym applications and provisioning status;
   - CRM pipeline, lead detail, tasks, and trial outcomes;
   - member My Gyms and free-trial status;
   - reception occupancy and recent check-ins;
   - payments, receipts, and current cash-shift totals.
3. Keep the existing query result visible while a subscription reconnects.
4. Preserve a bounded polling fallback only where a native subscription is not yet available.
5. Ensure organization/branch changes dispose of the previous subscription before opening another.
6. Prevent duplicate toasts, duplicate mutations, layout movement, and full-screen loading gates during background updates.

### Testing

- Component tests for initial load, live update, reconnect, error, and unsubscribe behavior.
- A two-page or two-browser-context Playwright test where one actor changes a trial/check-in/payment and the other view updates without reload.
- Verify no cross-tenant event reaches the wrong session.
- Verify no React update-after-unmount or duplicate-listener errors appear in the browser console.

### Exit criteria

- Critical cross-browser changes appear without manual refresh.
- Previously rendered data remains stable during reconnects.
- Tenant and branch switching cannot leak old subscription data.
- The four-second refresh is removed from migrated surfaces and retained only as a documented fallback elsewhere.

## Milestone 3 — Close the remaining P0 workflow gaps

Do not expand into P1 features. Close only gaps required to operate the documented commercial loop.

### 3A. Membership upgrade and downgrade

1. Add an explicit plan-change operation to `GymOSApi`, the mock adapter, Convex adapter, and Convex domain.
2. Support an immediate change or a change effective at renewal.
3. Require a reason and the appropriate membership/date/discount permissions.
4. Preserve the prior term and create an immutable adjustment or linked successor term.
5. Never invent or silently calculate proration. If an immediate change needs a charge or credit, require an explicit integer-minor-unit adjustment and record the pilot assumption in `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`.
6. Append member timeline and audit events and reconcile balances everywhere.
7. Add the action to Member 360 with clear before/after confirmation.

### 3B. Operational email boundary

1. Keep applications on the existing Resend path.
2. Add a provider boundary for approved operational emails: trial confirmation/status, payment receipt, renewal reminder, and expiry alert.
3. Default new operational delivery to sandbox unless the product owner explicitly approves real recipients and templates.
4. Persist delivery attempts, provider message ID, retry count, next retry, final status, and deduplication key.
5. Never report a message as sent when the provider is absent or returns an error.
6. Add Arabic/English template selection from the member's preferred language.

### 3C. Pilot-critical usability and accessibility

1. Test owner, manager, salesperson, receptionist, platform admin, and member at desktop and tablet widths.
2. Test keyboard-only reception, dialogs, menus, focus return, form errors, and QR/manual-entry fallback.
3. Test English LTR and Arabic RTL for every changed workflow.
4. Fix only concrete layout, focus, contrast, or workflow issues found by the tests.

### Exit criteria

- Upgrade/downgrade preserves history, balances, timeline, and audit facts.
- Operational messages are durable, deduplicated, retryable, and honest about delivery state.
- The full P0 workflow is usable on a reception tablet and in RTL.

## Milestone 4 — Expand the production-shaped staging suite

The existing staged Playwright flow proves the core sale and check-in loop. Expand it into independent, cleanup-safe journeys against Development Clerk and the isolated staging Convex deployment.

### Required staged journeys

1. **Provisioning:** application → review → approve → provision → owner invitation state → public listing.
2. **Owner setup:** branch → operating hours → currency/timezone → payment methods → policies → membership plan.
3. **Staff security:** invite constrained staff → assign role/branch → prove allowed work → prove forbidden work → deactivate.
4. **CRM:** public trial → confirm → complete/no-show/cancel → follow-up → offer → conversion without duplicate person.
5. **Membership:** sale → partial payment → renewal → freeze/unfreeze → transfer → extension → plan change → cancellation.
6. **Reception:** search/QR → allowed/warning/blocked → authorized override → occupancy/recent check-ins.
7. **Finance:** open shift → cash/card/CliQ-style configured payments → receipt → refund/void → close shift → variance review → reconciliation.
8. **Automation:** trigger one due rule → deduplicated task/message attempt → retry or quiet-hours behavior.
9. **Member portal:** My Gyms → membership detail → entry pass → visit history → receipt/balance → trial status.
10. **Audit and isolation:** trace sensitive events, then prove a second tenant cannot read or mutate the records.

### Test construction rules

- Keep each journey independently runnable and idempotent.
- Use unique markers for disposable records.
- Clean up through audited archive/deactivate/hide actions; never delete financial or audit facts directly.
- Preserve the original assertion failure if cleanup also fails, and report the cleanup target.
- Gate all staging mutation tests behind explicit environment switches.
- Assert the target is the isolated staging deployment before the first write.
- Never reuse production Clerk or Convex credentials in GitHub staging secrets.

### Exit criteria

- A manual GitHub Actions run passes the read smoke and every approved staging write journey on current `main`.
- Run URLs, commit SHA, target classification, test counts, and cleanup outcome are recorded.
- The staged sequence covers the product-level release sequence in `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md` without using mock data.

## Milestone 5 — Production release verification

Follow `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`. Production work is supervised release work, not ordinary feature development.

### Read-only verification first

1. Confirm `main` is clean, pushed, and green in GitHub Actions.
2. Confirm Vercel Production is Ready for the expected commit and effectively runs `pnpm build`.
3. Confirm public domains, redirects, public routes, Clerk key class, and Convex deployment classification without exposing values.
4. Call the public production Convex health query.
5. Verify that Preview/staging and Production identities are not crossed.

### Supervised pilot verification

Only after explicit approval for disposable identities and exact Production actions:

1. Run one gym application and provisioning flow.
2. Accept the owner invitation and configure the pilot workspace.
3. Run the real product sequence from lead/trial through membership, payment, check-in, renewal, automation, shift reconciliation, member portal, and audit.
4. Prove a second tenant cannot access the pilot records.
5. Hide/archive disposable public and identity records through audited product actions.
6. Keep immutable financial and audit facts.

### Exit criteria

- The correct production Clerk issuer and Convex deployment work together.
- The real operational sequence completes without mock/session-storage state.
- Every production mutation and cleanup action is listed in the release report.
- Rollback owner, latest backup/export, Vercel rollback path, and Convex rollback path are documented.

## Milestone 6 — Pilot week and only then P1 planning

Before adding major new product areas, run one real gym through a complete operational week.

Track:

- application and owner onboarding failures;
- staff invitation and permission problems;
- trial-to-member conversion friction;
- payment, receipt, refund, and cash-variance discrepancies;
- failed or duplicate check-ins;
- renewal and automation delivery outcomes;
- Arabic/RTL and reception-tablet problems;
- support cases and workarounds;
- reports the owner actually uses daily.

Fix P0 defects first. After the pilot, rank P1 work using observed demand: class booking, PT packages, trainer operations, corporate accounts, POS/inventory, commissions, and offline reception. Do not implement all of these preemptively.

## Testing matrix

| Layer | Purpose | Required evidence |
| --- | --- | --- |
| Pure unit | Money, dates, status precedence, dedupe, transition rules | Deterministic Vitest cases including boundaries |
| Convex domain | Auth, tenancy, branch scope, transactions, audit | Allow/deny/cross-tenant cases against real handlers |
| Adapter contract | Mock and Convex parity through `GymOSApi` | Same inputs, outputs, and `ApiError` envelope |
| Component | Forms, dialogs, loading/error/forbidden, accessibility | React Testing Library assertions and focus behavior |
| Preview E2E | Deterministic UI journeys and RTL | Playwright in explicit mock/demo-auth mode |
| Trusted read smoke | Clerk → Convex identity and tenant resolution | Credential-gated staging read |
| Trusted staged writes | Persisted commercial and security flows | Credential-gated, isolated, cleanup-safe Playwright |
| Production read-only | Deployment/domain/config classification | Commit, domain, health, and bundle evidence |
| Supervised pilot | Real operational credibility | Approved mutation log, audit evidence, cleanup report |

## Test commands before every final push

Run focused tests while implementing, then run the full gate from the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm convex:typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm convex:codegen
git diff --check
```

Run the trusted staged tests only with isolated non-production credentials and the documented opt-in switches. `convex:codegen` may contact the linked development deployment; `convex:deploy` changes a deployment and must not be run unless the target and authority are explicit.

## Delivery cadence

Use focused commits rather than one unreviewable dump. A suitable sequence is:

1. `Harden customer and tenant authorization boundaries`
2. `Add realtime operational subscriptions`
3. `Complete membership plan changes and message delivery`
4. `Expand production-shaped staging journeys`
5. `Document pilot release verification`

After each checkpoint:

1. Run focused tests.
2. Review the diff for scope and secrets.
3. Commit only the related files.
4. Continue to the next slice if the full baseline remains green.
5. Push verified `main`; Vercel deploys the application from `main`.

## Stop conditions

Stop and request direction if:

- the working tree has an overlapping user-owned change that cannot be preserved;
- a proposed fix requires changing a money, refund, proration, tax, or approval policy that has not been approved;
- staging secrets point to Production or Production trusts a development Clerk issuer;
- a production mutation, email recipient, invitation, or cleanup target has not been explicitly approved;
- a cleanup action would delete immutable financial or audit history;
- the selected Production deployment has no current backup/export;
- completing a task would require adding a P1/P2 product area to make a P0 test pass.

## Final report required from the implementation model

Report all of the following:

- functionality implemented by milestone and domain;
- bugs found and their root causes;
- files changed;
- commands run and exact test counts/results;
- authorization, tenant-isolation, money-changing, and audit evidence;
- staging/production environments touched and every mutation performed;
- cleanup outcome and any disposable records left behind;
- known compromises and assumptions;
- external operator actions still required, using variable names only;
- branch, final commit SHA, push result, and deployment status;
- the first files the next agent should read.
