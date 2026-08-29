# RIVET current implementation work

Temporary execution record for the post-Five-Pillars product hardening sprint. This is not a replacement for `CURRENT_STATE.md` or the canonical backlog. Delete or archive it after every accepted item has been reconciled into the living documentation.

## Baseline

- Baseline commit: `b04feecba95e447c5e023ec1d6a1bafe4426ee58` on `main` and `origin/main`.
- GitHub, CI, and Vercel were synchronized before this sprint began.
- No newer partner commit was waiting at the baseline.
- Production-provider setup, exact-target deployment checks, Arabic localization, and measured performance optimization are intentionally outside this code sprint.
- `FRONTEND_HANDOFF.md` remains a frozen historical artifact.

## Product lens

RIVET should assume that receptionists, sales staff, trainers, and owners are busy and may be reluctant to learn another system. The product must minimize typing, eliminate avoidable choices, remember context, make the next action obvious, and recover cleanly from weak connectivity or mistakes. Fast paths must still preserve tenant isolation, authorization, money integrity, and an immutable audit trail.

## Immediate implementation batch

- [x] Reconcile the marketing-preference contract across forms, mock data, Convex persistence, imports, and lead conversion. A system default must not masquerade as explicit consent.
- [x] Canonicalize Jordanian mobile numbers so `079…`, `+96279…`, `0096279…`, and common spacing/punctuation variants resolve to the same identity for duplicate checks and search.
- [x] Prevent a cash shift from closing until authoritative server totals are available, and cover loading, error, stale-shift, and recovery states.
- [x] Make transaction ranges and CRM follow-up timestamps honor the tenant timezone rather than the browser or UTC day boundary.
- [x] Correct audit-log filters so approval status, actor, action, entity, date, and search are applied server-side before pagination.
- [x] Replace misleading empty states in command search and duplicate checks with explicit failure, retry, and safe-override behavior.
- [x] Add a two-minute quick path for lead capture: name and phone first, sensible defaults, optional details collapsed.
- [x] Add a faster member-capture path and a clear `Create & sell membership` continuation.
- [x] Give pipeline cards visible, keyboard-accessible actions; terminal outcomes must collect a reason instead of relying on drag-and-drop.
- [x] Increase coarse-pointer touch targets and remove unnecessarily dense reception and sales controls.
- [x] Keep a successful reception result on screen until staff deliberately moves on; do not discard warnings automatically.
- [x] Paginate or otherwise expose the complete CRM and reception working sets instead of silently capping them.
- [x] Reconcile `CURRENT_STATE.md` and the canonical product/operations backlog with the shipped code.

## Definition of done for this batch

- Each functional slice has focused automated coverage.
- Authorization and audit rules remain server-enforced.
- Loading, empty, error, retry, and success states are distinct and accessible.
- Mock and Convex adapters obey the same contract.
- `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm audit --prod`, and `git diff --check` pass.
- Work is committed in coherent slices, synchronized with `origin/main`, and pushed directly to `main` as requested.

Completed locally on 29 August 2026. The final pre-documentation application
and browser-test tip is `ea962fa`. The full gate passed with 153 Vitest files /
937 tests, 14 repository-safety tests, 51 generated pages, 39 Playwright passes,
14 explicit credential-gated skips, no known Production dependency
vulnerabilities, and no test failures. The remaining unchecked items below are
the next product batch, not unfinished work from this sprint.

## Next product batch

- [x] Build a unified **Today** queue combining expiring memberships, unpaid balances, overdue leads, missed follow-ups, unresolved access denials, open facility tasks, and owner approvals. Shipped as a single role/branch-safe dashboard aggregate with one-tap completion, exact collect/renew links, a read-only auditor projection, full-count summaries, responsive visual verification, and permanent browser coverage at code tip `8c4be51`.
- [x] Add provider-free WhatsApp handoffs that open a prefilled message, record the attempt, and schedule a follow-up without pretending delivery was confirmed. Organization calling codes are configurable; Jordan (`962`) is the default, while explicit international `+`/`00` numbers remain international.
- [x] Add branded offer links with bearer-token access, explicit acceptance or decline, expiry, attribution, idempotent response handling, and a staff-visible timeline/follow-up trail. Acceptance deliberately does not take payment or activate a membership.
- [x] Add signed-in, branch-safe facilities QR shortcuts and a low-friction task board with quick presets and one-tap Start, Complete, and Block actions. Public QR writes and waiver/document collection remain separately gated.
- [x] Run a realistic-volume query/index pass. Facility and Today reads now use tenant/branch/status indexes, and member/lead projections use relationship indexes with legacy-row fallbacks. Regression fixtures cover 600 facility tasks and 25,000 Today candidates while preserving truthful counts and the bounded display set.
- [x] Harden clean-tenant member onboarding with a downloadable CSV template, file or paste review, normalized international contacts, same-file duplicate detection, a 2 MB/10,000-row server boundary, and a preview-before-commit workflow.

Completed locally in five coherent commits from `ea19e03` through `0db74af`.
Final release-gate, Production deployment, GitHub synchronization, and hosted
verification evidence will be recorded in the living handoff; this temporary
file can then be archived or removed.

## Creative low-friction ideas to evaluate

- **Reception mode:** one large search field, recent members, keyboard shortcuts, and a single dominant action based on the result.
- **Resume where I left off:** remember the staff member's branch, register, filters, and last workflow on the current device.
- **One-tap outcomes:** `No answer`, `Interested`, `Visit booked`, and `Paid` actions that create the right timeline event and only ask for information that outcome truly needs.
- **Smart defaults with visible provenance:** default branch, payment method, lead source, and follow-up time from context while clearly showing what RIVET assumed.
- **Owner exception inbox:** collect discounts, refunds, voids, frozen memberships, overdue cash shifts, and unusual stock adjustments in one approval surface.
- **Daily opening and closing cards:** short role-specific checklists that link directly to unresolved work instead of asking staff to browse reports.
- **Explain the block:** every denied check-in or failed payment should say what happened, what the employee may do, and who can override it.
- **Offline-aware drafts:** keep unsaved lead/member form inputs through a brief connection loss and make retry explicit.
- **Jordan-first contact helpers:** phone formatting, WhatsApp-ready numbers, Arabic/English name search, and copyable payment/reference values.

## Deferred launch closure

- Exact-target Convex Production deployment and post-deploy health check for
  the current feature tip.
- Credentialed staging and signed-in Production acceptance.
- Production-provider, email, backup/recovery, monitoring, WAF, capacity, and operator ownership checks.
- Final pricing, accounting, billing, consent, and provider decisions.
- Approve waiver/document language and retention before collecting signed
  documents; the QR task workflow does not imply that approval.
- Arabic through the selected translation solution and RTL verification.
- Final performance work based on real browser and Convex measurements.
