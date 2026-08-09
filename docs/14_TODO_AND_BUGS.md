# 14 — RIVET TODO, Bugs, and Release Notes

This is the active engineering backlog. It is intentionally evidence-based: confirmed defects are separated from release blockers, missing MVP capabilities, and items that still need verification. Update the status and evidence when a task is fixed; do not delete the history of a release blocker without recording how it was closed.

Last reviewed: 2026-08-09, commit `2164748` plus the current roadmap documentation.

## How to use this file

- `P0` blocks a trustworthy pilot or can expose data, money, access, or misleading system state.
- `P1` materially reduces operational quality but does not block the first supervised pilot.
- `P2` is a post-pilot improvement or an intentionally deferred product decision.
- `Confirmed` means the behavior was observed in code, a test, or a browser run.
- `Needs verification` means there is a credible risk or regression report, but it must be reproduced against the current head before changing behavior.
- Every fix must add or update a focused test and link the closing commit in this file.

## P0 — Release blockers and correctness risks

### BUG-001 — Production Convex/Clerk/Vercel alignment is not fully verified

- Status: **Confirmed release hold**.
- Evidence: `CURRENT_STATE.md` and `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md` still require read-only production verification and a supervised onboarding sequence. Production must use the matching Clerk production issuer, Convex production deployment, and Vercel Production public variables.
- Risk: sign-in can succeed while Convex cannot resolve the tenant/role, or the public site can appear healthy while operational writes target the wrong deployment.
- Fix/acceptance: complete the value-free Phase A/B checklist, verify the public health query and bundle classification, then run the approved Production pilot sequence. Record the deployment classification and exact commit in the release report. Never seed Production as a shortcut.

### BUG-002 — Authorization coverage is not yet adversarial at every Convex handler boundary

- Status: **Confirmed coverage gap**.
- Evidence: customer tests currently prove ownership helpers, while the roadmap still requires handler-level attempts using attacker-controlled customer, membership, trial, payment, lead, entry-pass, and branch identifiers.
- Risk: a UI gate or a helper can look correct while a direct authenticated mutation/query still accepts an out-of-scope identifier.
- Fix/acceptance: add authenticated allow/deny/cross-tenant/cross-branch tests for every private identifier family. Test deactivated users, inactive memberships, branch scope, role escalation, and non-disclosing `NOT_FOUND` behavior. Fix the server boundary if any test fails.

### BUG-003 — Production-shaped release sequence is incomplete

- Status: **Confirmed coverage gap**.
- Evidence: the staged write smoke covers member → membership → payment → check-in → timeline/audit, but it does not yet prove the complete product-level sequence from provisioning through settings, staff, CRM conversion, renewal, automation, shift reconciliation, member portal, and isolation.
- Risk: individual screens can pass while the real gym workflow fails at a handoff between domains.
- Fix/acceptance: add independently runnable, cleanup-safe staging journeys using Development Clerk and isolated Convex only. Gate all mutations explicitly and report cleanup results.

### BUG-004 — Customer trial ownership must be proven through real authenticated mutations

- Status: **Confirmed coverage gap**.
- Evidence: the current customer tests cover profile ownership helpers, but the high-risk behavior is the actual authenticated booking path.
- Risk: a caller could submit another customer's email or ID and attach a booking to the wrong person, or route a booking outside the selected gym/branch.
- Fix/acceptance: test authenticated customer profile resolution, caller-supplied ID rejection, selected gym/branch routing, and staff/platform denial of member-only operations through real Convex handlers.

## P0 — Confirmed user-facing and runtime issues

### BUG-005 — Trial success copy promises My Gyms persistence when the visitor is not signed in

- Status: **Confirmed in browser preview**.
- Evidence: the public gym form displays “Your booking is also saved under My Gyms,” while `/customer/my-gyms` correctly requires a member sign-in. In Convex mode, submitting while signed out redirects to login; in mock mode, the public preview can show the success state without a member session.
- Risk: a visitor believes the booking is attached to an account when it is only routed to the gym CRM, then sees an apparently missing booking after opening My Gyms.
- Fix/acceptance: either require/sign in before submitting in every mode or change the success copy and CTA to explain that the gym received the request and the visitor must sign in/create an account to attach it to My Gyms. Add unauthenticated and authenticated browser tests.

### BUG-006 — Member QR panel still labels the entry pass as a “Preview code”

- Status: **Confirmed stale copy**.
- Evidence: `apps/web/src/app/customer/my-gyms/[membershipId]/membership-detail.client.tsx` renders “Preview code. In production this is a short-lived signed token,” while `CURRENT_STATE.md` says the Convex path already uses a short-lived HMAC-signed, branch-bound entry pass.
- Risk: members and gym staff cannot tell whether the QR shown in the live portal is a real usable credential.
- Fix/acceptance: make the label runtime-aware. In Convex mode say it is a short-lived signed entry pass and show its expiry/refresh behavior; reserve “Preview code” for explicit mock mode. Add mock/Convex component coverage.

### BUG-007 — Critical screens are polling, not truly realtime

- Status: **Confirmed architectural compromise**.
- Evidence: `CURRENT_STATE.md` and `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md` document a four-second background refresh because the typed client boundary has no subscription-aware adapter.
- Risk: reception, CRM, platform provisioning, payments, and My Gyms can show stale state for several seconds and may still feel like they require manual refresh during concurrent work.
- Fix/acceptance: add a typed subscription seam behind the existing API/provider boundary. Migrate platform applications, CRM/trials, My Gyms, reception occupancy/check-ins, and payment/shift totals first. Keep a bounded polling fallback until each subscription is tested. Add two-context Playwright tests with no reload and no full-page loading flicker.

### BUG-008 — Generated Next route types dirty the worktree during local dev and Playwright

- Status: **Confirmed tooling issue**.
- Evidence: running `next dev`/Playwright rewrote `apps/web/next-env.d.ts` from `./.next/types/routes.d.ts` to a mode-specific path such as `./.next-playwright/dev/types/routes.d.ts`. A typecheck before a successful build also reported a missing generated route module.
- Risk: routine tests create unrelated diffs, and a clean checkout may depend on generated `.next` files before `typecheck` is run.
- Fix/acceptance: make generated route typing deterministic for dev, Playwright, CI, and production; ensure a clean checkout can run the documented static checks in CI order; do not commit generated `.next` output. Add a CI/fixture check for a clean workspace.

### BUG-009 — Login and role-routing regressions need permanent browser coverage

- Status: **Needs verification against current head**.
- Evidence: earlier browser reports described admin/team sessions flickering through member pages, an extra “Access platform” step, and role errors before reaching the correct dashboard. Recent tests cover sign-out transition and role restrictions, but not every Clerk identity-to-destination path.
- Risk: a valid gym owner, platform admin, or member can land on the wrong surface or see a misleading role error.
- Fix/acceptance: add trusted/mock browser tests for member → member dashboard, gym staff → gym dashboard, platform admin → platform console, forbidden direct URLs, sign-out → login, and cold-refresh hydration. Assert no intermediate wrong-dashboard content is visible.

## P1 — Missing or incomplete MVP behavior

### TODO-001 — Membership upgrade and downgrade are not explicit API operations

- Status: **Confirmed missing from the current `GymOSApi` contract**.
- Evidence: the contract exposes sale, renewal, freeze, unfreeze, extension, cancellation, and transfer, but no dedicated plan-change operation.
- Risk: staff cannot safely change a member's plan while preserving historical terms and reconciling price differences.
- Fix/acceptance: add a typed plan-change operation to mock and Convex adapters. Support immediate or next-renewal effective dates, required reason/permission, immutable successor or adjustment facts, explicit integer-minor-unit charge/credit, timeline, and audit. Do not invent proration; record the chosen pilot policy in `docs/09_DECISIONS_AND_OPEN_QUESTIONS.md`.

### TODO-002 — Operational messaging is sandbox-only outside gym applications

- Status: **Confirmed deferred capability**.
- Evidence: automation rules and templates show a sandbox provider; `CURRENT_STATE.md` defers live WhatsApp/SMS/email delivery. Resend is currently used for gym-application notifications, not the complete member lifecycle.
- Risk: renewal reminders, trial confirmations, payment receipts, expiry alerts, and retry behavior are not yet a real-gym communication system.
- Fix/acceptance: implement a provider boundary with durable delivery attempts, deduplication, retries, quiet hours, provider IDs, final status, and Arabic/English templates. Keep sandbox as the default until the product owner approves sender, recipient, and template policy.

### TODO-003 — Member documents/profile photos are not represented in the operational contract

- Status: **Needs product decision / likely P1**.
- Evidence: member notes, tags, and emergency contacts exist, but there is no approved document/photo storage workflow in the current API contract.
- Risk: gyms that require an ID or waiver cannot keep that record beside Member 360.
- Fix/acceptance: only implement after deciding retention, file type/size, access scope, and Convex storage policy. Add signed upload/download authorization, audit events, and deletion/retention rules. Do not store sensitive files in arbitrary JSON.

### TODO-004 — Discovery empty state needs an operational explanation

- Status: **Needs verification / product copy**.
- Evidence: Production can correctly show “No RIVET gyms are live yet” while no tenant has completed approve → provision and public-listing publication. The public catalog plans can still load.
- Risk: visitors may interpret an intentionally empty catalog as a broken backend.
- Fix/acceptance: keep the safe empty state, but explain that gyms appear after approval and publication, provide a clear application CTA, and add a platform/admin verification that provisioning publishes a listing. Do not seed fake Production gyms.

### TODO-005 — Error handling can silently hide background failures

- Status: **Needs verification**.
- Evidence: provider/background refresh code contains deliberate `.catch(() => undefined)` paths for some snapshots and refreshes.
- Risk: the UI can remain stale without a visible retry or diagnostic state, especially when Convex or Clerk is temporarily unavailable.
- Fix/acceptance: classify expected unauthenticated/empty cases separately from network/configuration failures; preserve the last good data, surface a non-blocking stale/retry indicator, and log redacted correlation context server-side. Add offline/reconnect tests.

## P1 — Security, finance, and audit hardening

### TODO-006 — Expand real-handler isolation tests across money and entry flows

- Status: **Confirmed roadmap item**.
- Scope: member/lead/payment/check-in/entry-pass/trial IDs, refund/void, cash-shift variance review, branch transfer, discount approval, invitation role/branch scope.
- Acceptance: each has allow, forbidden, cross-tenant, cross-branch, deactivated-user, reason-required, idempotency, and immutable-audit assertions.

### TODO-007 — Complete supervised finance/reconciliation evidence

- Status: **Confirmed staging gap**.
- Scope: open shift, opening float, cash/card/CliQ-style configured payments, partial balance, receipt, refund/void review, close shift, expected-vs-counted cash, manager variance decision, daily reconciliation.
- Acceptance: source transaction facts, receipt numbers, shift totals, audit events, and reports agree after reload and concurrent updates.

### TODO-008 — Verify automation scheduling, deduplication, quiet hours, and retries end to end

- Status: **Confirmed staging gap**.
- Scope: expiry/follow-up trigger, task creation, sandbox message attempt, daily dedupe key, quiet-hours suppression, retry metadata, and manager notification.
- Acceptance: one trigger produces one action per dedupe window; retryable failures do not report false success; audit/execution records remain queryable.

## P2 — Deliberately deferred until after the first pilot

- Full class schedules, capacity, waitlists, and no-shows.
- PT packages and trainer availability.
- Corporate accounts and commissions.
- POS/inventory and equipment maintenance.
- Native mobile app and offline-tolerant reception queue.
- Advanced churn/anomaly prediction.
- Live WhatsApp/SMS and external SaaS billing beyond approved provider boundaries.
- Google authentication unless the pilot proves it is necessary and a project-owned OAuth client is configured.

## Regression checklist before closing a bug

Run the focused test first, then the full gate:

```bash
corepack pnpm typecheck
corepack pnpm convex:typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
corepack pnpm build
git diff --check
```

For staged Convex writes, use only the documented explicit switches and a disposable Development Clerk identity/storage state. For Production, complete the read-only verification and obtain approval for each mutation before running it.

## Closure log

When closing an item, add one line here with the issue ID, date, commit SHA, test evidence, and any operator action still required. Do not mark a release blocker closed because a local mock test passed.

| Issue | Closed on | Commit | Evidence |
| --- | --- | --- | --- |
| — | — | — | No items from this review have been closed yet. |
