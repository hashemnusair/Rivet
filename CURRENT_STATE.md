# GymOS / RIVET current implementation state

## Production backend release closure — 23 August 2026

- `main` and `origin/main` were synchronized at
  `2323dd6841741c9763983a2e3dac43cb5a11f10f` before this documentation
  update. That head includes Elias's platform-admin hardening in addition to
  the Five Pillars application and renewal-safety work. GitHub Actions run
  `32412787941` passed for that application commit, and its Vercel Production
  deployment is `READY` (`CEFfosE9hcTLkkwNNFBoL8kvCqb7`).
- The guarded dry run and deploy both targeted exact Convex Production
  deployment `descriptive-meerkat-589`. Schema validation completed, no
  indexes were deleted, and the current functions were deployed through
  `pnpm convex:deploy`; the Development deployment `fleet-otter-621` was not
  targeted.
- The post-deploy `health:check` returned `status: ok`. The internal
  aggregate-only `renewalJobs.releaseAudit` returned zero renewal deliveries,
  delivery events, member-timeline records, and staff call tasks, with empty
  status/type groups and no first/last timestamps. No cleanup was required.
- The authenticated Production platform-admin session loaded `/platform`,
  `/platform/applications`, `/platform/billing`, `/platform/subscriptions`,
  and `/platform/support` without page or console errors. The same identity
  was correctly routed away from `/operations`, `/finance`,
  `/reports/statements`, and `/settings` to `/platform`; a separate active
  gym-owner session is still required for the signed-in Five Pillars workspace
  acceptance pass.
- Convex reported that the projects are above the Free-plan limits during the
  Production dry run and deploy. Resolve capacity/billing before pilot launch
  to avoid service interruption; no plan purchase or provider-setting change
  was made by this release.
- Credential-complete isolated-staging journeys remain open because the
  documented role identities are unavailable. The deployment, health query,
  and release audit did not create, edit, delete, seed, import, or restore
  Production product data. Renewal recovery remains default-off, live outbound
  providers remain disabled, `FRONTEND_HANDOFF.md` remains frozen, and the
  `arabic-localisation` branch remains unmerged for the final Arabic and
  measured-performance pass.
- Final local gates passed on the deployed application code and this handoff:
  frontend and Convex typechecks, zero-warning lint and secret-output audit,
  118 test files / 630 tests, the 46-route Production build, 28 Playwright
  passes with 14 credential-gated staging journeys skipped, and
  `git diff --check`.

## Four-tier catalog and annual pricing — 23 August 2026 (working-tree update)

- RIVET now has one end-to-end four-tier catalog: Starter (JOD 79/month),
  Growth (JOD 149/month), Pro (JOD 249/month), and Enterprise (JOD 500/month).
  Enterprise is accepted by organization, application, provisioning, platform
  admin, entitlement, seed, mock, and public catalog contracts instead of being
  a UI-only option.
- The landing pricing section has an accessible monthly/annual switch. Annual
  prices are derived from the monthly catalog at a 20% discount and show both
  effective monthly and annual billed totals. The chosen plan/cadence carries
  into signup; the application remains a non-charging provisioning request and
  does not claim an external recurring billing integration.
- Dashboard access follows the implemented module model: Starter includes
  foundation and revenue; Growth adds operations; Pro adds finance and
  management reporting; Enterprise includes all five at higher capacity limits.
  Desktop/mobile navigation, Finance subnavigation, direct route gates, and
  backend Operations/Accounting/Management Reporting checks use authoritative
  organization-plan access and cannot be reopened by stale entitlement rows.
- Local validation passed: frontend and Convex TypeScript checks, zero-warning
  lint, **122 test files / 656 tests**, the 46-route Production build, focused
  landing pricing Playwright coverage, and a live-session four-tier entitlement
  journey. The corrected focused browser journeys pass; a subsequent full-suite
  rerun lost its preview server and produced cascading connection-refused
  failures, so it is not claimed as a product pass. No Convex/Vercel Production
  deploy or Production product-data mutation is claimed by this working-tree
  update.

## Subscription tier activation repair — 22 August 2026 (working-tree update)

- Platform plan changes now treat the provisioned organization as the billing
  authority and immediately synchronize its entitlement projection. Newly
  purchased modules are enabled on upgrade; downgrades are enforced at read
  time while retaining prior preferences for a later upgrade.
- Active gym sessions subscribe to workspace-access changes, update the shared
  query cache, and filter desktop/mobile navigation by both role permission and
  entitled/enabled module. Admin subscription rows reconcile transiently stale
  platform snapshots instead of visually reverting a successful save.
- The subscription editor now states the exact access granted by each tier:
  Starter provides foundation and revenue, Growth adds operations, and Pro adds
  finance and management reporting. Mock and Convex implementations share the
  same behavior and regression coverage.
- Local validation passed: frontend and Convex TypeScript checks, zero-warning
  lint, **118 test files / 639 tests**, the 46-route Production build,
  `git diff --check`, and Playwright (**29 passed / 14 credential-gated staging
  tests skipped**). The browser journey keeps a gym session open across Pro →
  Starter → Pro and verifies that premium navigation/routes lock and unlock
  without reload or logout. No Convex/Vercel Production deploy or Production
  product-data mutation is claimed by this working-tree update.


## Platform admin hardening pass — 20 August 2026 (working-tree update)

This additive entry records the platform-operations hardening completed after
the earlier platform-console work. It preserves the historical release notes
below and makes no deployment, Production-verification, or merge claim.

### Subscription, tenant, and authorization integrity

- Platform subscription controls now use reason-gated lifecycle updates with
  server validation for status, plan, trial/started/current-period/cancelled
  dates, future trial ends, date ordering, and configured-plan boundaries.
  Suspended, overdue, and cancelled states force the public listing hidden;
  only active/trial tenants can remain discoverable.
- For a linked tenant, the organization and its subscription entitlement are
  authoritative. A platform change synchronizes the organization lifecycle,
  subscription plan, entitlement catalog/modules, and directory projection;
  before/after snapshots, actor, reason, and correlation ID are retained in an
  immutable platform audit event. Stale directory lifecycle values cannot
  silently overwrite the tenant record.
- Directory-only, mismatched, unprovisioned, or otherwise fake legacy rows are
  retained privately for audit and cleanup, but are not treated as tenants:
  lifecycle/plan mutation is unavailable, the safe cleanup action is hide, and
  their public listing is suppressed. Suspended/overdue/cancelled rows remain
  visible to platform operators for recovery or cleanup only.
- Public marketplace projections, direct gym detail, and trial creation now
  require the persisted public/listing and operational tenant/branch boundary;
  private, suspended, overdue, cancelled, unprovisioned, and inactive-branch
  records do not leak through direct routes or member discovery.
- Platform authorization is identity-backed: the Clerk/RIVET identity record
  must be an active platform administrator, and server-side platform guards
  remain authoritative. Deactivated/invited users and suspended/cancelled
  tenant memberships are not advertised as routable access; client session
  flags cannot grant platform access.

### Platform surfaces hardened

- Overview uses the complete platform snapshot/tenant directory rather than
  the independently updating public marketplace stream, and invoice queue
  links preserve the invoice ID for ledger deep-linking.
- The platform search combobox now supports active-option highlighting,
  ArrowUp/ArrowDown/Home/End navigation, Enter selection, and correct
  `aria-selected`/`aria-activedescendant` semantics. Applications, billing,
  and support react to same-route query changes from header search. Application
  initial reads are sequence-guarded against live-subscription races; review,
  provisioning, and stale/error states retain actionable recovery paths.
- Billing focuses and scrolls to an invoice only after its row is loaded;
  invoice entry rejects malformed, scientific-notation, zero-rounding, and
  unsafe values before converting to a positive safe minor-unit integer.
  Support now has explicit loading/empty/search/deep-link states and keeps
  persisted operator actions visible after local updates.
- Platform billing integrity is JOD-only for platform totals: eligible
  invoices are resolved from explicit/legacy labels, mismatches are excluded
  from monetary totals and counted, and the UI remains a manual ledger rather
  than implying card charging, settlement, or payout capability.

### Final local validation

- Mock/live adapter parity and focused platform regression coverage are in
  place for subscription synchronization, authorization, directory privacy,
  billing currency classification, platform navigation/search, applications,
  billing, support, and gym detail.
- Final root gates: **116 test files / 626 tests** passed; both TypeScript
  checks, lint, and the production build passed. Playwright recorded **28
  passed / 14 staged-credential tests skipped**.
- In-app browser validation covered a reason-gated Pro → Growth plan change
  with live MRR refresh and an audit toast, unprovisioned cleanup-only
  controls, keyboard global search, and zero page errors. The only observed
  console warning was the expected Clerk development warning.

### External provider limitations and release follow-up

- External SaaS billing/card charging, payout, settlement, and provider-backed
  storage remain unavailable; the platform surface intentionally exposes
  manual JOD ledger behavior and explicit `Not configured` states.
- Clerk remains the external identity/invitation provider; invitation flows
  have a protected implementation, while fresh/existing-owner credentialed
  acceptance remains release follow-up. Resend/WhatsApp/SMS delivery still
  depends on configured external credentials, templates, allowlists, and
  staging acceptance; operational messages remain suppressed where those
  boundaries are not enabled.
- This pass is a local working-tree update only. No Convex or Vercel deploy,
  Production product-data mutation, seed/import/restore/delete operation, or
  external-provider activation is claimed here.

## Five-pillar release closure status — 20 August 2026

- The closure attempt started from `7a1237dc719bfb4c767aa824ca73cf93410c2d8d`, which matched `origin/main`; this is a subsequent direct-main documentation update. The Five Pillars application/release commit remains `1e01163d25cc6f9123001329877a45e33e5670ea`, and the hand-written `arabic-localisation` branch remains separate at `f98e324`.
- The five implementation pillars are present on `main`: shared tenant/capability foundation, renewal recovery, daily operations, immutable management ledger, and management reporting. The implementation remains additive and locally validated; no future marketplace, autonomous purchasing/replacement, statutory-accounting, Arabic, or optimization work was added here.
- GitHub Actions run `32391568593` passed for this exact commit, and the matching Vercel Production status is `READY` (`ER5WksGThgB9BiBupZNZAxUsig85`). The local production build includes 46 routes, including `/operations`, `/finance`, and `/reports/statements`.
- The intended Production Convex target is `descriptive-meerkat-589`. `CONVEX_DEPLOYMENT` is unset and the configured deployment context selected by the safe wrapper is Development `fleet-otter-621`; the required dry run targeted that Development deployment, passed schema validation, and reported no deleted indexes. The Production deploy was not attempted with the wrong context, so `1e01163`'s renewal gate is not verified as deployed to Production.
- `notifications.renewalRecoveryEnabled` defaults to false by omission and by explicit false. The scheduler cannot create renewal deliveries, delivery events, member timeline entries, or renewal call tasks while disabled. An authorized settings user with `settings.manage` can enable it explicitly; the owner path is covered by the server test, and WhatsApp/SMS remain sandboxed independently.
- An internal read-only `renewalJobs.releaseAudit` query now returns only aggregate counts, status/type buckets, and first/last timestamps for renewal deliveries, renewal events, renewal timelines, and renewal call tasks. It was not deployed or run against Production because the context was Development and no authenticated Convex operator session was available; no Production pre-gate count is claimed.
- The existing Chrome profile had no authenticated Production GymOS or Convex session. `/operations`, `/finance`, `/reports/statements`, and `/settings` each redirected to `/login`; no browser console errors were observed. Authenticated workspace visibility, authorization failures, loading/error states, drill-downs, failed-request review, and laptop/mobile layout checks remain unverified.
- No staging role storage states or connected staging variables were available in the environment. No accounting journey was run, no staging records were created, and no cleanup evidence is claimed.
- No Production data was seeded, created, edited, deleted, or archived. Live WhatsApp, SMS, email, supplier messaging, and other providers remain disabled. `FRONTEND_HANDOFF.md` is unchanged.

### Five-pillar implementation summary

- Foundation: server-owned entitlements, workspace preferences, Brand Kit, typed zones, consent/event primitives, tenant/branch/role enforcement, audit, and mock/Convex parity.
- Renewal recovery: exact 14/7/3-day sandbox reminders, one-day staff call task, consent/quiet-hours/deduplication/stop rules, truthful delivery state, append-only events, and timeline records behind the opt-in gate.
- Daily operations: typed inventory, suppliers, purchasing, facilities, equipment, work orders, alerts, recorded-input recommendations, protected writes, and `/operations` workflows.
- Management ledger: code-owned accounts and posting policies, balanced immutable journals, source postings, reversals, periods, reconciliation, and `/finance` controls.
- Reporting: income statement, balance sheet, cashflow, GM analysis, scope/policy metadata, bounded drill-downs, completeness warnings, and management-accounting disclaimer in `/reports/statements`.

### Local validation for this release

- `pnpm typecheck` — passed.
- `pnpm convex:typecheck` — passed.
- `pnpm lint` — passed with no warnings; secret-output audit passed.
- `pnpm test` — **557 tests across 109 files passed**.
- `pnpm build` — passed; Next.js generated **46 routes**.
- `pnpm test:e2e` — **27 passed, 14 skipped, 0 failed**. Skips are credential-gated staging journeys; no Production target was used.
- `git diff --check` — passed.
- Required Production dry run — safely blocked from Production because the verified context selected Development `fleet-otter-621`.

### Remaining release evidence

- Provide an existing Production deployment context that targets exactly `descriptive-meerkat-589`; then rerun the required dry run and deploy through `pnpm convex:deploy` only, followed by the approved read-only health check.
- After the exact Production deployment, run the internal count-only renewal audit and record aggregate counts/timestamps. Do not expose member, phone, tenant, or message details.
- Run the signed-in Production read-only route checks and one isolated Development staging journey only when the documented role identities are available. Preserve cleanup evidence for every disposable staging record.

### Migration and compatibility notes

- Five-pillar schema additions are typed/additive; no destructive migration, seed, import, restore, or Production write was run in this release.
- Permission catalog v2 remains additive for legacy roles; explicit current-version role edits can omit permissions intentionally.
- Reports do not invent opening balances, historical snapshots, revenue recognition, depreciation, or unsupported source postings. Cashflow remains unproven while source-queue coverage is incomplete.
- Preserve `FRONTEND_HANDOFF.md` as the frozen historical artifact; this file is the living implementation and release-status handoff.

Primary files for orientation:

- `docs/16_FIVE_PILLAR_EXPANSION_PLAN.md`
- `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`
- `apps/web/convex/renewalJobs.ts`
- `apps/web/convex/renewalJobs.test.ts`
- `apps/web/convex/domain.renewal-settings.test.ts`
- `apps/web/convex/operations.ts`
- `apps/web/convex/accounting.ts`
- `apps/web/convex/managementReports.ts`
- `apps/web/src/features/operations/operations-command-center.tsx`
- `apps/web/src/features/finance/management-ledger-workspace.tsx`
- `apps/web/src/features/reports/management-statements-workspace.tsx`

Updated 2026-08-20 after the Production closure attempt. The historical frontend-only pass remains preserved separately in `FRONTEND_HANDOFF.md`.

## Simplified Core CRM Pilot — released 17 August 2026

- The primary gym workspace now follows one simple path: **Dashboard → Leads → Follow-ups → Members → Reception → Payments → Personal training → Support → Settings**. Memberships, plans, cash shifts, reports, audit, and Automations remain available through contextual/deep routes without competing with the primary workflow.
- Payments is the single finance entry point; Shifts & cash and Reports are secondary finance views. The command palette mirrors the same core destinations instead of presenting duplicate top-level routes.
- Gym public-profile publishing is idempotent. Retrying a publish for the already-published draft returns the existing authoritative projection without creating another immutable profile version or audit event.
- Shared loading, empty, retry, and permission states are now used by the gym support workspace. Support remains a two-way persisted conversation between gym staff and RIVET administrators.
- Staging journey reporting distinguishes implemented, credential-blocked, deferred, and not-run journeys. Automations is explicitly deferred because its product surface is Coming soon; selecting an unconfigured or deferred journey skips it with a truthful reason instead of attempting a Production write.
- This slice does not change the Convex schema, seed/import/restore/delete Production product data, activate live email, or use Production as a test-writing target.
- Direct-main commit `e3a4e9d8439738a358a129e32c9289ffa8bd4ea5` was fetched against the unchanged partner head, committed on `main`, and pushed without a branch or PR. `FRONTEND_HANDOFF.md` and `docs/14_MODULAR_WORKSPACE_PLAN.md` remain untouched.
- Local release gates passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (90 files / 478 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 intentional staging/deferred skips), and `git diff --check`.
- GitHub Actions [run 31978650324](https://github.com/hashemnusair/Rivet/actions/runs/31978650324) passed typecheck/lint/unit tests/build, generated-code verification, and Playwright preview; the authenticated Clerk → Convex smoke remained credential-gated/skipped. Vercel Production deployment [J4Rz3YsXjUYL5XsjcFxCcdQ4N6TQ](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/J4Rz3YsXjUYL5XsjcFxCcdQ4N6TQ) completed successfully, and `https://www.rivetjo.com` returned HTTP 200.
- Convex Production target `descriptive-meerkat-589` was selected explicitly. The exact-target non-verbose dry run and deploy passed with no deleted indexes and schema validation complete; there is no `schema.ts` delta or destructive migration. The read-only `health:check` returned `{ "status": "ok" }`; the aggregate recent-log check surfaced no error event payloads.
- The optional functional-staging workflow now reports missing identities as credential-blocked and skips functional writes instead of failing the release. No staging secrets were required for this release, no Production product data was written, and live operational email stayed disabled.
- The staging safety preflight now requires an explicit `PLAYWRIGHT_PRODUCTION_CONVEX_URL` comparison before any staged journey can write, so an absent Production reference cannot silently weaken the Production-target guard.

## Production member and lookup regression fixed — direct-main release

- The failure was reproduced against Production on 16 August 2026: member and membership lists loaded, but opening a member detail route crashed with `TypeError: Cannot read properties of undefined (reading 'homeBranchId')`.
- Root cause was the `c4d8ee0` realtime read optimization. In Convex mode it disabled the ordinary initial query before a native watch had delivered its first snapshot; a connecting watch could therefore leave a detail page with no data while reporting a non-error loading state.
- Direct-main commit `c9ff56d5dada034689674a8e6fd4077430cdeb1e` keeps the initial query enabled until the realtime watch has delivered a value, restores failure-only polling when the stream falls back, adds defensive no-data guards to member and lead detail routes, and adds a Convex-mode regression test. It is frontend-only: no Convex deploy, schema/index change, Production product-data mutation, seed/import/restore/delete, or live operational-email activation was performed.
- Local verification passed: frontend and Convex typechecks, Convex codegen, zero-warning lint, 89 test files / 475 tests, the 43-route Production build, the full Playwright suite with only credential-gated staging skips, the focused member lookup journeys (3/3), and `git diff --check`.
- GitHub Actions [run 31910859527](https://github.com/hashemnusair/Rivet/actions/runs/31910859527) passed typecheck/lint/unit tests/build, generated-code verification, and Playwright preview; the authenticated smoke was skipped because it remains credential-gated. Vercel Production completed the exact deployment [5xJ4qsgmqDai92jK5XjTjWJWQPGn](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/5xJ4qsgmqDai92jK5XjTjWJWQPGn), and `https://www.rivetjo.com` returned HTTP 200.
- A fresh Production browser tab then opened the previously failing member record successfully with no error overlay and no console errors. `main` is clean and aligned with `origin/main`.

## Automations UI postponed — direct-main frontend release

- The `/automations` workspace and direct `/automations/[ruleId]` links now show a clear **Coming soon** state with no rule creation, editing, execution, or delivery controls. The existing backend implementation and tests remain preserved for a later restart after the Convex foundation is settled.
- Added a focused Coming Soon regression. Local verification passed: `pnpm typecheck`, `pnpm lint`, `pnpm test` (89 files / 474 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`.
- This is frontend-only. No Convex deploy, schema/index change, Production seed/import/restore/delete, Product-data mutation, or live operational-email activation was performed. Automation quiet-hours/retry staging acceptance is intentionally postponed with the feature.

## Automation rule integrity and suppression parity — direct-main release

- Direct-main application/backend commit `c75182764aac7d43a3a33de8ea5434acd1447064` was pushed after the final pre-commit fetch found `origin/main` at `6a1a0d8`; no partner work was overwritten, no branch or PR was created, `FRONTEND_HANDOFF.md` remains frozen, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Automation rule creation and editing now use one canonical parameter model. Expiring rules accept deduplicated day checkpoints, expired rules correctly persist **days after expiry** (including `0` for today), and every trigger/action/name/role/title/deduplication value is validated at the Convex boundary. Queue-message actions require a tenant-owned message template instead of creating an unusable rule.
- Manual automation runs now apply the same linked-member marketing-preference suppression boundary as the scheduler. Unknown or opted-out recipients are persisted as suppressed marketing deliveries, while quiet-hours and outbound-delivery gates remain explicit; operational manager notifications are unaffected.
- Focused automation form and command regressions plus the full local gates passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (88 files / 473 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`.
- Convex Production target `descriptive-meerkat-589` passed the exact-target non-verbose dry run and deploy through `pnpm convex:deploy`. Both reported no deleted indexes and schema validation completed; this slice has no `schema.ts` delta and no destructive migration. Read-only `health:check` returned `status: ok`, and the post-deploy read-only log history contained no new error events.
- GitHub Actions [run 31900380886](https://github.com/hashemnusair/Rivet/actions/runs/31900380886) passed typecheck/lint/unit tests/build, generated-code verification, and Playwright preview. The authenticated Clerk → Convex smoke was correctly skipped because it is credential-gated on push. Vercel Production completed the exact commit at [deployment 51UULH2C54uM1Dk4gnDwp7xcfTSX](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/51UULH2C54uM1Dk4gnDwp7xcfTSX), and `https://www.rivetjo.com` returned HTTP 200.
- No Production seed, import, restore, delete, product-data mutation, or live operational-email activation was performed. The five credential-gated isolated-staging bodies still remaining are `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`; the automation body still needs quiet-hours and transient-retry recovery evidence with disposable cleanup.

## Dashboard priorities and Follow-ups workspace — direct-main release

- Direct-main application commit `a7710c8085827b16037c49aa9e9dd3c0c948a3ba` replaces the low-value owner-dashboard Pipeline funnel with an actionable Operating priorities card linking to renewals, outstanding balances, and open lead follow-up. It uses the existing persisted KPI contract; no backend/API or schema change was required.
- Follow-ups now uses a ServiceTitan-inspired attention workspace: a sticky vertical filter rail on the left, a clear Found matches results area on the right, and a selected-member context pane when a row is opened. Expiring/Expired, day-window, exact date-range, reset, retry, empty, and pressed-state behavior remain explicit and accessible.
- The final pre-commit fetch found `origin/main` at `70e39b2b5e301a74376bc0d943bb611d94f4f725`; no partner work advanced, no branch or PR was created, `FRONTEND_HANDOFF.md` remains frozen, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Local verification passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (87 files / 468 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`. Rendered checks covered the desktop three-column workspace and mobile filter/results layout.
- This is a frontend-only release: no Convex Production deploy, schema/index change, Production product-data mutation, seed/import/restore/delete, or live operational-email activation was performed. The exact post-push [GitHub Actions run 31898075938](https://github.com/hashemnusair/Rivet/actions/runs/31898075938) passed typecheck/lint/unit tests/build, generated-code verification, and Playwright preview; the authenticated Clerk → Convex smoke was credential-gated/skipped. The exact Vercel Production check [AHWizGwwuvXXPtJjdyPrqwDKQDNe](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/AHWizGwwuvXXPtJjdyPrqwDKQDNe) passed, and `https://www.rivetjo.com` returned HTTP 200.
- The five credential-gated isolated-staging bodies still remaining are `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`.

## CRM read-path and realtime responsiveness — direct-main release

- Direct-main release commit `c4d8ee06ead649b45b15b977af0d62b956a1225c` is pushed to `main` and `origin/main`. The final partner fetch found no advancement; no branch or PR was created, `FRONTEND_HANDOFF.md` remains frozen, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Branch-scoped member, membership, lead, check-in, occupancy, and renewal reads now use the existing indexed `domainRecords` paths. Member, membership, task, transaction, and renewal projections batch shared lookups instead of repeating full collection reads per row. Customer activity uses the existing member index, and the test fixture now reflects the production `insertRecord` contract.
- Native Convex watches now own their initial snapshot instead of issuing a duplicate ordinary query. Reception occupancy and shift totals, plus the CRM pipeline, use the shared live-query bridge; ordinary query fallback remains available only after a stream failure, with the last good snapshot preserved.
- Local verification passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (85 files / 464 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`.
- Convex Production target `descriptive-meerkat-589` passed the exact-target, non-verbose dry run and deploy through `pnpm convex:deploy`. Both reported no deleted indexes and schema validation completed; this release has no `schema.ts` delta and no destructive migration. Read-only `health:check` returned `status: ok`; the read-only recent-log history returned no post-deploy events.
- GitHub Actions [run 31896227309](https://github.com/hashemnusair/Rivet/actions/runs/31896227309) passed typecheck/lint/unit tests/build, generated-code consistency, and Playwright preview. The authenticated Clerk → Convex smoke remained credential-gated/skipped. GitHub’s Vercel status reports the exact Production deployment [5LQi669RfXf14jyLKGqQ6jZCz5Lv](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/5LQi669RfXf14jyLKGqQ6jZCz5Lv) completed successfully; `https://www.rivetjo.com` returned HTTP 200.
- No Production seed, import, restore, delete, product-data mutation, or live operational-email activation was performed. Continue observing Production Convex I/O and function-call usage for 24–48 hours before claiming a measured usage reduction. The five credential-gated staging bodies still remaining are `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`.

## Production read-usage hardening — direct-main release

- Direct-main frontend release commit `cb2b73abef0eccaaf7c2b9ae79067265d501910e` is pushed to `main` and `origin/main`. The final fetch found no partner advancement; no branch or PR was created, `FRONTEND_HANDOFF.md` remains frozen, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Removed the global 15-second Convex/TanStack background refetch that caused every open one-shot screen to read while idle. One-shot screens now refresh when they become active again or reconnect, while existing CRM/reception/support/member realtime subscriptions remain the primary live-update path. Follow-ups now uses its existing renewal-queue subscription and only falls back to targeted polling when that stream fails.
- Added focused query-policy regression coverage. This release is frontend-only: no `schema.ts` change, Convex Production deployment, index change, or Production data mutation was required. Live operational email remains disabled.
- Local verification passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (85 files / 464 tests), `pnpm build` (43 routes), `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`.
- GitHub Actions [run 31894165494](https://github.com/hashemnusair/Rivet/actions/runs/31894165494) passed typecheck/lint/unit tests/build, generated-code verification, and Playwright preview. The push-triggered authenticated Clerk → Convex smoke remained workflow-dispatch/credential gated. Vercel reports the exact frontend deployment [Gger2SFEDmGhqoJ2mfEt1Rfji1A4](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/Gger2SFEDmGhqoJ2mfEt1Rfji1A4) completed successfully; `https://www.rivetjo.com` returned HTTP 200.
- Monitor Convex Production Database I/O and function-call usage for the next 24–48 hours. The change preserves CRM responsiveness through live subscriptions and focus/reconnect refreshes; it does not claim a measured usage reduction until the Production dashboard confirms it.

## Support chat, CRM outcomes, renewal filters, PT deletion, and member journeys — direct-main release

- Direct-main release commit `3c6ce09aac5c4dee71fe88c93116d78af0729a83` is pushed to `main` and `origin/main`. Partner commits `e70ec81` and `8d0615f` were integrated safely; the iOS/PWA shell and navigation hardening were preserved. No branch or PR was created, `FRONTEND_HANDOFF.md` remains frozen, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Support is now a two-way, tenant-scoped conversation: gym staff can reply to platform admins, admins can reply to the gym, replies remain in the case history, resolved cases cannot be silently reopened, and admin notifications/audit facts are recorded.
- Leads is a four-column drag-and-drop board: **Trial**, **Membership sold**, **Membership not sold**, and **Did not answer**. The sold outcome still opens the lead sale flow rather than fabricating a financial sale from a drag action. Follow-ups is now a large expiring/expired filter with adjustable days and exact date ranges limited to the supported one-year window.
- PT packages have a visible delete action with a required reason and audit event. Unused packages can be deleted; packages referenced by historical orders are intentionally protected and must be archived so sold terms and financial history remain intact. The existing arbitrary-session numeric field and volume price-per-session tracker remain in place.
- The member home is intentionally minimal: subscribed gym cards show only the gym name, logo/banner, and subscription end date. Each gym page exposes an on-demand entry-QR dialog, switches between Membership details and PT, removes online renewal/extra actions, and keeps Recent activity collapsed at the bottom by default.
- Local gates passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (84 files / 462 tests), `pnpm build`, `pnpm test:e2e` (25 passed / 14 staging-gated skips), and `git diff --check`.
- Convex Production target `descriptive-meerkat-589` was selected explicitly. The exact-target non-verbose dry run and deploy completed through the safe `pnpm convex:deploy` wrapper; both reported no deleted indexes and schema validation completed. The read-only `health:check` returned `status: ok`, and the latest 20 read-only log events contained only expected unauthenticated guard events. This release commit has no `schema.ts` delta; compared with `eb82f8d`, the already-released schema differences are additive/widening only: member profile fields, the append-only `customerProfileEvents` table and two indexes, PT session-count widening, and immutable PT order snapshot/cancellation fields. No destructive migration was proposed or run.
- GitHub Actions [run 31834979651](https://github.com/hashemnusair/Rivet/actions/runs/31834979651) passed typecheck/lint/unit tests/build, Convex generated-code verification, and Playwright preview. The push-run authenticated smoke was skipped because it is workflow-dispatch gated. GitHub’s Vercel check reports the exact frontend deployment [6cJ6gaK8LRFN9K1zLbTEUiyoM8S5](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/6cJ6gaK8LRFN9K1zLbTEUiyoM8S5) completed successfully; the canonical site returned HTTP 200.
- Manual isolated-staging workflow [run 31835407484](https://github.com/hashemnusair/Rivet/actions/runs/31835407484) ran with authenticated smoke, `run_operational_flow=true`, `run_realtime_flow=true`, `run_owner_settings_flow=true`, `run_functional_staging=true`, and `staging_journeys=all`. Authenticated smoke, membership lifecycle, two-browser realtime, and owner-settings/trial-schedule passed. Disposable member cleanup completed for the membership and realtime journeys, and the owner-settings journey restored the original policy. The functional gate stopped before writes at the missing `PLAYWRIGHT_CLERK_STORAGE_MANAGER` secret; no functional journey body ran and no Production target was used.
- The five staging bodies still awaiting credential-complete execution are `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`. They are authored and wired, but remain unaccepted until a manager identity and the other role-specific isolated-staging states are available. No Production seed, import, restore, delete, product-data mutation, or live operational-email activation was performed.

## Member iOS standalone-PWA hardening — direct-main release

- Added an explicit Next.js web app manifest with a stable member-home launch URL, standalone presentation, root scope, and existing-window launch preference. The root scope keeps Home, Explore, Account, gym detail, authentication, and other same-origin RIVET routes inside one installed app instead of letting a deep-page installation implicitly narrow the navigation boundary.
- Enabled `viewport-fit=cover` and Apple standalone metadata while keeping the status bar non-translucent. The signed-in mobile dock and its matching page reserve now account for left, right, and bottom safe-area insets, with a reliable minimum breathing zone so labels and controls clear the iPhone home indicator and rounded corners.
- Internal member navigation remains Next.js `Link`/App Router navigation; no `target`, popup, or document-level redirect was introduced. No service worker or offline data cache was added in this pass.
- Focused manifest regression coverage protects the standalone start URL and root scope. Existing iOS installations should be removed and added to the Home Screen again after deployment because WebKit can retain the manifest and scope captured at installation time.
- Release gates passed: TypeScript, zero-warning lint, the focused manifest tests (2/2), the full public/member Playwright journeys (10/10), the 43-route Production build, and `git diff --check`. The Impeccable detector's only advisory was the unchanged marketing-site measurement grid, outside this member-PWA change.

## Member-home UX redesign — released to Production

- Reworked `/customer/my-gyms` around the member's highest-frequency task: opening a server-signed, short-lived entry pass. Each membership now renders as a restrained RIVET pass with one dominant QR action, gym media, scannable status/renewal/visit/PT/balance facts, and progressive links into membership and PT detail.
- Removed the repeated dashboard/discovery controls from the page, account menu, and signed-in footer. Desktop has one Home / Explore header navigation; signed-in mobile uses one persistent Home / Explore / Account dock, with the real member profile, communication settings, and sign-out consolidated under Account.
- Replaced the equal dashboard tiles, permanently exposed QR rail, duplicate gym actions, and stacked activity cards with a calmer member-first hierarchy: greeting, membership pass, actual trial bookings, gym-scoped recent activity, shortcuts, and compact communication controls.
- Preserved the latest `origin/main` data boundary, member access gate, server-signed entry-pass loading/error/expiry states, profile route, gym media/activity projections, PT realtime summary, trial links, marketing-preference history, responsive/RTL-ready utilities, and the frozen `FRONTEND_HANDOFF.md` contract. No API, persistence, authorization, or production data changed.
- Updated the credentialed PT staging journey to identify the signed-in member from the new welcome heading before opening PT sessions.
- Pre-rebase verification: web TypeScript passed; zero-warning ESLint passed; focused public-shell and communication-preference tests passed (4/4); the Impeccable detector reported no findings; `git diff --check` passed. Playwright exercised the preview login and member flow at 390×844 and 1440×1000, opened the account menu and entry-pass dialog, found the expected QR, and reported no browser console errors or framework overlays. The same affected gates are rerun after integrating the latest `origin/main` behavior.

## Gym profile media preview and finalization fix — 2026-08-14

- Direct-main release commit `0aa1599b14e81dcc06a81e47e09387beeff9f63a` is pushed to `main` and `origin/main`. The final pre-commit fetch found no partner advancement; no branch or PR was created, and `FRONTEND_HANDOFF.md` was not modified.
- Gym logo, cover, and gallery selections now remain local until **Save draft**. The editor previews the selected file first, validates type/size and accessible description locally, uploads only during the draft save, and removes newly uploaded pending assets if the save fails. Discarding changes clears local previews without a server upload.
- Convex `media.finalizeUpload` now passes only the authorization fields accepted by `authorizeFinalize`; the previous extra `storageId` field caused the Production `media:finalizeUpload` server error. A focused Convex boundary regression and Settings component regression cover the fix.
- Convex Production target `descriptive-meerkat-589` passed the exact-target non-verbose dry run and deploy through `pnpm convex:deploy`. Schema validation completed, no indexes were deleted, and the release has no `schema.ts` delta or destructive migration. The read-only `health:check` returned `{ "status": "ok" }`; recent read-only logs contained only expected unauthenticated guard events.
- GitHub Actions [run 31807295256](https://github.com/hashemnusair/Rivet/actions/runs/31807295256) passed typecheck/lint/unit tests/build, generated-code consistency, and Playwright preview jobs; the authenticated Clerk → Convex smoke was credential-gated/skipped. Vercel’s Production deployment record for the same SHA completed successfully at [the deployed build](https://rivet-mqce4n2q8-nusairhashem04-gmailcoms-projects.vercel.app).
- Local verification passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (83 files / 456 tests), `pnpm build`, `pnpm test:e2e` (24 passed / 14 staging-gated skips), and `git diff --check`.
- No Production seed, import, restore, delete, product-data mutation, or live operational-email activation was performed.

## PT package volume-pricing correction — 2026-08-14

- Direct-main release commit `11504b9583e5f7f40bc8edc5a4d1a7301d679781` is pushed to `main` and `origin/main`. The worktree was clean before the change, the pre-push fetch found no partner advancement, and no branch or PR was created.
- PT package setup now uses one numeric sessions field instead of the fixed 12/20/30 buttons. New-package pricing starts from the volume guide: 12 sessions = JOD 240 (JOD 20/session), 20 sessions = JOD 300 (JOD 15/session), and 30 sessions = JOD 400 (JOD 13.333/session). Intermediate and larger counts receive a deterministic suggested total, while the total remains editable and the existing non-increasing per-session pricing-ladder validation remains enforced.
- The editor and package cards show an explicit price-per-session tracker. Existing package definitions and historical PT order terms were not automatically changed; no Production product data was seeded, imported, restored, deleted, or mutated by this release.
- GitHub Actions [run 31803917097](https://github.com/hashemnusair/Rivet/actions/runs/31803917097) passed the generated-code check, typecheck/lint/unit/build, and Playwright preview jobs. The credential-gated authenticated Clerk→Convex smoke was skipped by the push workflow.
- Vercel Production reports the exact frontend deployment for this commit completed successfully at [deployment status](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/AjxuxEW8m2qGgf3hVj3K7vYU9ovU). This is a frontend/shared pricing change only; no Convex Production deploy was needed.
- Local verification passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (83 files / 454 tests), `pnpm build`, `pnpm test:e2e` (24 passed / 14 staging-gated skips), and `git diff --check`.

## Release-aligned state — 2026-08-14

- The direct-main implementation release is `a374f0e9ba31384e2b8a132995c9c18be973e26d`. The final pre-commit fetch found `origin/main` already at `a61d0de`; no partner work was overwritten or rewritten. The worktree was clean before synchronization, `FRONTEND_HANDOFF.md` was not modified, and `docs/14_MODULAR_WORKSPACE_PLAN.md` remains a product plan.
- Vercel Production reports a completed deployment for the application-bearing SHA through [deployment status 36Zjw9Q6wAAoXjnQW8Epc5Cdksr7](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/36Zjw9Q6wAAoXjnQW8Epc5Cdksr7). Subsequent main commits in this handoff are documentation-only; their ordinary CI/Vercel redeploys were monitored and no application source changed after `a374f0e`.
- Convex Production target `descriptive-meerkat-589` was selected explicitly with `CONVEX_DEPLOYMENT=descriptive-meerkat-589`. The exact-target non-verbose dry run and deploy were run from `a374f0e` through `pnpm convex:deploy`; the dry run and deploy reported no deleted indexes, schema validation completed, and only the two `customerProfileEvents` indexes were added. The read-only `domain:query` health check returned `{ "status": "ok" }`; recent read-only logs contained only expected unauthenticated guard events. Compared with `eb82f8d`, schema changes are additive/widening only: approved profile fields, the append-only profile-events table, PT order snapshots/cancellation fields, and a widened PT session-count validator; no destructive migration was proposed or run.
- The PT, gym CMS/media, shared member profile, multi-gym dashboard, QR dialog, gym-scoped activity, exact identity linking, profile synchronization, itemized payment collection, and release-staging-body implementation is included in `a374f0e`. Historical PT sales remain snapshot-backed; marketing consent remains separate from profile editing; medical data and live email remain out of scope/disabled.
- Final local gates passed: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (83 files / 453 tests), `pnpm build`, `pnpm test:e2e` (24 passed / 14 staging-gated skips), and `git diff --check`.
- Manual isolated staging run [31761753434](https://github.com/hashemnusair/Rivet/actions/runs/31761753434) used `run_operational_flow=true`, `run_realtime_flow=true`, `run_owner_settings_flow=true`, `run_functional_staging=true`, and `staging_journeys=all`. The staging target guard/deploy, authenticated smoke, membership lifecycle, two-browser realtime, and owner-settings/trial-schedule passed. Disposable members were archived and the original trial policy was restored by the passed ledgers. Functional staging stopped before writes at the missing `PLAYWRIGHT_CLERK_STORAGE_MANAGER` secret; no functional journey body ran.
- The five formerly missing staging bodies are now authored and wired, but remain unexecuted pending a credential-complete isolated-staging run: `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`. The manager identity is the current blocker; the other role-specific states and safe invitation template are also required by the complete suite.
- No Production seed, import, restore, delete, product-data mutation, or live operational-email activation was performed; only the Convex function/schema deployment was changed.

## CRM cleanup and responsiveness pass — superseded pre-release snapshot

The pending-release wording in this historical snapshot is superseded by the release-aligned evidence above.

- Converted leads linked to archived members are now excluded from Convex and mock lead lists. A deleted archived member also cannot leave an actionable dangling lead behind.
- The self-service member trial workflow already creates a tenant/branch-scoped trial_booked lead atomically; standalone member-account signup still creates only the member profile because no gym has been selected yet.
- Follow-ups is now the single work queue for overdue/today tasks and expiring/expired renewals. The duplicate **Trials to finish** and **New & unassigned** lead lanes were removed; Leads is the place to work active trials and membership sales.
- The Leads board requests only active stages and renders two clear columns: **Trial** and **Membership sale**. Successful and not-successful outcomes remain in the lead/member timeline rather than appearing as actionable work.
- Convex and mock task lists now hide tasks linked to closed leads, archived/deleted members, or dangling relations. This prevents a deleted member from resurfacing in Follow-ups and has persisted regression coverage before and after deletion.
- Members now has an **Archived members** view. Owners/managers can permanently delete an archived member only after typing the exact name and providing a reason. Convex blocks deletion when there is an active/scheduled membership, collectible balance, or future PT booking, removes customer projections/private photos, and preserves financial, timeline, and immutable audit facts. No Production member was deleted by this pass.
- Lead-list projections now batch branch, owner, and timeline lookups instead of doing a database read for each lead. Member-list projections batch memberships, plans, charges, and check-ins as well. TanStack Query and realtime queries use a short 10-second freshness window, five-minute cache retention, and no focus-triggered refetch to reduce navigation/remount freezes while mutation invalidation still refreshes affected data.
- Verification: the focused and full suites prove archived-lead filtering, exact-name/reason deletion, guard rails, audit preservation, post-delete cleanup, stale-task filtering, and projection parity. Current local checks pass for both TypeScript checks, Convex typecheck, zero-warning lint, 80 Vitest files/440 tests, production build, 24 Playwright tests (9 credential-gated staging specs skipped without staging credentials), and `git diff --check`. Convex codegen was not rerun against an unpinned deployment target; no generated files or deployment were changed.

## Simple trial-to-membership CRM — current worktree

- The operator flow is now explicitly **Trial → Membership sale → Member**. A trial is marked completed or not completed; only a completed trial exposes the successful/not-successful membership decision.
- A successful decision creates the member, membership, balance/charge, included PT credits, timeline, and audit facts in one atomic Convex mutation. The retired member-only conversion operation now rejects direct callers, preventing another won lead with no membership.
- Legacy CRM records are recoverable: when the lead matches exactly one accessible active member, the successful sale reuses that member and creates the missing membership instead of blocking or duplicating the person. Multiple conflicting matches still stop for manual duplicate resolution.
- Staff can choose any active plan available at the selected home branch or enter a real custom membership name, JOD price, duration in days, and included PT sessions. A custom choice persists as an active branch-scoped plan for later reuse.
- The offer composer, delivery confirmation, offer response controls, draggable stage manipulation, and seven-stage progress strip are absent from the primary CRM. Historical offer records remain intact and queryable; no existing data was deleted.
- Growth navigation now says **Leads** and **Follow-ups**. The lead board contains only Trial and Membership sale work; successful and not-successful history stays queryable from the lead/member record without allowing arbitrary drag-and-drop around the enforced workflow.
- Focused persisted Convex coverage proves existing-plan sales, custom-plan sales, legacy-member reuse without duplication, rejection before trial completion, atomic member/membership creation, reusable custom plans, and the retired conversion boundary. The staging trial journey now exercises the simplified sale instead of offers plus a second conversion step.

## Secret-output hardening

- A release dry run used Convex's verbose deploy flag. Convex 1.42.3 serializes the full `startPushResponse` in that mode, including the deployment environment-variable value map; upstream 1.43.0 retains the same behavior. This was a release-diagnostic mistake and dependency CLI issue, not a RIVET application logging path.
- The pinned Convex package is patched to redact every deployment environment-variable value before verbose serialization. The supported `pnpm convex:deploy` wrapper additionally refuses verbose/debug flags, push-request dumps, command-line admin keys, hidden verbosity, and secret assignments.
- `pnpm convex:env:names -- --prod` is the only supported recorded environment inspection. The lint gate audits application, workflow, and script sources for common environment dumps and unsafe Convex diagnostics.
- Server telemetry continues to record correlation metadata and stable error codes only; it does not serialize request/provider payloads, identities, or exception messages.

## Functionality-first correctness pass — released at `0cea424`

- Future membership charges now persist explicit issue/due dates and are collectible only when their membership term has begun. Upcoming invoices are displayed separately, excluded from current balances, entry warnings, outstanding-member and receivables projections, and rejected by the payment mutation before their term starts. Scheduled-term cancellation voids its unpaid charge, and the active term remains the primary membership until the successor begins.
- Branch settings now persist explicit weekday trial times. Public availability is generated for the selected branch/date in the gym timezone, with truthful unconfigured, closed, and unavailable states; Convex revalidates the submitted slot and permits only one open request per customer and gym.
- Membership status is date-aware for scheduled freezes. Future freezes no longer make a membership immediately frozen, overlapping scheduled/current freezes are rejected, past dates are rejected, and early unfreeze applies only to an in-progress freeze.
- Role destinations now include explicit receptionist and auditor routes. Deterministic test-only Clerk fault injection covers organization and invitation failure, while persisted retry evidence proves provisioning converges to one organization, branch, listing, settings record, role set, owner membership, and invitation.
- The operational-email worker can lease due records, send through Resend, persist provider acceptance, and retry transient failures after 1, 5, and 30 minutes. Delivery remains off unless the exact Convex environment switch, provider configuration, tenant owner confirmation, and category allowlist all permit it. Mandatory platform categories use a separate global allowlist. Existing sandbox-suppressed records are never replayed.
- Verified webhook processing continues to persist provider delivery, bounce, and failure outcomes. Trial-status, renewal, and expiry templates are bilingual. An hourly membership job deduplicates seven-day renewal and one-day expiry messages and in-app notifications.
- The staging release harness now includes executable, Production-refusing bodies for membership lifecycle, owner settings, staff authorization, trial/CRM conversion, finance/reconciliation, personal training, and the separate realtime smoke. The four newest workflows require genuinely role-specific Clerk storage states, attach cleanup ledgers, and are workflow-dispatch gated; provisioning, reception-entry, automation, member-portal, and isolation/audit bodies remain.
- CRM offers now persist explicit accepted/declined outcomes after confirmed delivery. Declines require a reason and reopen follow-up; acceptance and conversion append truthful timeline/audit facts, while expired offers cannot be accepted. Conversion can atomically accept a still-delivered offer and is regression-tested to emit exactly one acceptance fact.
- The functional staging bodies now cover: branch-scoped staff invitation plus wrong-role denial and deactivation; public trial request through confirmation, completion, manual offer delivery, acceptance, conversion, and archival; PT credit reservation with second-browser trainer visibility and credit-restoring cancellation; and card/cash partial collection, intentional non-zero reconciliation variance, manager approval, and archival cleanup.
- Local verification: both TypeScript checks, zero-warning lint, 78 Vitest/Convex files / 431 tests, the 41-route Production build, 24 preview Playwright journeys with 9 credential-gated journeys skipped, and `git diff --check` pass. Convex codegen remains exact-target/credential-gated in this environment; no deployment or provider mutation was attempted by this slice.
- Convex Production `descriptive-meerkat-589` passed the exact-target dry run with no index additions or deletions, then deployed the matching `eb82f8d` backend and returned `status: ok`. Operational email stayed disabled because the global live switch was absent; no tenant/product mutation or provider delivery was performed.
- `main` was pushed at handoff commit `0cea424`. GitHub Actions run `31606568922` passed typecheck/lint/427 tests/build, preview Playwright, and credentialed Convex codegen consistency. Vercel deployment `8aJ46ziCtHTgvbFg7gdhXPZoC6aM` completed successfully; `www.rivetjo.com` returned HTTP 200 and the apex returned the expected permanent redirect to `www`.

## Reviewed Settings and media hardening — backend `a58166b`, matching frontend release

- Public-profile media uploaded for a gym now enters a persisted `pending` state with a server-enforced 24-hour expiry. Saving a profile promotes only referenced assets; scheduled cleanup removes abandoned storage objects after browser close/navigation, while explicit discard removes pending, unreferenced uploads immediately. Persisted Convex coverage proves upload, promotion, expiry, and storage deletion.
- Public-profile publishing is unavailable whenever local edits differ from the saved draft, so the persisted draft cannot be published behind newer unsaved content. Internal links and Settings-tab changes now present explicit **Save and leave**, **Discard and leave**, and **Stay** choices; browser-unload protection remains as a final boundary.
- Gym-controlled operational-email settings compare the previously enabled and proposed categories as sets. Any removed category requires a meaningful reason, including a same-count swap; enable-only and no-op changes remain routine. Convex enforces the same rule for direct mutations. External delivery remains release-gated and off by default.
- The shared `Field` wrapper honors a child's existing `id` before an explicit fallback and generates/injects an id only for controls known to receive it. Custom controls without a reliable id target no longer receive a misleading `htmlFor` association. Focused keyboard/focus accessibility coverage protects the behavior.
- The new-member marketing default remains opted in. No Production tenant/product data was seeded or mutated by this pass. Backend commit `a58166b` passed an exact-target additive Convex Production dry run, deployed to `descriptive-meerkat-589`, and returned healthy; frontend Production/CI evidence is recorded with the matching release after deployment.
- Matching local release gates passed: both TypeScript checks, Convex codegen, zero-warning lint, 71 Vitest files / 400 tests, the 41-route Production build, 24 preview Playwright journeys with 4 credential-gated staging journeys skipped, and `git diff --check`.

## Latest credentialed owner verification and safety fixes — `991d7e2`

- A live owner session was exercised read-only across dashboard, reception, members, memberships, plans, PT, CRM, payments, shifts, reports, automations, audit, support, and settings. All routes rendered their expected headings and no visible runtime, authorization, or data-loading errors appeared. Platform routes correctly returned the owner to sign-in.
- The deployed pre-fix build exposed a navigation boundary defect: `/memberships` marked both **Members** and **Memberships** active because the shared matcher used an unbounded prefix check. `navIsActive` now matches only the route segment or a descendant, with regression coverage shared by desktop and mobile navigation. A post-deploy visual check remains required.
- The cash-shift opening dialog no longer pre-populates or silently falls back to JOD 50.000. Operators must enter the counted opening float; invalid and negative values are rejected before the mutation. Focused schema tests cover blank, zero, valid, invalid, and negative amounts.
- Verification after the fix: 64 Vitest files / 379 tests, TypeScript typecheck, Convex typecheck, zero-warning lint, production build, Playwright preview suite (23 passed / 4 credential-gated staging journeys skipped), and `git diff --check` passed. No Production mutation, payment, member creation, shift opening, or email was performed.

## Production release alignment — integrated code `1f29af3`, handoff head `d200ba5`

- `origin/main` was confirmed at `cc717f8` after fetching and comparing concurrent branches. The TODO-006 branch was exactly one code commit ahead at `1f29af3`; `main` was fast-forwarded and pushed, then the living release handoff/evidence was recorded at `d200ba5`. The branch and `main` remain aligned at `d200ba5`; no unrelated partner or marketing branch was merged.
- Local gates passed at `1f29af3`: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm convex:codegen`, `pnpm lint`, `pnpm test` (51 files, 340 tests), `pnpm build`, `pnpm test:e2e` (23 preview journeys passed, 4 credentialed staging journeys skipped), and `git diff --check`.
- Final credentialed GitHub Actions run `31488471463` on `codex/todo-006-money-staff-evidence` at `d200ba5`, dispatched with `run_operational_flow=true` and `run_realtime_flow=true`, passed authenticated smoke, the routine membership/payment operational flow without an unnecessary reason, cleanup, two-browser realtime, and offline/reconnect. Main push run `31488715756` also passed static/typecheck/lint/unit/build, Convex codegen verification, and preview Playwright; its manual credentialed smoke job was correctly skipped because push events do not set the workflow inputs.
- Vercel Production deployment `dpl_Ai7fZ2X64q4eTNWrvW4DJspK89NC` is `READY` for the application-bearing integrated main at `d200ba5`. Errors-only build logs report completion; no Production runtime error clusters or error/fatal logs were found, and the canonical site returned HTTP 200.
- Convex Production was explicitly selected as `descriptive-meerkat-589`, not Development `fleet-otter-621`. The exact-target dry run from `d200ba5` completed schema validation with no index deletions; the matching Production deploy then completed with no index deletions. Production `health:check` returned `status: ok`. No seed, import, restore, product-data mutation, or destructive Production workflow was run.
- Read-only Production log checks found zero error-like events in the recent Convex history and no Vercel runtime errors for the release deployment. Realistic Production-volume/concurrency evidence remains intentionally deferred to TODO-007/staging; no Production-volume proof is claimed.

## Pilot completion and personal-training implementation — current release

The current release adds the approved gym-controlled PT domain without creating a trainer marketplace:

- Membership plans carry explicit included-session counts. Sales, renewals, immediate plan changes, and next-renewal successor terms grant term-bound credits; future-term credits cannot be booked early, included credits do not roll over, and introductory grants use an audited preview/apply workflow.
- Owners/managers can manage active trainer profiles, bilingual biographies, photos, 60-minute branch-specific availability, time-off exceptions, and fixed 12/20/30-session package tiers. Larger tiers cannot have a higher per-session price, and published trainers must remain active staff with the trainer role.
- PT package requests create unpaid charges and pending orders. Partial payment grants no sessions; full payment atomically activates a dated entitlement. Refunds are limited to unused sessions and use proportional integer-minor-unit arithmetic.
- The immutable PT credit ledger records grants, reservations, releases, consumption, expiry/revocation, refunds, and adjustments. Booking, cancellation, late cancellation, gym cancellation, no-show, completion, and rescheduling update entitlement counters transactionally and append member-timeline/audit facts. Trainer conflicts, member overlap, idempotency reuse, and concurrent credit overspending are rejected server-side.
- Gym staff have a `/pt` workspace and role-aware trainer dashboard. Member 360, My Gyms, gym detail, and public gym pages expose real PT balances, bookings, calendars, published trainers, and package requests. Trainers cannot receive gym-wide package orders or revenue in their workspace projection.
- Gym public profiles support bilingual draft/preview/publish/unpublish/version history, branches, amenities, plans, trainers, and publish-gated media. No ratings, popularity, revenue, or member counts can be owner-entered.
- Photos-only Convex storage validates and sanitizes JPEG/PNG/WebP images up to 5 MB. Member photos are private; gym/trainer media requires alt text and only enters public projections through publication. Replacement/archive retention remains scheduled and auditable.
- Marketing preferences use `explicit_opt_in`, `explicit_opt_out`, or `unknown`; historical missing/system defaults can be previewed and idempotently migrated to `unknown`, while unknown and opted-out marketing recipients are suppressed without blocking essential service messages.
- Operational email uses one durable queue for applications and service messages with leases, provider IDs, verified webhooks, deduplication, bilingual templates, and 1/5/30-minute retries. The worker implementation is complete, while global, tenant, and message-type activation remain disabled by default.
- A 15-minute PT reminder job deduplicates in-app/email reminders for sessions roughly 24 hours ahead. PT booking/package/low-balance events use realtime notifications and the durable message boundary.
- Finance/reconciliation evidence covers cash/card/CliQ-style methods, external references, partial/full payment, idempotency, overpayment, refunds, voids, signed variances, mandatory review reasons, receipts, and immutable audit facts.
- The release guard defines eleven production-shaped journeys plus separate realtime smoke, validates staging URL/host classification, assigns role storage states, rejects unknown dispatch names, creates unique run IDs, and attaches non-destructive cleanup ledgers. Membership-lifecycle and owner-settings bodies plus realtime-smoke are authored; nine product journeys remain release work.

Historical verification snapshot (preserved as evidence from the original PT release): 365 Vitest/Convex tests across 60 files, both TypeScript checks, zero-warning lint, Convex codegen consistency, `git diff --check`, all 23 credential-free browser journeys, and the 41-route Production build passed. The later 11 August baseline supersedes this count at **379 tests across 64 files** (recorded above under `991d7e2`); the older number is retained only to describe the release state at that time. Convex Production has been deployed and matched to the release; Vercel frontend deployment occurs after the `main` push. Live operational email, Production test-data seeding, and disposable Production verification remain disabled.

Still release-gated: the nine remaining staging journey bodies, credentialed PT/finance/reception coverage, upload accessibility coverage, approved anonymization deletion, live-email activation, and supervised disposable Production PT verification.

## Pilot-readiness implementation pass — `135a5f1` + `76a28a8`

The current head adds the largest post-pilot operational slice so far:

- The platform console now derives its overview, lifecycle counts, branch/member/staff totals, MRR, application/provisioning queue, support pressure, trial conversions, trial-expiry risk, invoice position, monthly invoice history, and immutable operator activity from persisted Convex facts. Unapproved health scoring is absent; card charging, payouts, settlement, and provider diagnostics remain explicit `Not configured` states.
- Platform subscriptions have reason-gated trial/active/past-due/suspended/cancelled lifecycle controls. The manual SaaS ledger can draft, issue, mark past due, record an offline payment, and void without pretending a card was charged. Every sensitive change preserves before/after state, reason, actor, correlation ID, and an immutable platform audit event.
- Gym staff can create support cases. Owners/managers see their tenant's cases; other active staff see their own. Platform operators can assign, reply, resolve, and reopen append-only conversations. Acknowledgements/replies enter the sandbox operational-email ledger.
- Owner, manager, sales, and receptionist dashboards now use role-specific persisted projections rather than generic or fabricated KPIs.
- Staff and platform navigation now includes a realtime, recipient-scoped notification center with unread state, mark read/unread/all-read, deduplication, expiry, and deep links. Application review, provisioning failure, staff-invitation failure, trial, support, check-in override, refund/void, cash variance, automation exhaustion, and past-due platform-invoice workflows create scoped notifications.
- The automation command center has persisted execution details, action/attempt history, previews, dedupe visibility, reason-gated forced runs, reason-gated retry, retry metadata, and sandbox-only delivery truthfulness.
- The operational email boundary persists language, template version, recipient reference, dedupe key, provider fields, attempts, 1/5/30-minute retry policy, next attempt, suppression/failure state, and timestamps. Trial, receipt, support, platform invoice, suspension, and cancellation messages are queued but remain suppressed by default; no live provider delivery was enabled.
- Production-visible invented names, dates, balances, support conversations, billing behavior, and landing-page membership facts were removed or converted to explicit unavailable/configuration states. The unapproved platform health-score concept was removed altogether. Seeded facts remain only in explicit mock preview mode.
- Platform subscription shortcuts now create an unmistakable local draft instead of implying a completed suspension/restore. The persisted action label does not reverse until an audited save succeeds; operators can cancel, are warned before leaving/reloading, and background subscription snapshots cannot overwrite an active draft.
- `next-env.d.ts` is no longer tracked because Next rewrites it differently for dev, Playwright, and build. Stable framework declarations live in `apps/web/next-types.d.ts`, so verification leaves Git clean.
- Exported Convex handlers now have persisted adversarial coverage for selected-branch/cross-tenant member and lead access, payment/refund/void gates, shifts, check-in overrides, staff role/branch privilege escalation, and immediate/next-renewal membership plan changes.
- Convex domain failures now emit redacted correlation diagnostics containing operation, request correlation ID, error name, and safe error code only. No request payload, provider response, secret, or personal contact field is serialized.
- Automation message actions use the shared marketing-preference boundary for email, SMS, and WhatsApp channel requests. Explicit member opt-outs are suppressed; manager/service notifications remain operational and are not treated as marketing consent.
- The realtime bridge closes stale watches on `offline`, preserves the last good snapshot, and reconnects immediately on `online`. An opt-in `convex-realtime-two-browser.spec.ts` staging journey and a manual CI switch cover credentialed cross-browser propagation without allowing Production writes.

Historical pass note: at the time `135a5f1`/`76a28a8` were written, Convex deployment plus the credentialed staging realtime/offline checks were pending. Current release status supersedes that snapshot: integrated code `1f29af3` deployed Convex without index deletion, and the authenticated staging smoke, disposable write cleanup, two-browser realtime, and offline/reconnect checks passed. Still open: nine independent production-shaped staging journey bodies, operational-email activation and delivery evidence, historical marketing backfill, TODO-007 realistic-volume/reconciliation evidence, dedicated read-only Production realtime observation, and any new Production mutation.

## Product surface preserved

The existing RIVET routes remain intact, including the public landing and gym directory, customer signup/discovery/My Gyms, platform console (including the protected `/platform/applications` review queue, tenant subscription controls, plan catalog editor, billing export, and searchable support inbox), gym dashboard, reception, members/member 360, memberships, plans, CRM pipeline and queues, payments/receipts/shifts, automations, reports, audit, and settings. The public `/signup` route now submits a reviewed gym application and remains usable with approved launch plan defaults during a catalog outage; gym workspaces are provisioned by RIVET and `/login/gym` is sign-in only for teams that have been given access. Clerk owner/staff invitations now land on the branded `/login/accept-invitation` route, which consumes the invitation ticket and creates or finalizes the invited identity before the normal role-aware handoff. The public discovery empty state explains the approval/publication lifecycle and links to the application route. `/members/import` remains the permission-gated CSV preview and resumable commit workflow.

The frontend still uses the established warm paper/ink visual system, Radix-based UI primitives, RTL logical properties, keyboard-friendly reception contract, `PageHeader`/`Gate` patterns, and TanStack Query hooks. The reception verdict summary now uses bounded responsive grid regions so long English/Arabic member names cannot collide with plan, expiry, visits, or balance facts. Its activity rail is an explicit tenant-local **Check-ins today** log rather than an inferred “in the gym” count; blocked attempts are excluded, successful visits stream in realtime, and signed-in members see the same identity-scoped visit dates, times, branch, and member name in My Gyms. CRM offers now remain drafts until staff explicitly confirms manual delivery, so the lead stage and “Offer sent” timeline cannot claim an undelivered message; the lead detail stepper also marks skipped trial milestones instead of treating enum position as historical fact. The public trial form waits for preview-session hydration before exposing editable fields, tracks its semantic gym/customer context, and preserves dirty visitor fields when identity or background marketplace data changes, preventing hydration or a late refresh from silently erasing a request before submission. No page makes a direct Convex or `fetch` call.

## Runtime modes

`apps/web/src/lib/api/client.ts` is the only client factory:

- `ConvexGymOSApi` is selected for production and all explicit `NEXT_PUBLIC_DATA_MODE=convex` runs.
- `MockGymOSApi` is selected only for non-production `NEXT_PUBLIC_DATA_MODE=mock` or the non-production default without a mode variable.
- Production always resolves to Convex, even if `NEXT_PUBLIC_DATA_MODE=mock` is accidentally present. Missing Convex configuration produces a configuration/auth failure; it never opens a seeded tenant.
- `resetDemo`, `setBehavior`, and persona switching are unavailable in Convex mode.

The page-facing seam is `apps/web/src/lib/api/GymOSApi.ts`. Query/mutation pages continue to use `useApiQuery`, `useApiMutation`, and `useInvalidate`; the adapter owns Convex operation names, public-ID mapping, pagination, and error conversion into `ApiError`.

Critical operational queries now use typed `GymOSApi` subscriptions for member/customer experience, applications/provisioning, platform snapshot/gym detail/support, CRM pipeline/lead detail/tasks/renewals, dashboards, reception occupancy/check-ins, transactions/shifts, automations, notifications, and the operational-email ledger. The reusable `useRealtimeApiQuery` bridge updates normal TanStack Query caches, keeps the last good snapshot during reconnect, disposes when tenant/branch/route/record keys change, closes stale watches on offline, begins 15-second polling only after stream failure, and stops fallback polling when the stream recovers. Focused hook tests cover live cache updates, snapshot preservation, disposal, offline, and reconnect; the isolated-staging two-browser and offline/reconnect browser checks are complete. A dedicated read-only Production realtime observation remains open.

The remaining one-shot TanStack queries now use a 15-second safety refresh rather than a four-second global request loop, and commercial mutation invalidation runs as one cache predicate pass instead of overlapping per-prefix refetches. Branch creation refreshes the authoritative workspace session, while membership-plan branch choices query the live branch list directly. These changes remove the stale post-creation branch list and reduce request contention after login without weakening realtime-backed screens.

## Authentication and tenancy

Clerk remains the credential/session provider. `ConvexClientProvider` supplies the authenticated Convex React client and claims/creates the current Convex user through `users.ensureCurrent`. `identity.current` resolves platform-admin status and all active organization memberships. The gym workspace obtains its session from the server, with organization selection available only when multiple active memberships exist.

Convex is authoritative for organization, branch, staff role, permission, and audit state. Every operational query/mutation calls the shared security helpers in `apps/web/convex/security.ts` to resolve the authenticated Clerk subject, active organization membership, role permissions, and branch scope. Cross-tenant records use non-disclosure `NOT_FOUND` behavior; deactivated users and inactive memberships lose access.

Member-only Convex operations now have persisted-fixture tests at the exported `domain.query`/`domain.mutate` boundary. Customer profile, My Gyms, trial, marketing-preference, and entry-pass ownership is resolved from the authenticated Clerk subject. When a migrated record contains both `customerUserId` and legacy `customerId`, the subject owner is authoritative and the profile ID is used only when no subject owner exists. Staff and platform administrators are denied member operations, anonymous legacy requests are not claimed by matching email, and foreign/inactive membership identifiers return non-disclosing `NOT_FOUND`. Trial creation accepts only an active/trial public directory gym whose target tenant and mapped branch are active; cross-gym, cross-branch, private, suspended, and inactive-branch requests fail before persistence.

Staff invitations are sent by the server-only Convex action in `apps/web/convex/invitations.ts`, and provisioning invitations use the same protected Clerk ticket redirect contract. `CLERK_SECRET_KEY` is never imported into browser code. Invitation requested/sent/failed events are audited. Tenant users cannot grant a role's permissions or branch scope beyond their own authority.

The seeded Forge Fitness reference scenario is created by the internal, idempotent `seed:seedDemoTenant` mutation. It includes the organization, two branches, roles, plans, members, memberships, charges, payment/receipt, check-in, CRM, automation, public directory, customer, platform, and settings records. It is not callable from product pages.

## Persisted domains

Convex schema and domain functions now cover:

- Organizations, branches, users, memberships, role definitions, settings, payment methods, tenant audit events, platform audit events, idempotency records, sequence counters, and public `gymApplications` records. The platform review queue records approval/rejection decisions in the immutable `platformAuditEvents` stream. A pending application does not create a tenant; protected RIVET provisioning creates the first branch, role definitions, owner access, subscription, and public directory record after approval.
- Plans, members, member imports, memberships/renewals/freezes/extensions/cancellations, charges, payments, receipts, shifts, check-ins, tasks, leads, offers, timelines, and approvals.
- Automation rules/templates/executions/attempts/message deliveries, scheduled evaluation, quiet-hour suppression, retry metadata, and daily deduplication.
- Public gym directory/catalog, customer profiles, customer memberships, trial bookings routed to gym-scoped leads, platform invoices/support cases, and server-signed short-lived entry passes. Linked trials now move through requested, confirmed, completed, no-show, cancelled, and converted states from the CRM lead. Completed/no-show outcomes create deduplicated follow-up work, customer-facing booking status updates from the same record, and every staff outcome appends a timeline plus audit event.
- Public gym detail now projects every active tenant branch and active membership plan from authoritative records rather than the provisioning-time listing snapshot. Trial scheduling is a branch/weekday opening-closing window: members choose any preferred time inside it, while Convex rechecks the active branch, weekday, window, future time, and one-open-request rule before persistence. Legacy exact-slot settings remain readable and are canonicalized on the next settings save.
- Platform subscription state and SaaS plan limits can be updated through platform-admin mutations. Updates synchronize the public directory/tenant record when available and append immutable platform audit events. Owner/manager reports compose persisted dashboard and transaction contracts and support CSV export; automation rules can be created from the existing UI with deduplicated task/message actions.
- Platform gym detail is a typed `platform.gym.detail` projection. It resolves the selected directory record to its target organization, owner membership, branches, scoped usage aggregates, and platform audit events; provider-backed billing and storage fields remain explicit `Not configured` states rather than preview values. The unapproved health-score field is no longer part of the projection or UI.
- Provisioned gyms publish a member-facing directory listing by default; platform administrators can hide or republish a listing from the gym controls. Existing production applications still require the normal approve → provision workflow before a real gym appears in discovery.
- CRM offers preserve their historical plan/price as drafts, expose a separate manual-delivery confirmation path with channel/reference/actor facts, and advance the lead to `offer_sent` only after that confirmation. Delivered offers now have explicit accepted/declined outcomes, immutable response timeline/audit facts, reason-gated declines that return to follow-up, and derived expiry presentation; lead conversion accepts the latest still-open delivered offer without duplicating a member. Provider-backed offer delivery, retries, and branded documents remain intentionally deferred.
- Member marketing preferences preserve the existing opted-in default while exposing source, timestamp/actor, and wording version metadata. Manual creation and lead conversion show the choice, imports are marked as imported, and staff-assisted changes append timeline and audit facts. Consumer profiles now persist a global member-owned preference plus append-only history in Convex; My Gyms exposes opt-out/re-enable controls and labels essential service messages separately. Channel-specific suppression, migration/backfill, and Production verification remain open.
- Membership plan changes are explicit typed operations across Mock and Convex. Next-renewal changes create a linked successor term; immediate changes require date-override authority and supersede the old term. Both use a full replacement-plan charge with no invented proration, and record reason, adjustment, timeline, and audit facts.

The normalized Convex `domainRecords` table stores JSON-shaped domain facts with direct organization/branch/member/lead indexes. Public UUIDs are stable at the `GymOSApi` boundary; Convex document IDs remain internal. This is an intentional adapter boundary, not permission for pages to consume untyped records.

## Domain guarantees

- Money is integer minor units with an ISO currency; JOD is formatted and validated at three decimal places.
- Timestamps are UTC. Business dates, same-day void rules, and dashboard/reconciliation windows use the tenant timezone.
- Membership status is derived server-side with precedence: cancelled → frozen → scheduled → expired → depleted → expiring ≤14 days → active.
- Check-in order is server-side: duplicate → inactive member → no membership → invalid term → frozen → depleted → wrong branch → warnings → allowed.
- Sales create immutable historical terms and linked charges; renewals create a new linked term.
- Plan changes create immutable successor terms with `previousMembershipId`, a required reason, explicit effective date, and a full replacement-plan charge. No automatic proration or credit is implied; immediate changes supersede the prior term with an auditable cancellation reason.
- Payment creation is organization/idempotency-key scoped and rejects key reuse with a different request hash. Receipt numbers advance from an organization counter and are never reused.
- Refunds and same-business-day voids are distinct additive facts. Sensitive actions require server-side permission and reasons and write append-only audit events with actor, branch, before/after, reason, and correlation ID.
- MVP approval semantics are explicitly post-action: refunds above JOD 25.000, over-limit discounts, and shift variances complete as immutable facts first; approval or rejection is a separate append-only review record and never rewrites settled financial history.
- A cash shift with exactly zero variance is balanced/closed and has no variance approval workflow; pending, approved, and rejected variance states are reserved for non-zero discrepancies.
- Entry passes are HMAC-signed, branch-bound, short-lived, stored in Convex, and consumed on a successful check-in. The Convex customer experience never exposes the old demo QR identity.
- Member imports require `members.write`, validate required columns, identify duplicate rows, persist a preview, commit in chunks of at most 100 rows, use per-chunk idempotency keys, and record audit facts. Invalid/duplicate rows are reviewable and skipped rather than silently created.
- Trial lifecycle transitions require `crm.write` and branch access. Cancellation/no-show outcomes require a reason; cancellation closes the lead, no-show creates a high-priority recovery task, completion schedules post-trial follow-up, terminal states cannot be reopened, and lead conversion marks the customer booking converted.

## Verification status

The current local verification is green for all credential-free product checks:

- `pnpm typecheck` — pass.
- `pnpm convex:typecheck` — pass.
- `pnpm lint` — pass with zero warnings.
- `pnpm test` — 433 tests passed across 79 files, including live public branch/plan projection, arbitrary trial-window booking, customer ownership, plan-branch refresh, the persisted branch-transfer/discount-approval matrix, and sale-dialog reason-gate coverage.
- `pnpm test:e2e` — 24 preview journeys passed; 9 credentialed staging journeys were intentionally skipped locally because the repository does not hold their trusted role session states and explicit staging switches. The staging-only realtime/offline specs require the documented explicit switches and never target Production.
- `pnpm build` — passed on Next.js 16.2.12 across all App Router routes.
- `pnpm convex:codegen` — the generated bindings remain unchanged because this slice does not alter the Convex schema or exported generic operation signatures. A fresh linked codegen command was blocked by the local network safety boundary and remains part of the connected deployment gate.
- `git diff --check` — passed.

On 11 August 2026, an explicitly authorized Production demo day populated the live pilot gym with three labelled demo members, two membership plans, three PT packages, two CRM leads, one support case, and one automation rule. The exercised ledger contains cash and card membership payments, a partial CliQ-style payment, a fully paid PT package, five receipts including a JOD 5.000 refund, a same-day void, and a balanced cash shift. Reception recorded allowed and outstanding-balance-warning check-ins; CRM contact/offer delivery, freeze/end-freeze, next-renewal plan change, public profile publication, PT entitlement activation, notifications, and audit/timeline updates were also exercised. The live owner report now renders persisted collections, check-ins, member growth, payment-method mix, refunds, and branch totals rather than empty charts. No real customer identity or external payment gateway was used; test contacts use clearly labelled example data.

The demo day found three product defects tracked canonically as BUG-017 through BUG-019: a scheduled next-renewal plan creates an immediately outstanding successor charge and displaces the active term in the member header; the public trial time selector can be empty despite configured operating hours; and inline card/CliQ membership collection lacked the external-reference field that the server correctly requires. BUG-019 is fixed locally with a conditional required reference field and typed adapter propagation. A fourth unsafe UI defect was also fixed locally: the membership-extension preview passed the number input's raw string into calendar arithmetic, so 14 days could preview 2029 instead of 2026. The dialog now normalizes the watched value, registers the input with `valueAsNumber`, and has a focused regression test. No incorrect extension was saved in Production.

Credentialed staging run `31488471463` on branch `codex/todo-006-money-staff-evidence` at `d200ba5`, dispatched with both workflow switches enabled, passed authenticated smoke, the routine membership/payment flow without an unnecessary reason, cleanup, two-browser realtime, and offline/reconnect. The ordinary `main` push run `31488715756` passed static/typecheck/lint/unit/build, Convex codegen verification, and preview Playwright; its credentialed smoke job was correctly skipped because manual workflow inputs are false on push. Playwright preview mode remains deterministic and uses `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`; trusted paths set it to `0`, use `NEXT_PUBLIC_DATA_MODE=convex`, and require the storage-state file.

Vercel Production deployment `dpl_Ai7fZ2X64q4eTNWrvW4DJspK89NC` is `READY` for the application-bearing integrated main at `d200ba5`; the errors-only build log reports completion, runtime error clusters are empty, and the canonical origin returned HTTP 200. Convex Production `descriptive-meerkat-589` was selected explicitly instead of Development `fleet-otter-621`; the exact-target dry run and matching deploy from `d200ba5` both reported no index deletions, and Production `health:check` returned `status: ok`. Read-only Convex history and Vercel error/fatal logs were clean. No Production seed, import, restore, or destructive money/staff/membership mutation was run.

The disposable Production application `Hashem Test` completed the full supervised path across 9–10 August 2026: submission, applicant confirmation, platform review, approval notification, tenant/first-branch creation, subscription assignment, Clerk organization creation, owner-invitation delivery, new-user account creation, profile completion, authenticated owner-workspace entry, first-owner settings, branch and plan creation, CRM lead conversion, membership sale, JOD 30.000 cash receipt, check-in, unified member timeline, sensitive-action audit review, and balanced shift close/reconciliation. The drawer closed at JOD 80.000 expected and counted with JOD 0.000 variance; daily reconciliation showed one JOD 30.000 cash payment; the audit recorded `shift.close`. The exact disposable tenant was then removed from the public directory and suspended through the audited platform controls. The supervised single-cash-path Production pilot is complete. The post-pilot platform-detail truthfulness and zero-variance labeling defects are fixed in implementation commit `06c5872` across the typed client, mock adapter, Convex projection, UI, and tests. BUG-012 passed credentialed Production verification on deployed head `6a3678b`: the selected tenant showed target-scoped organization, owner, branch, member, staff, automation, payment, subscription, and platform-audit facts, while provider-backed gaps rendered explicit unconfigured states. BUG-013 shift history passed the Production check with a **balanced** zero-variance row; commit `9931a4a` now suppresses the stale approval badge on the immutable legacy audit row, pending a read-only Production verification after deployment. The tenant was immediately resuspended, the public listing remained disabled throughout, and every restore/suspend save was audited. BUG-014 passed credentialed Production verification on `0eff62a`: `Hashem Test` remained present and filterable in the platform tenant directory with a working real detail route while its suspended/private record stayed absent from public discovery. BUG-015 is fixed locally in `76a28a8` with truthful persisted-vs-draft controls and a browser regression, pending a read-only Production UI verification after deployment. The branded invited-owner flow is covered locally and still needs fresh-owner and existing-user Production browser verification. Production verification findings and the engineering backlog are consolidated in the single canonical `docs/13_PRODUCT_AND_OPERATIONS_TODO.md`.

## Local and deployment commands

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm convex:typecheck
pnpm lint
pnpm test
pnpm test:e2e
PLAYWRIGHT_CONVEX_SMOKE=1 PLAYWRIGHT_CONVEX_OPERATIONAL_FLOW=1 PLAYWRIGHT_CLERK_STORAGE_STATE=/absolute/path/clerk-storage-state.json pnpm --filter web exec playwright test e2e/convex-operational-flow.spec.ts
PLAYWRIGHT_CONVEX_SMOKE=1 PLAYWRIGHT_CONVEX_REALTIME=1 PLAYWRIGHT_TARGET_CLASSIFICATION=staging PLAYWRIGHT_CLERK_STORAGE_STATE=/absolute/path/clerk-storage-state.json pnpm --filter web exec playwright test e2e/convex-realtime-two-browser.spec.ts
pnpm build
pnpm convex:codegen
pnpm convex:deploy
pnpm --filter web exec convex run seed:seedDemoTenant
```

Use `NEXT_PUBLIC_DATA_MODE=mock pnpm dev` for visual review. Use `pnpm dev:full` for a linked Convex development deployment. Before deployment, set `CLERK_FRONTEND_API_URL`, `ENTRY_PASS_SIGNING_SECRET`, `CLERK_SECRET_KEY`, and `RIVET_SITE_URL` in the Convex deployment through the CLI/dashboard. Configure the public Clerk key, server Clerk key, Convex URL, site URL, and other names from `apps/web/.env.example` in Vercel.

Vercel should use `apps/web` as the root directory and the Next.js server runtime. Schema/function rollback and application rollback are separate: use the Convex deployment backup/export workflow before data migrations and Vercel's deployment rollback workflow for application code. Do not rerun the seed over pilot data as a restore operation.

## External deferrals

The five-pillar release now includes server-owned workspace entitlements and owner-controlled module preferences. `docs/14_MODULAR_WORKSPACE_PLAN.md` still owns the unimplemented first-owner survey, later dashboard-block preferences, and premium-placeholder behavior. Final tier packaging, limits, grandfathering, downgrade behavior, and existing-tenant rollout still require product steering.

The Production Clerk instance, custom-domain DNS, Vercel environment split, Resend application mail, first platform administrator, invited-owner identity/workspace handoff, and supervised single-cash-path operating loop have been verified. The Production Convex public health query is active, but this checkout has only a Development deploy key. Deploy the renewal opt-in gate with the exact Production credential before treating the scheduled journey as safe. TODO-006's code-shaped money/staff matrix is complete at integrated code `1f29af3`, carried by the aligned `main`/branch handoff at `d200ba5`; realistic-volume/concurrency reconciliation evidence remains under TODO-007 and must be demonstrated in staging later, not fabricated from Production. The dedicated invited-owner route and platform tenant-directory visibility fix are implemented locally; before onboarding a real gym, run the two credentialed Production invitation cases and the hidden/suspended/cancelled directory check, then complete the remaining workflow/provider coverage in the canonical backlog. The platform gym detail now shows only authorized target-scoped facts; external SaaS billing and storage remain explicit `Not configured` capabilities until their providers are integrated, and no health score is exposed without an approved model. Google sign-in is intentionally deferred and is not required for email/password accounts. This repository deploys to Vercel only from `main`, so verify the production deployment after each configuration change. Email-template polish/deliverability and live WhatsApp/SMS delivery remain provider-bound follow-ups. No unapproved marketplace, mobile, biometric, or provider-backed billing surface was added.

## Files another agent should read first

1. `docs/10_CONVEX_INTEGRATION_COMPLETION_PLAN.md`
2. `apps/web/src/lib/api/GymOSApi.ts`
3. `apps/web/src/lib/api/ConvexGymOSApi.ts`
4. `apps/web/convex/platformGymDetail.ts`
5. `apps/web/src/app/platform/gyms/[gymId]/gym-admin-detail.tsx`
6. `apps/web/src/lib/domain/reconciliation.ts`
7. `apps/web/convex/security.ts`
8. `apps/web/convex/domain.ts`
9. `apps/web/convex/schema.ts`
10. `apps/web/convex/seed.ts`
11. `apps/web/convex/invitations.ts`
12. `apps/web/convex/platformProvisioning.ts`
13. `apps/web/convex/platformProvisioningAction.ts`
14. `apps/web/src/lib/providers/app-providers.tsx`
15. `apps/web/.env.example`
16. `apps/web/e2e/convex-operational-flow.spec.ts`
