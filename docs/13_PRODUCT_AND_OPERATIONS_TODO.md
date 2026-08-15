# RIVET product, engineering, and operations backlog

Updated 15 August 2026. This is the single canonical backlog for confirmed bugs, release blockers, missing MVP behavior, production-verification findings, deferred work, and closure evidence. It consolidates the former `docs/14_TODO_AND_BUGS.md`; do not create a second TODO file. Keep secret values, applicant details, and provider credentials out of this file.

## CRM read-path and realtime responsiveness — 15 August 2026

- [x] Released `c4d8ee06ead649b45b15b977af0d62b956a1225c` directly to `main` after the final partner fetch found no advancement. The frozen frontend handoff and modular product plan were preserved.
- [x] Reused existing `domainRecords` indexes for branch-scoped CRM/reception reads and member activity, and batched member, membership, task, transaction, and renewal projection lookups to remove repeated full-collection/N+1 work.
- [x] Removed the duplicate Convex startup query from native watches and moved reception occupancy/shift totals plus the CRM pipeline onto the shared realtime bridge with failure-only fallback polling.
- [x] Passed local gates: both typechecks, Convex codegen, zero-warning lint, 85 test files / 464 tests, 43-route production build, 25 local Playwright passes with 14 staging-gated skips, and `git diff --check`.
- [x] Verified Convex Production `descriptive-meerkat-589` with the exact-target non-verbose dry run/deploy. Schema validation passed, no indexes were deleted, the release has no `schema.ts` delta or destructive migration, and read-only `health:check` returned `status: ok`. The recent read-only log history had no post-deploy events.
- [x] GitHub Actions [31896227309](https://github.com/hashemnusair/Rivet/actions/runs/31896227309) passed static checks, generated-code verification, unit tests/build, and preview Playwright. The authenticated smoke was credential-gated/skipped. Vercel’s exact Production deployment [5LQi669RfXf14jyLKGqQ6jZCz5Lv](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/5LQi669RfXf14jyLKGqQ6jZCz5Lv) completed, and the canonical site returned HTTP 200.
- [ ] Observe Production Convex Database I/O and function-call usage for 24–48 hours and record the before/after trend; do not claim a measured reduction from code inspection alone.
- [ ] Complete credentialed isolated-staging execution and cleanup evidence for the five remaining bodies: `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`. No Production seed/import/restore/delete, product-data mutation, or live-operational email activation was performed.

## Production read-usage hardening — 15 August 2026

- [x] Released `cb2b73abef0eccaaf7c2b9ae79067265d501910e` directly to `main`, replacing broad 15-second background query polling with focus/reconnect refreshes for one-shot screens and preserving CRM/reception realtime subscriptions.
- [x] Switched the existing Follow-ups renewal queue to its realtime subscription; its 15-second fallback is used only after the live stream fails.
- [x] Added focused query-policy regression tests and passed the full local quality gates, including 85 test files / 464 tests and 25 preview browser passes.
- [x] GitHub Actions [31894165494](https://github.com/hashemnusair/Rivet/actions/runs/31894165494) and the exact Vercel deployment [Gger2SFEDmGhqoJ2mfEt1Rfji1A4](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/Gger2SFEDmGhqoJ2mfEt1Rfji1A4) completed successfully; the canonical site returned HTTP 200.
- [x] Confirmed this was frontend-only: no Convex schema/index/data change, Production deploy, seed/import/restore/delete, or live operational-email activation.
- [ ] Observe Production Convex Database I/O and function-call usage for 24–48 hours and record the before/after trend. If usage remains high, inspect the highest-reading functions before changing CRM realtime behavior.

## Latest direct-main release — support chat, CRM, PT packages, and member UX — 14 August 2026

- [x] Released `3c6ce09aac5c4dee71fe88c93116d78af0729a83` directly to `main` after preserving partner commits and the frozen frontend handoff. Two-way gym ↔ platform support chat, four-column lead drag/drop, expiring/expired follow-up filters, safe PT package deletion, and the simplified member home/per-gym journey are implemented.
- [x] Verified Convex Production `descriptive-meerkat-589` with the exact-target non-verbose dry run/deploy. No indexes were deleted; schema validation passed; the release commit added no schema delta. Read-only `health:check` returned `status: ok`, and recent read-only logs contained only expected unauthenticated guard events.
- [x] GitHub Actions [31834979651](https://github.com/hashemnusair/Rivet/actions/runs/31834979651) passed static checks, generated-code verification, and preview Playwright. Vercel’s exact commit check reports deployment [6cJ6gaK8LRFN9K1zLbTEUiyoM8S5](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/6cJ6gaK8LRFN9K1zLbTEUiyoM8S5) complete; the canonical site returned HTTP 200.
- [x] Ran isolated staging [workflow 31835407484](https://github.com/hashemnusair/Rivet/actions/runs/31835407484) with authenticated smoke, operational, realtime, owner-settings, and functional switches enabled plus `staging_journeys=all`. Smoke, membership lifecycle, realtime, and owner settings passed with disposable cleanup/policy restoration evidence. The Production-target guard was not bypassed.
- [ ] Complete the credential-gated functional staging run. The manager Clerk storage state is missing, so no functional body ran. The five bodies still awaiting execution are `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`; retain cleanup evidence for every disposable target.
- [ ] Add and execute isolated-staging concurrency proof for payment collection, PT cancellation, profile synchronization, and media publishing before claiming complete staging acceptance.
- [ ] No Production seed/import/restore/delete/product-data mutation or live operational-email activation was performed by this release.

## Gym profile media preview and finalization fix — 14 August 2026

- Direct-main release commit `0aa1599b14e81dcc06a81e47e09387beeff9f63a` is pushed to `main` and `origin/main`; the final fetch found no partner advancement. The frozen `FRONTEND_HANDOFF.md` and product-plan-only `docs/14_MODULAR_WORKSPACE_PLAN.md` were not changed.
- Logo, cover, and gallery selections now preview locally and are uploaded only when the operator saves the profile draft. Client validation covers JPEG/PNG/WebP, 5 MB maximum, and accessible descriptions; failed saves clean up newly uploaded pending assets, while discard clears local previews without mutating Production.
- Fixed the `media:finalizeUpload` Production error by sending `authorizeFinalize` only its declared authorization fields instead of the full upload argument object. Focused Convex and Settings regressions cover the server boundary and deferred-upload behavior.
- Convex Production `descriptive-meerkat-589` passed the exact-target non-verbose dry run/deploy with schema validation complete and no deleted indexes; the release has no `schema.ts` delta or destructive migration. The read-only health query returned `status: ok`, and recent logs showed only expected unauthenticated guard events.
- GitHub Actions [31807295256](https://github.com/hashemnusair/Rivet/actions/runs/31807295256) passed generated-code consistency, typecheck/lint/unit/build, and Playwright preview. The authenticated smoke was credential-gated/skipped. Vercel’s Production deployment for the same SHA completed successfully at [the deployed build](https://rivet-mqce4n2q8-nusairhashem04-gmailcoms-projects.vercel.app).
- Local gates passed: 83 test files / 456 tests, both TypeScript checks, Convex codegen, lint, production build, 24 Playwright passes with 14 staging-gated skips, and `git diff --check`. No Production product-data mutation or live operational-email activation occurred.

## PT package volume-pricing correction — 14 August 2026

- Direct-main release commit `11504b9583e5f7f40bc8edc5a4d1a7301d679781` is pushed to `main` and `origin/main`.
- The PT package editor now has one numeric sessions field and a visible price-per-session tracker. The suggested guide is 12 sessions / JOD 240 (JOD 20 per session), 20 / JOD 300 (JOD 15 per session), and 30 / JOD 400 (JOD 13.333 per session); arbitrary counts receive deterministic suggestions, and the total remains editable subject to the existing volume-pricing ladder.
- GitHub Actions [31803917097](https://github.com/hashemnusair/Rivet/actions/runs/31803917097) passed generated-code verification, typecheck/lint/unit/build, and Playwright preview. Vercel Production [completed the deployment](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/AjxuxEW8m2qGgf3hVj3K7vYU9ovU). The authenticated CI smoke remained credential-gated/skipped.
- No Convex schema/backend deployment or Production product-data mutation was required for this frontend/shared pricing correction. Existing package definitions and historical PT orders remain unchanged until an authorized operator edits a package.

## Release alignment — 14 August 2026

- Current direct-main implementation release is `a374f0e9ba31384e2b8a132995c9c18be973e26d`; the final pre-commit fetch found `origin/main` at `a61d0de`, so partner work was preserved. The frozen `FRONTEND_HANDOFF.md` and product-plan-only `docs/14_MODULAR_WORKSPACE_PLAN.md` were not changed.
- Vercel Production reports a completed deployment for the application SHA at [deployment status 36Zjw9Q6wAAoXjnQW8Epc5Cdksr7](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/36Zjw9Q6wAAoXjnQW8Epc5Cdksr7). Subsequent main commits in this handoff are documentation-only; their ordinary CI/Vercel redeploys were monitored and no application source changed after `a374f0e`.
- Convex Production `descriptive-meerkat-589` was dry-run and deployed exactly from `a374f0e` through the safe non-verbose wrapper. The dry run and deploy reported no index deletions; schema validation completed and only `customerProfileEvents.by_profile` and `customerProfileEvents.by_user_id` were added. The read-only health query returned `status: ok`, and recent read-only logs showed only expected unauthenticated guard events. The schema comparison to `eb82f8d` is additive/widening only; no destructive migration was proposed or run.
- The PT, CMS/media, shared-profile, multi-gym member experience, itemized-charge, and five staging-body implementation is released in code. Local gates passed with 83 test files / 453 tests, the production build, 24 preview E2E passes, and 14 local staging-gated skips.
- Manual staging run [31761753434](https://github.com/hashemnusair/Rivet/actions/runs/31761753434) used all requested switches and `staging_journeys=all`. Staging alignment, authenticated smoke, membership lifecycle, realtime, and owner-settings/trial-schedule passed; cleanup archived disposable members and restored the original policy. The functional gate stopped before writes because `PLAYWRIGHT_CLERK_STORAGE_MANAGER` is missing.
- The five formerly missing bodies are now authored/wired but still need credential-complete isolated-staging execution: `provisioning`, `reception-entry`, `automation`, `member-portal`, and `isolation/audit`. No functional journey writes occurred in the latest run. No Production seed/import/restore/delete, product-data mutation, or live operational email was performed.

## P0 — PT, CMS, and member experience completion — implemented; staging acceptance pending

- [x] PT packages are editable with one numeric sessions field, visible volume-pricing guidance (12/JOD 240, 20/JOD 300, 30/JOD 400), arbitrary positive session counts, pricing-ladder validation, archive status, branch access, and immutable historical order snapshots.
- [x] Pending PT orders support reasoned, audited, idempotent unpaid cancellation with atomic charge voiding; partial/full-payment paths remain on explicit refund/void flows.
- [x] Member-detail payment collection is charge-specific and bounded by that charge's outstanding balance.
- [x] Gym CMS media lifecycle supports validated logo/cover/gallery upload, draft/save/publish, preview, replacement/removal/order, alt text, eligibility messaging, and published-version cleanup protection.
- [x] Gym profile media selection previews locally and defers `finalizeUpload` until the draft save, preventing the prior server-error path during file selection.
- [x] Member-owned profile fields synchronize to linked gym records by verified identity without changing marketing consent or exposing cross-gym records.
- [x] Member experience is multi-gym and mobile-first with per-gym dashboard cards, branding, check-in totals, end-date/days-remaining facts, scoped activity, and an on-demand expiring QR dialog.
- [x] Focused Convex, mock, component, browser, and release-harness regressions are included.
- [ ] Configure the missing manager staging identity and run all five newly authored journeys against isolated staging; retain cleanup evidence for every disposable target.
- [ ] Add/execute isolated-staging concurrency proof for payment collection, PT cancellation, profile synchronization, and media publishing before claiming full release acceptance.

## P1 — Simplify CRM queues and clean up archived members — implemented and release-aligned

### Confirmed behavior

- [x] A self-service trial selected for a real gym/branch creates a tenant-scoped trial_booked lead automatically. A standalone RIVET member account has no gym context, so it does not create a meaningless unassigned lead.
- [x] Leads linked to archived members are excluded from Convex and mock lead lists. Missing converted-member links are also hidden after permanent deletion.
- [x] Follow-ups no longer duplicates trial work. Trial booking, completion, and sale decisions remain in Leads.
- [x] Leads now shows only active Trial and Membership sale work; closed Successful/Not successful outcomes remain available through lead/member history instead of the working board.
- [x] Follow-ups no longer renders a duplicate New & unassigned lead lane; it is limited to actionable tasks and renewal queues.
- [x] Convex and mock task projections hide closed-lead, archived/deleted-member, and dangling tasks, with persisted regression coverage before and after permanent member deletion.
- [x] Archived members can be filtered in the Members directory.
- [x] Permanent member deletion is owner/manager-only, requires an exact-name confirmation and reason, and is blocked by active/scheduled memberships, collectible balances, or future PT bookings. Financial, timeline, and audit facts remain immutable.
- [x] Lead list projection reads are batched to remove the per-lead branch/owner/timeline query multiplier; query caching avoids repeated refetches on every focus/remount.

### Remaining release work

- [ ] Review the archived-member list in the target gym and explicitly delete only the records the gym has approved for permanent removal. This pass intentionally performed no Production mutation.
- [x] Run the complete typecheck, Convex codegen/typecheck, lint, Vitest/Convex, build, and preview browser gates for this local change set. Credentialed staging specs remain gated on staging identities.
- [ ] Measure the slowest Production routes with browser performance traces and Convex logs before adding further caching or pagination changes.

## P0 — Simplify CRM and prevent member-only lead conversion — implemented and release-aligned

- [x] Replace the multi-stage offer/conversion journey with Trial → completed/not completed → membership sale successful/not successful.
- [x] Create a successful sale's member, membership, charge, included PT credits, timeline, and audit facts atomically.
- [x] Reuse one matching active legacy member and create only the missing membership; stop safely when multiple member records match.
- [x] Reject the old member-only conversion mutation so a won lead cannot be created without the membership sold.
- [x] Allow an existing branch-eligible plan or a custom name, price, duration, and included PT-session count during the sale.
- [x] Persist custom choices as real branch-scoped plans instead of unstructured member notes.
- [x] Remove offer controls and arbitrary stage dragging from the primary CRM; preserve historical offer facts without deleting data.
- [x] Rename the operator surfaces to Leads and Follow-ups and reduce the working board to two truthful active-work groups; keep closed outcomes in history.
- [x] Add persisted Convex, mock-adapter, and staging-journey coverage.
- [x] Deploy the matching Convex backend and Vercel frontend; exact Production and isolated-staging evidence is recorded in the release-alignment section above.
- [ ] Verify two disposable completed-trial sales against isolated staging: one using an existing plan and one using a custom plan. The final run was blocked before this body by the missing manager Clerk storage state.

## How to use this file

- `P0` blocks a trustworthy pilot or can expose data, money, access, or misleading system state.
- `P1` materially reduces operational quality but does not block the first supervised pilot.
- `P2` is a post-pilot improvement or an intentionally deferred product decision.
- `P3` is deliberately scheduled after functional, security, accessibility, and launch-critical work.
- `Confirmed` means the behavior was observed in code, a test, or a browser run.
- `Needs verification` means there is a credible risk or regression report, but it must be reproduced against the current head before changing behavior.
- Every fix must add or update a focused test and add its commit and evidence to the closure log.
- Update an item's status and evidence when it changes; never erase the history of a release blocker.

## P0 — Supervised disposable production onboarding — completed 10 August 2026

- [x] Accept the Clerk owner invitation in a private/incognito browser so the platform-admin and gym-owner sessions cannot mix.
- [x] Confirm the invited identity resolves to the provisioned `Hashem Test` organization with the `owner` role and the first branch.
- [x] Complete the first-owner setup: organization settings, branch details, and one membership plan.
- [x] Exercise lead → member → membership → cash payment → receipt → check-in with disposable data.
- [x] Confirm the member timeline contains conversion, profile creation, membership sale, payment, and check-in in chronological order.
- [x] Verify the relevant audit events, close the JOD 80.000 drawer without variance, and confirm daily reconciliation after reload.
- [x] Hide the disposable tenant from the public directory and suspend its subscription after verification. Completed for the exact `Hashem Test` target on 10 August 2026. Do not run `seed:seedDemoTenant` in Production.

## P0 — Complete cash-shift recovery and Production verification

### Observed problem

Opening the first Production cash shift succeeded in Convex, but the subsequent shift-page refresh crashed with `Cannot read properties of undefined (reading 'amount')`. The `shifts.current` operation correctly returns `{ shift, totals }`, while `ConvexGymOSApi.getCurrentCashShift` incorrectly cast that whole envelope to `CashShift`. The page therefore tried to read `openingFloat.amount` from the envelope instead of its nested shift. The mutation dialog briefly disappeared before the route failed, creating a confusing flicker and leaving the operator unsure whether the financial action completed. The global error boundary then falsely claimed the Production application was an in-memory demo where nothing could be lost, and its reset-only **Try again** action simply rendered the same malformed data again.

### Completion criteria

- [x] Unwrap the current-shift envelope at the Convex adapter boundary and cover both open-shift and no-open-shift responses with contract tests (`8e81bd4`).
- [x] Replace demo-only global error copy with Production-safe guidance that does not claim a mutation failed or succeeded without evidence, and provide working reload/back recovery actions (`8e81bd4`).
- [x] After deployment, confirm the already-open Production shift renders once with its JOD 50.000 opening float; Production verification passed on 9 August 2026.
- Verify duplicate-open attempts remain blocked with an inline `SHIFT_ALREADY_OPEN` error rather than a route crash.
- Keep the opening dialog in a stable pending/success transition until refreshed shift data is renderable; do not flicker back through stale content.
- Add focused UI coverage for open → refresh → render, mutation failure, ambiguous post-mutation recovery, duplicate open, and error-boundary recovery.
- [x] Resume and verify the membership sale, JOD 30.000 cash payment, receipt, and JOD 80.000 expected drawer total after the deployed shift page passed the recovery check.
- [x] Close the shift and verify reconciliation before considering the Production recovery complete. The JOD 80.000 expected and counted totals matched, daily cash collection was JOD 30.000, variance was JOD 0.000, and the append-only audit recorded `shift.close`.

## P0 — Fix first-time invited-owner account creation

### Observed problem

The Production owner invitation successfully carried a Clerk invitation ticket back to RIVET, but provisioning configured its redirect as `/login`. That route renders RIVET's custom password-only sign-in form and does not consume `__clerk_ticket` or branch on Clerk's `__clerk_status`. A first-time owner therefore sees a required password even though no account or password exists. The only visible account-creation link says **Create a member account** and drops the invitation query parameters. During production verification, the owner had to preserve the ticket manually while navigating to the existing account-creation route.

### Completion criteria

- Add a dedicated, branded **Accept gym invitation** route and use it for owner and staff invitation redirects.
- Preserve and consume the Clerk invitation ticket; never place the ticket in logs, analytics, screenshots, or repository fixtures.
- Handle Clerk's `sign_up`, `sign_in`, `complete`, expired, revoked, and invalid invitation states explicitly.
- For a new identity, say **Create your owner account**, collect the required profile fields, let the user set a password, and continue without exposing member-specific copy.
- For an existing identity, say **Sign in to accept your invitation** and preserve the invitation through authentication and verification steps.
- After acceptance, resolve the authenticated Convex membership, select the provisioned organization when necessary, and open the correct gym workspace automatically.
- Provide clear recovery actions for an email mismatch, an already accepted invitation, and an expired invitation.
- Add component and end-to-end coverage for new-owner signup, existing-user acceptance, query-parameter preservation, profile completion, and final owner-role routing.
- Treat this as a release gate before inviting a real gym owner.

#### Implementation status

- [x] Added the branded `/login/accept-invitation` route and changed protected provisioning invitations to land there instead of the generic member sign-in page.
- [x] Preserved Clerk's ticket/status query parameters, handled sign-up, sign-in, complete, expired, revoked, invalid, already-accepted, and email-mismatch states, and kept ticket values out of surfaced error copy.
- [x] Added the owner-specific profile/password form and finalized the Clerk ticket session through the current Clerk future-resource API; the existing role-routing handoff continues from `/login`.
- [x] Added focused schema, signup, sign-in, error-sanitization, and provisioning redirect tests. Local typecheck, Convex typecheck, lint, and 277-test unit suite pass.
- [ ] Run a credentialed Production acceptance with a fresh invited owner and an existing invited user, including profile completion and automatic owner-workspace routing. Keep the invitation release-gated until that browser check passes.

## P1 — Make application review notes explicit and auditable

### Observed problem

The application review textarea looks independently editable, but its value was only submitted when **Mark under review**, **Approve application**, or **Reject application** was clicked. There was no **Save note** action or save-state feedback. Once a decision was final, the textarea was disabled, so an operator could not add a follow-up note. During the 9 August production verification, the application was approved successfully but no review note was persisted.

### Completion criteria

- Add an explicit **Save note** action with saving, saved, failure, and unsaved-change states.
- Explain whether a decision button also saves the current note.
- Permit a platform administrator to append an internal note after approval/rejection without rewriting the original decision or its audit event.
- Treat post-decision notes as append-only platform audit facts with actor and timestamp.
- Warn before changing applications with unsaved text.
- Add unit/component coverage for independent save, decision-with-note, failure recovery, finalized applications, and authorization.

### Implementation status

Review notes now have an explicit save mutation with platform-admin authorization, audit before/after values, save feedback, clear-note support, and editing after approval or rejection. Background refresh no longer overwrites unsaved note typing. Production visual verification of an edited final note remains open.

## P1 — Make dashboard branch-scope copy data-driven

### Observed problem

The owner dashboard says **Both branches, consolidated** whenever the branch selector is set to **All branches**. That sentence is hardcoded from the original two-branch preview scenario. The disposable Production tenant has exactly one active branch, so the dashboard currently makes a false claim about the tenant's structure.

### Completion criteria

- Derive the dashboard scope description from the authenticated session's actual accessible branches and selected branch.
- For one accessible branch, name that branch or use accurate singular copy.
- For multiple accessible branches with no branch selected, use accurate aggregate copy such as **All 3 branches, consolidated**.
- For an explicitly selected branch, continue naming that branch.
- Define a safe empty/loading fallback that does not claim a branch count.
- Remove assumptions tied to the seeded Forge Fitness tenant.
- Add component coverage for zero/loading, one, two, and three-or-more accessible branches plus an explicitly selected branch.

### Implementation status

The hardcoded two-branch copy is replaced by `dashboardScopeDescription`, which handles selected, singular, aggregate, and loading scopes. Focused coverage now covers all four cases; the remaining work is visual verification in a real one-branch Production workspace.

## P1 — Fix lead-capture contact and owner fields

### Observed problem

The lead schema, API contract, persistence layer, detail screen, and duplicate-conversion checks support an optional email address, but the **New lead** dialog never renders an email input. A phone-only lead is valid and must remain supported, but staff currently have no way to capture an email when the prospect provides one. This weakens identity matching and prevents future email follow-up without editing the record elsewhere. The owner selector also appeared blank during Production testing even though the current gym owner was silently assigned and later appeared on the lead card; its option query only requests active salespeople and therefore cannot render the selected owner identity.

The dialog now keeps the current actor visible as an owner, includes active staff beyond salespeople when the caller can read them, and provides a real **Unassigned** choice. Server-side role/assignment authorization and the full email-field test matrix remain open.

### Completion criteria

- Add a clearly optional email field to **New lead**, with email autocomplete, normalization, validation, and accessible error text.
- Keep phone-only lead creation valid; do not make email mandatory.
- Persist and display the email in the lead context and carry it into the converted member record.
- Include both phone and email in duplicate detection without leaking cross-tenant matches.
- Ensure the owner selector visibly represents the value that will be saved. Include every legitimately assignable current user, or show a clear **Unassigned** value rather than silently persisting a hidden owner.
- Define which roles may own leads and which roles may assign them, then enforce the same rules in both the selector and server authorization.
- Define an authorized edit path for correcting or adding lead contact details after capture, with timeline/audit treatment appropriate to identity changes.
- Add tests for phone-only, phone-plus-email, invalid email, normalization, conversion, visible owner assignment, unassigned leads, and same-tenant/cross-tenant duplicate behavior.

## P0 — Make offer delivery and status truthful

### Observed problem

The original flow said **Create offer**, immediately persisted `status: "sent"`, and wrote **Offer sent** to the timeline even though it only created an internal record. That wording created a serious operational risk: staff could reasonably believe an offer reached a lead when nothing left RIVET. The implementation status below records the corrective draft/manual-confirmation slice; provider-backed delivery remains a separate follow-up.

### Implementation status

- [x] Offer creation now records an immutable-price **draft** and an `offer_drafted` timeline fact without advancing the lead to **Offer sent**.
- [x] Staff can explicitly confirm manual delivery through email, WhatsApp, SMS, or another channel; the actor, timestamp, channel, optional safe reference, lead stage, timeline, and audit event are recorded only after that confirmation.
- [x] Missing contact data and repeat delivery attempts are rejected; failed/unattempted delivery cannot display as sent.
- [x] Mock, Convex adapter, Convex domain, component-facing UI, unit, and browser coverage are aligned.
- [x] Delivered offers can be explicitly accepted or declined. Declines require a reason and return the lead to follow-up; acceptance, decline, expiry projection, and conversion preserve truthful timeline/audit state, and conversion never emits duplicate acceptance facts.
- [ ] Provider-backed delivery, stable branded offer views/documents, delivery retries/webhooks, and a customer-facing acceptance surface remain open work. Internal expiry enforcement and staff-recorded response outcomes are complete.

### Completion criteria

- Separate **Record/draft offer** from **Send offer**; never claim an offer was sent solely because an internal record was created.
- Let staff select an available delivery channel based on captured contact data, with a deliberate manual-delivery option when external messaging is not configured.
- For provider delivery, persist queued, provider-accepted, delivered, failed, bounced, and retried states as appropriate; expose failures and safe retries to the operator.
- For manual delivery, require an explicit confirmation and record who confirmed it, when, through which channel, and any safe external reference—without storing message credentials or sensitive provider payloads.
- Generate a stable, branded offer view/document with plan, historical offered price, expiry, gym identity, and clear acceptance/contact instructions.
- Keep offer price and plan history immutable after the offer is issued; later plan edits must not rewrite it.
- Append accurate lead-timeline and audit facts for creation, delivery attempt, success/failure, expiry, acceptance, and conversion.
- Add tests proving a failed or unattempted delivery can never display as **sent**.
- Treat this as a release gate before real sales staff use the CRM.

## P1 — Make CRM progression reflect actual events

### Observed problem

After a Production lead moved directly from **Contacted** to **Offer sent**, the lead stepper painted **Trial booked** and **Trial done** as completed even though no trial was booked or completed and no corresponding timeline facts existed. The UI currently treats every stage before the lead's current ordinal position as historical fact. That is misleading in a pipeline where valid paths can skip stages.

### Implementation status

- [x] Lead detail milestones now derive completed, current, skipped, and pending states from timeline, trial-booking, conversion, and delivered-offer facts rather than enum position alone.
- [x] Skipped trial milestones are visibly marked and announced to assistive technology; direct contact → offer paths no longer fabricate a trial history.
- [x] Added pure unit coverage for skipped-trial, completed-trial, and new-lead states plus a browser assertion in the CRM offer journey.
- [ ] Board counts, dashboard funnel semantics, and all historical stage transitions still need a shared event-backed contract and production visual verification.

### Completion criteria

- Define which pipeline stages are current state, which are optional milestones, and which require an actual domain event.
- Derive completed milestone presentation from persisted lead/timeline/trial facts rather than ordinal position alone.
- Permit valid paths such as contacted → offer sent without visually fabricating a trial.
- Preserve a clear current-stage indicator while distinguishing skipped, completed, and not-applicable milestones.
- Keep board counts, lead detail, dashboard funnel, timeline, and trial state consistent from the same source of truth.
- Add tests for straight-through, skipped-trial, completed-trial, lost, converted, cancelled-trial, and no-show paths.

## P1 — Fix Reception verdict-card collisions and responsive hierarchy

### Observed problem

During the duplicate-check-in verification in Production, the guard correctly blocked a second scan, but the result card's identity and membership-fact regions collided. The long name **Production QA Member** overflowed its shrinking flex column into the adjacent **Plan** heading/value, creating overlapping text and an unclear reading order. The current row gives the facts grid enough intrinsic width to squeeze the identity block below the width of an unbroken word.

### Implementation status

- [x] Replace the identity/facts flex row with bounded grid columns; stack the facts below the identity when the console is narrow.
- [x] Add long English/Arabic text wrapping, explicit RTL direction for the Arabic name, and non-overlapping action wrapping.
- [x] Add component coverage and a browser assertion at desktop and narrow tablet widths.
- [ ] Repeat the duplicate-scan check against the live Production tenant at laptop, tablet, phone, and large-text zoom sizes; retain the exact commit and screenshot in the pilot notes.

### Completion criteria

- Replace the fragile identity/facts flex sizing with an explicit responsive grid or bounded flex basis so neither region can overlap the other.
- Keep the member name readable with deliberate wrapping or truncation, while member number and phone remain visually attached to the identity.
- Move the fact grid below the identity when available width is insufficient; preserve a clean desktop layout at wider widths.
- Verify allowed, warning, blocked, overridden, and committed states with long English names, long Arabic names/RTL, large text zoom, and narrow laptop/tablet/phone widths.
- Keep action buttons reachable without colliding with identity, facts, reasons, or critical notes.
- Add a focused component regression test and a visual/browser assertion for the long-name duplicate-scan state shown during Production verification.

## P1 — Make the default marketing preference transparent and attributable

### Observed problem

The Production lead-conversion flow did not show a marketing-preference choice, while the resulting member record displayed **Marketing: Opted in**. RIVET's chosen product policy is to keep **Opted in** as the default for newly created members. The remaining product gap is transparency and provenance: staff and members should be able to see the default, change it easily, and distinguish a system-applied default from an explicit member choice.

The approved product decision is **Opted in by default** across manual member creation, lead conversion, and imports. An explicit **Opted out** choice must always be preserved. The implementation is aligned with that policy after an overlapping feature slice temporarily changed omitted values to opt-out. Consent provenance, wording/version, revocation history, and a member-facing opt-out flow are still required before marketing automation is enabled.

### Implementation status

The current vertical slice adds an attributable preference object to member details, preserves legacy boolean records with a compatibility `system_default` fact, marks imports as `imported`, shows the choice during lead conversion and manual member creation, and records staff-assisted changes in the member timeline plus audit stream. Member-facing withdrawal, channel-specific suppression, and campaign enforcement remain intentionally open.

### Completion criteria

- Keep **Opted in** as RIVET's consistent default across manual member creation and lead conversion unless the operator or member selects **Opted out**.
- Show the marketing preference clearly before member creation/conversion and never hide the value that will be persisted.
- Store preference status with provenance such as `system_default`, `staff_selected`, or `member_selected`, plus timestamp, actor where applicable, wording/version, and applicable channels; preserve later changes as append-only facts.
- Never describe a system-applied default as explicit consent or claim that the member actively selected it.
- Keep essential transactional/service messages separate from marketing preferences.
- Provide an obvious member-facing and staff-assisted opt-out path and apply the current preference before any campaign send.
- Make the default configurable by channel or market if a later compliance/product review requires different behavior; changing that configuration must not rewrite historical provenance.
- Add tests for omitted/defaulted, explicit false, explicit true, import, conversion, preference changes, cross-channel behavior, and authorization.

## P1 — Build a branded transactional-email system

### Observed problem

The production applicant-confirmation and approval messages deliver successfully but look like minimally formatted text emails. The Clerk organization invitation is also close to the provider default. The production invitation was categorized by Gmail as **Promotions**, and sender avatars were blank. Gmail category placement is ultimately decided by the mailbox provider, so it cannot be guaranteed, but authentication, sender reputation, message construction, and recipient behavior can be improved and measured.

### Email families in scope

- Gym application received — applicant confirmation.
- New gym application — internal RIVET sales/platform notification.
- Application approved/rejected.
- Clerk organization owner invitation.
- Gym staff invitations.
- Authentication and account-recovery emails.
- Future receipts, payment notices, renewals, and operational alerts.

### Design-system work

- Create a reusable, email-safe RIVET template system rather than composing separate HTML strings inside Convex actions.
- Use a restrained 600px layout, hosted RIVET logo, paper/ink/signal palette, clear hierarchy, one primary CTA, useful preheader, contact/help path, and consistent legal footer.
- Provide both HTML and plain-text bodies; keep the message small and usable with images disabled.
- Use table-based email layout and inline styles that render predictably in Gmail, Outlook, and Apple Mail, including mobile and dark-mode checks.
- Keep transactional language direct; do not make service messages resemble campaigns.
- Add rendered fixtures or previews to the repository for visual review and regression testing.

### Resend work

- Replace the current application email HTML builders with the shared template system.
- Use a monitored, reply-capable identity such as `support@rivetjo.com` or `hello@rivetjo.com` where appropriate instead of relying exclusively on `noreply@rivetjo.com`.
- Confirm the From, Reply-To, return path, DKIM, SPF, and DMARC alignment for every production message.
- Run Resend Deliverability Insights on each template.
- Disable open/click tracking for sensitive transactional mail unless there is a demonstrated operational need.
- Consider a dedicated transactional sending subdomain after reviewing reputation and alignment tradeoffs.

References: [Resend Deliverability Insights](https://resend.com/docs/dashboard/emails/deliverability-insights), [Resend DMARC guide](https://resend.com/docs/dashboard/domains/dmarc).

### Clerk work

- Customize the Production organization-invitation, staff-invitation, sign-in, verification, and recovery templates in **Clerk Dashboard → Emails**.
- Version the approved copy/layout in this repository even when the final template must be pasted into Clerk.
- Set the application logo URL and ensure the invitation redirect lands on the correct RIVET owner flow.
- Preview and test Development first, then copy the approved template to Production.

Reference: [Clerk email and SMS templates](https://clerk.com/docs/how-to/email-sms-templates).

### Sender identity and avatars

- Create or verify real Google Workspace identities/aliases for the public sender addresses (`noreply`, `sales`, `support`, and `invitations` as applicable) and assign the approved square RIVET avatar/profile image.
- Register relevant sender addresses with Gravatar for clients that support it.
- Treat BIMI as a later deliverability/brand project: it requires an enforced DMARC policy and, for Gmail logo display, an eligible VMC or CMC plus the required DNS and hosted assets.
- Do not assume an HTML logo controls the mailbox-list avatar; each mailbox provider applies its own identity rules.

References: [Resend sender-avatar guidance](https://resend.com/docs/knowledge-base/how-do-i-send-with-an-avatar), [Google BIMI setup](https://support.google.com/a/answer/10911320).

### Deliverability and Gmail categorization

- Inspect raw headers from Resend and Clerk test messages and record SPF, DKIM, and DMARC pass/alignment results without copying tokens or message IDs into the repository.
- Add the sending domain to Google Postmaster Tools and monitor reputation/spam rate once volume exists.
- Verify link domains match the visible RIVET sender domain and avoid redirect/tracking domains for invitation and authentication CTAs.
- Test Gmail Primary/Promotions placement across several established recipient accounts. Treat placement as an observed metric, not an invariant the application can force.
- Confirm reply handling, bounce/complaint handling, and suppression behavior before inviting real gyms.

Reference: [Google email sender guidelines](https://support.google.com/mail/answer/81126).

## P2 — Email operational controls

- Store provider delivery identifiers and final delivery/bounce/complaint state without exposing credentials.
- Add an operator-visible retry path for failed application and invitation notifications.
- Deduplicate retries so an operator cannot accidentally send repeated approval or invitation messages.
- Add template/version metadata to audit events so support can identify what a recipient received.
- Document provider ownership, DNS ownership, template ownership, and the safe key-rotation procedure in the release runbook.

## P3 — Final pre-launch performance and responsiveness sprint

### Scheduling

Run this as a dedicated, broad launch-hardening pass only after the product workflows, authorization, integrations, responsive behavior, accessibility, and release-critical defects are complete. Continue avoiding obviously wasteful patterns during normal feature work, but do not let speculative micro-optimization interrupt completion of the operational MVP.

### Observed problem

During the 9 August Production onboarding check, the owner navigated from branch settings to the audit log and waited roughly five seconds through a loading state before a single audit row appeared. Opening the empty one-lead Pipeline also took roughly five seconds. Opening that lead's detail screen took roughly five to ten seconds with no immediate navigation or loading feedback, making the application appear frozen. After successful lead conversion, the dialog closed and the stale lead page reappeared for several seconds, followed by a separate loading screen and finally the member record. Those waits and visual reversions are far too slow and unstable for routine operations. The current audit screen starts its staff-filter query and audit-events query on entry, while the Convex audit query collects and filters the organization's full audit stream before producing a page; the Pipeline, lead detail, and conversion transition similarly need their route, authenticated bootstrap, reference-data queries, domain queries, cache invalidation, and rendering paths measured rather than guessed. Both cold and warm navigation must be profiled.

The 10 August local Playwright run also reproduced a preview-only route-transition stall after member signup: the account/persona state committed and the browser requested `/customer/discover?_rsc=…`, but the RSC response did not complete before the test timeout, leaving the URL on `/customer/signup`. This reproduces with the pre-existing signup transition on the current head and needs route/RSC profiling rather than a blind redirect change.

### Required performance work

- Establish reproducible cold and warm baselines for every major owner, manager, salesperson, receptionist, member, and platform-admin route on realistic phones and laptops over realistic Jordan network conditions.
- Add privacy-safe Real User Monitoring for Core Web Vitals, route-transition duration, authentication/session readiness, Convex query/mutation latency, error rate, and long tasks. Never include member, payment, invitation, or credential data in telemetry.
- Define and enforce launch budgets for initial load, authenticated route transitions, useful-content paint, interaction latency, layout shift, JavaScript size, image/font delivery, and critical Convex operations. Treat a five-second routine route transition as a release failure.
- Provide immediate interaction acknowledgement for every navigation. If useful content cannot appear near-instantly, show an accessible pending indicator or route-level skeleton promptly so a click never appears ignored or frozen.
- Keep successful create/convert/sale mutations in one stable transition state until their destination is ready. Do not close a dialog back onto stale source content and then introduce a second loading phase; prefetch or seed the destination record where safe and use `replace` when returning to the completed source action would be misleading.
- Profile the full Clerk → Convex identity/session bootstrap and remove duplicated or serial readiness gates.
- Audit Next.js route and component boundaries, server/client rendering, streaming, Suspense placement, dynamic imports, bundle composition, hydration work, font/image loading, and accidental client-only waterfalls.
- Add deliberate route and data prefetching for likely navigation targets using Next.js link prefetch plus TanStack Query prefetching on safe idle, hover, or focus signals. Do not prefetch privileged data for an unauthorized identity.
- Reuse already-loaded session, branch, user-filter, settings, and other stable reference data with explicit freshness rules instead of refetching it on every screen.
- Replace broad mutation invalidation with precise cache updates/invalidation where correctness permits, while preserving cross-screen financial consistency.
- Inspect every high-traffic Convex operation for full-table/full-tenant collection, in-memory filtering, N+1 lookups, repeated public-ID translation, missing compound indexes, oversized payloads, and pagination performed after collection.
- Optimize the audit log specifically with index-backed filters and bounded pagination before mapping rows; avoid loading the staff filter as a blocker for the audit-event list.
- Add navigation and query performance regression checks to CI for representative data volumes, including tenants with large member, payment, timeline, and audit histories.
- Verify improvements in Production using both cold and warm sessions, record before/after measurements, and keep a small permanent performance budget suite so speed does not regress after launch.

---

## P0 — Release blockers and correctness risks

The stable BUG/TODO identifiers below were imported from the former `docs/14_TODO_AND_BUGS.md` so existing commits and discussions remain traceable.

### BUG-001 — Production Convex/Clerk/Vercel alignment is not fully verified

- Status: **Production frontend/backend alignment was reverified and deployed on 11 August 2026; configuration-regression monitoring remains ongoing**.
- Evidence: `main` was fast-forwarded to `009b1b8`; GitHub Actions run `31481872192` passed and Vercel Production deployment `dpl_5M3xaECxsTtqxEqcN1NfLNmQ3g2x` reached `READY` at that commit. Convex Production `descriptive-meerkat-589` (not Development `fleet-otter-621`) passed isolated dry-run/schema validation and deployment with no index deletions; health, Platform Overview/Gyms/Subscriptions, Support, and the empty notification center loaded from persisted facts. The documented 8 August recovery/export point remains the rollback reference. No Production product data was seeded, imported, restored, or mutated.
- Risk: alignment can regress after credential, domain, deployment, build, or environment-scope changes.
- Fix/acceptance: retain the value-free ownership/verification record in `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, rerun classification checks after relevant configuration changes, and record the exact deployed commit for every release. Never seed Production as a shortcut.

### BUG-002 — Authorization coverage is not yet adversarial at every Convex handler boundary

- Status: **Customer/trial focused slice completed; broader identifier families remain open**.
- Evidence: the new persisted-fixture `convex-test` suite invokes exported `domain.query` and `domain.mutate` handlers with authenticated Clerk identities. It proves subject-only profile resolution, customer/My Gyms/trial/membership isolation, entry-pass ownership, staff/platform denial, deactivated-user denial, inactive staff-membership transition, anonymous-request non-attachment, and stable `NOT_FOUND` behavior for foreign or inactive records. Payment, lead/offer/task staff workflows, refunds/voids, shifts, check-ins, role escalation, and the remaining Milestone 1 identifier families are still tracked under TODO-006.
- Risk: a UI gate or a helper can look correct while a direct authenticated mutation/query still accepts an out-of-scope identifier.
- Fix/acceptance: retain the completed customer slice and add authenticated allow/deny/cross-tenant/cross-branch tests for every remaining private identifier family. Test deactivated users, inactive memberships, branch scope, role escalation, and non-disclosing `NOT_FOUND` behavior. Fix each server boundary exposed by those tests.

### BUG-003 — Production-shaped release sequence is incomplete

- Status: **The supervised disposable-tenant sequence is complete; broader release coverage remains incomplete**.
- Evidence: the Production sequence verified application → provisioning → owner access → setup → CRM conversion → membership → cash receipt → check-in → timeline/audit → balanced shift close/reconciliation → audited listing removal and suspension. Staff invitation/roles, renewal, automation, member portal, alternate payment/refund/variance paths, and broader isolation remain incomplete.
- Risk: individual screens can pass while the real gym workflow fails at a handoff between domains.
- Fix/acceptance: retain the completed pilot evidence and add independently runnable, cleanup-safe staging journeys for the remaining paths using Development Clerk and isolated Convex only. Gate all mutations explicitly and report cleanup results.

### BUG-004 — Customer trial ownership must be proven through real authenticated mutations

- Status: **Resolved in the focused BUG-002/BUG-004 implementation slice**.
- Evidence: five focused handler tests execute the real exported Convex query/mutation boundary with persisted fixtures. They prove the Clerk subject owns the created booking regardless of supplied customer ID/email/membership/trial identifiers, My Gyms excludes foreign and anonymous records, the linked lead and booking persist only in the selected public gym and active mapped branch, and staff/platform/deactivated identities cannot use member-only operations.
- Risk: a caller could submit another customer's email or ID and attach a booking to the wrong person, or route a booking outside the selected gym/branch.
- Fix/acceptance: completed locally. Subject ownership now takes precedence over a legacy profile ID, trial creation rejects private/suspended gyms and inactive/cross-gym branches, inactive or foreign entry-pass memberships return non-disclosing `NOT_FOUND`, and intentionally anonymous stored requests remain unclaimed after sign-in. The explicit mock-mode unauthenticated preview behavior remains compatible through `GymOSApi`; Convex mode continues to require sign-in before trial submission.

## P0 — Confirmed user-facing and runtime issues

### BUG-005 — Trial success copy promises My Gyms persistence when the visitor is not signed in

- Status: **Resolved in `850454c`; production still needs a Convex-mode browser check**.
- Evidence: the public gym form displayed “Your booking is also saved under My Gyms,” while `/customer/my-gyms` correctly requires a member sign-in. In Convex mode, submitting while signed out redirects to login; in mock mode, the public preview could show the success state without a member session.
- Risk: a visitor believes the booking is attached to an account when it is only routed to the gym CRM, then sees an apparently missing booking after opening My Gyms.
- Fix/acceptance: the success copy and CTA now explain that an unauthenticated request was received by the gym and direct the visitor to sign in; authenticated requests still open My Gyms. Browser coverage exists for both authenticated and unauthenticated preview flows.

### BUG-006 — Member QR panel still labels the entry pass as a “Preview code”

- Status: **Resolved in `850454c`; production still needs a Convex-mode browser check**.
- Evidence: `apps/web/src/app/customer/my-gyms/[membershipId]/membership-detail.client.tsx` rendered “Preview code. In production this is a short-lived signed token,” while `CURRENT_STATE.md` says the Convex path already uses a short-lived HMAC-signed, branch-bound entry pass.
- Risk: members and gym staff cannot tell whether the QR shown in the live portal is a real usable credential.
- Fix/acceptance: the label is now runtime-aware, missing tokens show a retryable state, and preview wording is reserved for mock mode. Preview browser coverage exists; add the credential-gated Convex assertion during the production-shaped smoke.

### BUG-007 — Critical screens are polling, not truly realtime

- Status: **Implementation and approved staging evidence are complete; dedicated Production realtime observation remains open**.
- Evidence: the typed `GymOSApi` subscription seam now covers customer/member experience, platform applications/provisioning/snapshot/gym detail/support, CRM pipeline/lead detail/tasks/renewals, role dashboards, reception occupancy/check-ins, payments/shifts, automations, notifications, and operational-email attempts. `ConvexGymOSApi` uses native `ConvexReactClient.watchQuery`; `useRealtimeApiQuery` preserves the last good TanStack snapshot, closes watches on `offline`, reconnects on `online`, and uses bounded polling only after stream failure. Unit coverage verifies snapshot retention, disposal, and reconnect behavior. Before the `009b1b8` release, the authenticated staging smoke, disposable cleaned-up operational flow, two-browser realtime flow, and offline/reconnect flow all passed against the isolated staging target; `009b1b8` hardens their browser assertions.
- Risk: a dedicated read-only Production realtime observation is still absent, and broader production-shaped workflow coverage remains incomplete.
- Fix/acceptance: retain the staging-only two-browser and offline/reconnect journeys, record their target classification and cleanup evidence for each material realtime change, and add a read-only Production observation without creating product data.

### BUG-008 — Generated Next route types dirty the worktree during local dev and Playwright

- Status: **Resolved locally and verified on current main**.
- Evidence: running `next dev`/Playwright rewrote `apps/web/next-env.d.ts` from `./.next/types/routes.d.ts` to a mode-specific path such as `./.next-playwright/dev/types/routes.d.ts`. A typecheck before a successful build also reported a missing generated route module.
- Risk: routine tests create unrelated diffs, and a clean checkout may depend on generated `.next` files before `typecheck` is run.
- Fix/acceptance: `next-env.d.ts` is no longer tracked, and stable framework declarations are committed in `apps/web/next-types.d.ts`; generated `.next` output remains untracked. The current-main local typecheck, Convex codegen, lint, unit suite, Production build, and `git diff --check` completed without creating a worktree diff. Retain the CI clean-workspace assertion after preview/Playwright execution.

### BUG-009 — Login and role-routing regressions need permanent browser coverage

- Status: **Needs verification against current head**.
- Evidence: earlier browser reports described admin/team sessions flickering through member pages, an extra “Access platform” step, and role errors before reaching the correct dashboard. Recent tests cover sign-out transition and role restrictions, but not every Clerk identity-to-destination path.
- Risk: a valid gym owner, platform admin, or member can land on the wrong surface or see a misleading role error.
- Fix/acceptance: add trusted/mock browser tests for member → member dashboard, gym staff → gym dashboard, platform admin → platform console, forbidden direct URLs, sign-out → login, and cold-refresh hydration. Assert no intermediate wrong-dashboard content is visible.

### BUG-010 — Public gym application can fail closed with no selectable plan catalog

- Status: **Fallback implemented in `9931a4a`; Production verification remains pending**.
- Evidence: a browser run on `/signup` showed “Plans are not available yet” and disabled the application action, even though the UI is designed to show the public catalog. The page now keeps approved launch defaults selectable while the Convex experience provider is loading or in an error state.
- Risk: a temporary public catalog/Convex read failure blocks every new gym application instead of preserving a usable application path and clearly reporting the degraded dependency.
- Fix/acceptance: verify the live `public.catalog` query and the default-plan fallback in both Development and Production. If the catalog is unavailable, keep the approved fallback plans selectable when safe, show a non-blocking “catalog temporarily unavailable” notice, and add a retry/telemetry path. Add a browser test for catalog success, empty, timeout, and recovery.

#### Implementation status

- [x] Centralized the approved Starter/Growth/Pro launch defaults and resolve them whenever the live catalog is empty.
- [x] Kept the application form and submit action usable during loading/error states, with a visible degraded-catalog message and retry control.
- [x] Added focused success/fallback resolver coverage; live catalog timeout/recovery and Production browser verification remain open.

### BUG-011 — Provisioning retry/idempotency after an external Clerk failure needs fault-injection coverage

- Status: **Needs verification; the known Clerk slug failure is fixed**.
- Evidence: provisioning previously failed with Clerk `organization_slugs_disabled` (fixed in `5a7622e` by removing the requirement for Clerk slugs). The protected action now records `failed` state and exposes retry, but there is no end-to-end test that retries after a partial Clerk organization/invitation response without duplicating the workspace, owner membership, invitation, or audit facts.
- Risk: a transient Clerk/API failure can leave an approved application stuck, create duplicate organizations/invitations on retry, or make the UI report success before Convex state is complete.
- Fix/acceptance: add a deterministic fault-injection test around organization creation, owner invitation, and finalization. Retry must converge to one organization, one branch, one subscription, one owner membership, and one invitation; each failure must remain auditable with a correlation ID and an actionable operator message.

### BUG-012 — Platform gym detail renders fabricated operational and billing facts

- Status: **Resolved in `06c5872` and verified in Production on deployed head `6a3678b`**.
- Evidence: the `Hashem Test` Production gym detail correctly loaded the target gym header, branch, plan, subscription status, and public-listing control, but the same page displayed a hardcoded account owner, email pattern, phone, storage usage, automation count, transaction count, subscription renewal/card details, platform health score, and July activity. `apps/web/src/app/platform/gyms/[gymId]/gym-admin-detail.tsx` constructs these values directly in the component; branch member counts and staff usage are also estimated from unrelated formulas rather than authoritative records.
- Risk: a platform administrator can mistake invented data for real tenant identity, billing, usage, or activity, contact the wrong person, or make a Production decision using fabricated evidence. The presentation resembles a cross-tenant leak even though inspection confirmed static placeholders.
- Fix/acceptance: remove every fabricated value from the Production platform route. Introduce an authorized, typed platform-gym detail contract backed by the selected organization, owner membership, real usage aggregates, platform ledger/subscription facts, and platform audit timeline. Render an explicit **Not available** or **Not configured** state for fields that are not implemented; never estimate or synthesize operational facts. Add tests using at least two tenants that prove identity, branches, member/transaction counts, subscription data, and activity remain target-scoped, plus a browser assertion that no preview person, card, invoice, or activity copy appears in Production mode.

#### Implementation status

- [x] Added the authorized `platform.gym.detail` API contract and Convex platform-admin query. It scopes organization, branches, owner membership, active members/staff, automation rules, payment records, plan limits, and platform audit events to the selected gym's target organization.
- [x] Replaced the detail page's owner, health, usage, billing, invoice, and activity placeholders with real target-scoped values or explicit **Not available**/**Not configured** states. No preview owner, card, invoice, July activity, or estimated branch/staff fact remains on the route.
- [x] Added two-tenant projection tests, adapter/mock scope tests, and a browser assertion for the selected gym detail surface. The local full gate passed: 267 unit tests, 21 preview journeys, typechecks, lint, and build.
- [x] The credentialed Production browser assertion passed on deployed head `6a3678b`. The selected tenant showed the provisioned owner identity, one real branch, one active member, one active staff member, zero automations, one payment transaction, its Starter/suspended subscription state, and real platform activity. Health, storage, recurring billing, renewal, payment-method, and invoice fields rendered explicit **Not configured** states; no preview owner, card, health score, or July activity remained.

### BUG-013 — Balanced shifts are labeled “variance approved”

- Status: **Shift-history fix verified in Production on 10 August 2026; legacy audit-badge compatibility fixed in `9931a4a` and awaiting read-only Production verification**.
- Evidence: the supervised `Hashem Test` shift closed with JOD 80.000 expected, JOD 80.000 counted, and JOD 0.000 variance. The audit correctly recorded `shift.close`, but shift history displayed **variance approved** because `apps/web/src/app/(app)/payments/shifts/page.tsx` prioritizes `varianceApprovalStatus === "approved"` without first checking that the variance amount is non-zero.
- Risk: staff may believe a manager approved a discrepancy that never existed, weakening reconciliation semantics and audit confidence.
- Fix/acceptance: display **balanced** or **closed** whenever variance is exactly zero; reserve pending/approved/rejected variance labels and review controls for non-zero discrepancies. Align mock and Convex projections, add focused zero/positive/negative variance tests, and verify history plus audit copy together.

#### Implementation status

- [x] History rendering and review controls now check the numeric variance before any approval status, so zero is always **balanced** and cannot be reviewed as a discrepancy.
- [x] Mock and Convex close projections now use no approval workflow for zero and pending approval only for positive or negative discrepancies; zero, positive, and negative tests cover the server and UI state helpers.
- [x] Credentialed Production shift history passed after a supervised temporary restore: the closed row showed JOD 80.000 expected, JOD 80.000 counted, JOD 0.000 variance, **balanced**, and no review action. The tenant was immediately resuspended and its public listing remained disabled.
- [x] Suppress the stale approval badge for immutable, zero-variance `shift.close` events at the audit presentation boundary while retaining approval badges for `shift.close_variance` and other genuinely reviewed actions. Added focused legacy and reviewed-variance tests; no append-only event was rewritten.
- [ ] Repeat the read-only Production audit check against the deployed `9931a4a` build.

### BUG-014 — Hidden or suspended gyms disappear from the platform tenant directory

- Status: **Resolved and verified in Production on 10 August 2026**.
- Evidence: the known suspended `Hashem Test` tenant was absent from **Platform → Gyms** under both **All** and **Suspended**, while its authorized direct detail URL still loaded correctly. Code inspection confirmed that the platform-admin directory calls `useMarketplaceGyms()` and therefore inherits the public marketplace filter that excludes `isPublic: false` organizations.
- Risk: removing a gym from public discovery can also make it unreachable from the platform administrator's normal tenant-management navigation, including when the operator needs to restore a suspended tenant or inspect an unpublished applicant workspace.
- Fix/acceptance: add a dedicated authorized platform-tenant directory operation that returns every permitted tenant regardless of public-listing state. Keep the public marketplace query filtered for member/public discovery only. Add multi-tenant tests proving that hidden, suspended, and cancelled tenants remain visible and filterable to platform administrators while staying absent from public discovery; retain working links to the authorized detail route.

#### Implementation status

- [x] Added a shared public-directory filter that keeps member discovery limited to public active/trial gyms while preserving hidden, suspended, overdue, and cancelled records for platform use.
- [x] Added `usePlatformGyms()` as the platform-only boundary and switched the platform gym and subscription screens to consume it. Hidden records are labeled **not public** and cancelled records receive danger styling.
- [x] Added filter tests covering public exclusion and platform retention for hidden, suspended, and cancelled records.
- [x] Credentialed Production verification on `0eff62a` confirmed the suspended/private `Hashem Test` tenant was absent from `/customer/discover`, present under Platform → Gyms with its suspended/not-public state, and reachable through the authorized real-data detail route. The tenant remained suspended and private after the check.

### BUG-015 — Suspend/restore shortcuts imply a saved change before controls are persisted

- Status: **Implemented in `76a28a8`; read-only Production UI verification pending**.
- Evidence: on the Production gym-detail page, clicking the top-right **Suspend** or **Restore access** shortcut immediately changes the subscription selector and reverses the shortcut label, making the tenant appear suspended/restored. The change is only a local draft until the operator separately clicks **Save controls**; leaving the page before that save preserves the previous server state.
- Risk: a platform operator can reasonably believe access was suspended or restored when no mutation or audit event occurred, potentially leaving a gym active unintentionally or telling an owner access was restored when it was not.
- Fix/acceptance: keep persisted state visually distinct from draft state. Either make the shortcut an explicit confirmed mutation, or retain the two-step workflow with clear **Unsaved changes — click Save controls to apply** feedback, a cancel/revert action, navigation protection, and shortcut copy derived from persisted rather than draft status. Never show a success toast, completed-state label, or reversed action until the server confirms the save. Add component/browser coverage for draft, save success, save failure, cancel, navigation-away, and background-refresh behavior.

#### Implementation status

- [x] The shortcut and its label are derived from the persisted subscription status; clicking it changes the selector but does not reverse the completed-state action label.
- [x] Unsaved drafts show explicit feedback, require an audit reason before save, support cancel/revert, prompt on internal navigation, and install a browser unload warning.
- [x] Realtime detail snapshots do not overwrite an active local draft; successful saves clear draft protection before refreshing the authoritative projection.
- [x] Preview Playwright verifies draft feedback, disabled save without a reason, persisted-state shortcut copy, and cancellation/revert.
- [ ] Verify the deployed Production UI without saving or mutating a real tenant.

## P1 — Missing or incomplete MVP behavior

### Reception and member attendance history

- Status: **Implemented locally; Production verification pending**.
- The reception rail now shows the tenant-local check-in count and the complete accepted-attendance log for today, rather than estimating who remains inside from a 90-minute window.
- Blocked entry attempts remain available to authorized operational records but are not counted as visits.
- The authenticated customer projection derives visit history from the same persisted check-in records by member ID. My Gyms shows recent visits immediately after login, and membership detail shows weekday, date, time, branch, and the member name used at check-in.
- Focused component and exported Convex tests cover the new reception wording, date/accepted-entry filtering, authenticated customer ownership, blocked-attempt exclusion, and member history rendering. Verify one disposable check-in across simultaneous reception and member sessions after deployment.

### TODO-001 — Membership upgrade and downgrade are not explicit API operations

- Status: **Implemented for the supervised pilot; production verification pending**.
- Evidence: the contract exposes sale, renewal, freeze, unfreeze, extension, cancellation, and transfer, but no dedicated plan-change operation.
- Risk: staff cannot safely change a member's plan while preserving historical terms and reconciling price differences.
- Implementation: `changeMembershipPlan` now exists in the typed API, mock adapter, Convex adapter, and server mutation. It requires a reason, creates an immutable successor term, records a `plan_change` adjustment, timeline event, and audit event, and supports next-renewal or permission-gated immediate changes. Both paths charge the replacement plan at its full integer-minor-unit price; RIVET does not invent proration or an automatic credit/refund. Immediate changes supersede the old term with an auditable cancellation reason.
- Remaining acceptance: exercise both effective-date paths against a disposable Production member, confirm the old/new terms and charges after reload, and verify the permission boundary for immediate changes.

### TODO-002 — Activate and verify operational messaging safely

- Status: **Live worker deployed disabled-by-default; activation and credentialed delivery evidence remain release-gated**.
- Evidence: operational email now shares one durable Resend boundary with leases, provider IDs, idempotency keys, verified webhook outcomes, redacted failures, and bilingual lifecycle templates. WhatsApp/SMS remain disabled, and email stays suppressed unless every activation boundary permits it.
- Risk: renewal reminders, trial confirmations, payment receipts, expiry alerts, and retry behavior are not yet a real-gym communication system.
- Fix/acceptance: configure the exact staging sender/webhook, obtain owner category confirmation, activate selected essential categories, and prove accepted/delivered/transient-retry/terminal-failure paths without replaying historical suppressed attempts. Production activation still requires explicit approval.

#### Implementation status

- [x] Persist message kind/template version, language, recipient reference, dedupe key, provider ID, attempts, redacted failure, next retry, suppression, and queued/provider-accepted/delivered/failed state.
- [x] Encode the initial attempt plus retries after 1, 5, and 30 minutes, with per-message-type activation settings and sandbox suppression as the default.
- [x] Route trial, payment-receipt, renewal/expiry, support, invoice, and subscription lifecycle message intents through this boundary.
- [x] Implement the leased Resend worker, provider acceptance persistence, verified webhook outcomes, terminal-failure notification, and safe activation policy.
- [ ] Configure and approve one isolated staging delivery policy, then collect provider/webhook/retry evidence before enabling any Production message type.

### TODO-003 — Member documents/profile photos are not represented in the operational contract

- Status: **Needs product decision / likely P1**.
- Evidence: member notes, tags, and emergency contacts exist, but there is no approved document/photo storage workflow in the current API contract.
- Risk: gyms that require an ID or waiver cannot keep that record beside Member 360.
- Fix/acceptance: only implement after deciding retention, file type/size, access scope, and Convex storage policy. Add signed upload/download authorization, audit events, and deletion/retention rules. Do not store sensitive files in arbitrary JSON.

### TODO-004 — Discovery empty state needs an operational explanation

- Status: **Implemented in `9931a4a`; Production listing verification remains pending**.
- Evidence: Production can correctly show “No RIVET gyms are live yet” while no tenant has completed approve → provision and public-listing publication. The public catalog plans can still load.
- Risk: visitors may interpret an intentionally empty catalog as a broken backend.
- Fix/acceptance: keep the safe empty state, but explain that gyms appear after approval and publication, provide a clear application CTA, and add a platform/admin verification that provisioning publishes a listing. Do not seed fake Production gyms.

#### Implementation status

- [x] The public directory empty state now explains the approve → provision → publish lifecycle and links directly to **Send a gym application**.
- [x] Added a focused empty-state action regression test; verify the real Production listing/public-directory path after the next deployment.

### TODO-005 — Error handling can silently hide background failures

- Status: **Implemented locally; credentialed offline/reconnect browser verification remains open**.
- Evidence: provider/background refresh code contains deliberate `.catch(() => undefined)` paths for some snapshots and refreshes.
- Risk: the UI can remain stale without a visible retry or diagnostic state, especially when Convex or Clerk is temporarily unavailable.
- Fix/acceptance: classify expected unauthenticated/empty cases separately from network/configuration failures; preserve the last good data, surface a non-blocking stale/retry indicator, and log redacted correlation context server-side. Add offline/reconnect tests.

#### Implementation status

- [x] Experience-provider refreshes now retain the last rendered snapshot after a transient failure, keep the route in its ready state, and show a non-blocking retry notice.
- [x] Initial hydration still fails closed with the existing actionable error state; focused tests cover both first-load and post-hydration failures.
- [x] `useApiQuery` now masks background refetch failures from full-page `isError` gates while retaining `isBackgroundError`; `AppProviders` shows a global active-query stale notice with a retry action. Focused tests cover both initial and post-hydration query failures.
- [x] `useRealtimeApiQuery` now preserves the last good cache snapshot, switches to bounded polling only after stream failure, stops polling after recovery, and disposes the previous subscription on tenant/branch/route/record key changes.
- [x] Add redacted server-side correlation logging at the shared Convex domain boundary; logs include only operation, correlation ID, safe error name, and safe error code.
- [x] Add unit coverage for last-snapshot retention, listener disposal while offline, and immediate reconnect after `online`.
- [ ] Run the browser offline/reconnect journey against isolated staging and verify no duplicate listeners or stale full-screen loading state.

## P1 — Security, finance, and audit hardening

### TODO-006 — Expand real-handler isolation tests across money and entry flows

- Status: **Code-shaped matrix complete in integrated code `1f29af3`; realistic-volume/concurrency evidence remains under TODO-007/staging**.
- Scope: the customer profile/My Gyms/trial/entry-pass slice is complete. Persisted exported-handler evidence now covers routine payment collection, refund/void reason and replay paths, non-zero shift-variance review, check-in overrides, member/lead/offer/task identifiers, invitation role/branch escalation, post-state-change deactivation, concurrent two-tenant writes, branch transfers, and discount approvals.
- Evidence: `apps/web/convex/domain.money-staff-matrix.test.ts` proves the branch-transfer allow/forbidden/cross-tenant/cross-branch/inactive/deactivated/reason/idempotency/immutable-timeline-and-audit matrix. The discount matrix proves zero-discount routine sales remain ungated, within-limit approvals, over-limit post-action pending review, authorized approval/rejection with reasons, forbidden/cross-tenant/cross-branch/deactivated actors, whole-sale replay safety, and immutable before/after/reason evidence. `apps/web/src/features/membership-actions/sale-dialog.test.tsx` proves listed-price/today sales remain ungated while only actual price/date variance exposes and requires `overrideReason`; ordinary payment/member/lead/check-in paths remain ungated.
- Acceptance: each code-shaped family has allow, forbidden, cross-tenant, cross-branch, deactivated-user, reason-required where applicable, idempotency/replay where applicable, and immutable-audit assertions. Routine actions must not acquire a reason gate merely to satisfy this matrix. The full code-shaped matrix is closed; Production-volume/concurrency proof is explicitly not claimed here and remains a TODO-007/staging milestone.

Current evidence also covers exported platform invoice/subscription/support/notification/automation handlers with persisted identities, reason gates, audit assertions, recipient isolation, and idempotent dedupe. The completed TODO-006 matrix adds real payment/refund/void/variance records, duplicate payment-audit prevention on replay, same-day void replay, post-write deactivation rechecks, concurrent two-tenant member-number allocation, replay-safe membership transfers, and replay-safe discount-sale/payment/approval evidence. Cross-tenant resources return non-disclosing `NOT_FOUND` after the caller reaches the authorized resource boundary; an attempted explicit foreign organization selection without membership remains `FORBIDDEN`.

#### Reason-gate policy (verified at the handler and relevant UX boundary)

- A non-empty reason is required for subscription suspension, refunds, voids, price/date overrides, non-zero variance close and review decisions, permission changes, destructive membership changes, and forced automation actions.
- A reason is not required for routine member/lead creation, standard check-in, listed-price membership sale, ordinary payment collection, contact logging, or task creation.
- New members remain opted in by default; this policy does not alter the existing marketing default.

### BUG-016 — Owner “Needs attention” treats ordinary cash-shift lifecycle as an exception

- Status: **Resolved locally in the PT/email/settings safety slice; deployment verification remains open**.
- Evidence: the owner dashboard builds `alerts` from every reconciliation audit category, so ordinary `shift.open`/balanced `shift.close` events can appear in **Needs attention**. At least one rendered item exposes the raw audit UUID instead of a useful operational detail.
- Risk: owners are trained to ignore genuine exceptions, and an internal identifier leaks into an executive-facing surface.
- Resolution: the owner projection now includes only unresolved pending approvals in **Needs attention** and uses a human review detail rather than an entity identifier. Routine `shift.open` and balanced `shift.close` events remain available through the audit/timeline record, not the exception rail. Add persisted dashboard normal-versus-exceptional coverage before marking deployed verification complete.

### Pilot-readiness safety resolutions — PT, email, profile, and settings (2026-08-12)

- **PT outcomes:** Complete, no-show, and gym cancellation now open an accessible confirmation with member, trainer, session time, and a stated credit consequence. Completion remains ungated; no-shows and cancellations require a meaningful reason in both UI and handler/mock boundaries. The fabricated `Cancelled by gym team` reason has been removed. PT payment queue rows now show member/package/payment context with a member link instead of a raw charge ID.
- **Email ownership:** tenant settings expose only gym-controlled member service categories. RIVET platform invoices, past-due/suspension/cancellation, and account-access notices are mandatory and bypass tenant preferences. Prior-minus-next set comparison requires a reason whenever any category is removed, including a same-count swap; enable-only and no-op changes remain ungated. Convex independently enforces the same rule. The durable worker is implemented with leases, provider acceptance, verified webhooks, and three transient retries after the initial attempt. It remains off unless the global live switch, provider configuration, owner confirmation, and relevant tenant/global category allowlist all permit the message.
- **Profile and settings UX:** shared fields prefer existing child ids, generate ids only for known id-forwarding controls, and avoid false custom-control associations. Profile uploads have named file/alt-text controls without raw enum announcements; category/audience/amenities use constrained choices; the settings tablist scrolls rather than wrapping. Dirty profile edits disable Publish and guard internal links, Settings-tab changes, and browser unload with explicit Save/Discard/Stay choices.
- **Persisted media lifecycle:** backend commit `a58166b` stores gym-profile uploads as pending with a 24-hour expiry, promotes only assets referenced by a saved draft, deletes explicit discarded uploads immediately, and lets scheduled cleanup delete abandoned storage after the browser is gone. Persisted Convex tests cover the database and storage lifecycle.
- **Evidence still required:** run the exact branch against isolated staging for PT role/credit concurrency, then perform read-only deployed visual verification of the reviewed Settings surfaces. No Production email or tenant/product-data mutation is authorized by this slice.

### BUG-017 — Next-renewal plan changes create an immediately outstanding charge

- Status: **Fix deployed in `0cea424`; supervised Production workflow verification pending**.
- Evidence: scheduling `Pilot Card Member` from `Pilot Monthly` to `Pilot Quarterly` for 11 September created the expected scheduled successor term and PT-credit schedule, but also exposed the full JOD 120.000 successor charge as the member's current outstanding balance and included it in today's owner report. The report therefore showed JOD 170.000 outstanding instead of the JOD 50.000 currently due from the two active pilot terms.
- Risk: reception may collect a future renewal early by mistake, entry warnings and owner receivables are overstated, and the member header presents the scheduled term as the primary account state.
- Resolution: future renewal invoices are created immediately with issue/due dates but are non-collectible before the successor term begins. They render separately as upcoming, are excluded from current balance/entry/outstanding/receivables projections, direct early payment is rejected in Convex, scheduled-term cancellation voids the unpaid charge, and the active term remains primary. Handler, projection, mock-adapter, and charge-policy regressions cover the behavior; deployed browser verification remains required.

### BUG-018 — Public free-trial form can render no selectable times for configured operating days

- Status: **Fix deployed in `0cea424`; signed-out/member Production verification pending**.
- Evidence: the published pilot gym displayed persisted Sunday–Thursday 06:00–23:00 and Saturday 07:00–22:00 hours, but the public trial form's time selector contained no options for a Thursday date.
- Resolution: owners/managers now configure a weekday trial-request opening and closing time per branch, using the same interaction pattern as operating hours. Members may choose any preferred time inside that window. Convex canonicalizes legacy exact-slot data, validates that each enabled window sits inside operating hours, revalidates the submitted branch/date/time, and enforces one open request per customer and gym. Public directory branches and active membership plans are now projected from live tenant records rather than the original provisioning snapshot, so later branches/plans remain visible. Focused settings, arbitrary-time, customer-ownership, plan-branch, and public-projection regressions are in place; deployed signed-out/member verification remains required.

### BUG-025 — Future freezes are treated as active immediately

- Status: **Fix deployed in `0cea424`; supervised Production lifecycle verification pending**.
- Evidence: membership status previously treated any active freeze row as current even when its start date was in the future.
- Resolution: effective status now evaluates the freeze start/end dates; past freeze starts and overlapping scheduled/current freezes are rejected, and early unfreeze is limited to a freeze currently in progress. Convex, mock, and pure status regressions cover scheduled and active boundaries.

### BUG-019 — Inline membership collection cannot capture required card/CliQ reference

- Status: **Fixed locally after Production reproduction on 2026-08-11; deployment verification pending**.
- Evidence: `Sell membership` allows `Collect payment now` with card or CliQ, but exposes no external-reference input. The server correctly rejects the sale with “An external reference is required.” The separate `Collect` dialog does expose the field and succeeds.
- Fix/acceptance: the inline form now shows and requires the external reference for card, bank-transfer, and CliQ collection, passes it through the typed sale/renewal contract, and keeps the mock adapter aligned with Convex validation. Focused component and adapter tests pass; verify one non-cash inline sale after deployment.

### BUG-020 — Public-profile publish can ignore newer unsaved edits

- Status: **Resolved in the 12 August reviewed Settings hardening pass; deployed read-only verification pending**.
- Evidence: Publish is unavailable while the local form differs from the persisted draft or while save/discard is in flight. A focused regression saves one draft, creates newer local edits, and proves the stale persisted draft cannot be published.
- Remaining operator check: after the matching Vercel release is ready, open the real Settings profile read-only, make a local-only edit, verify Publish remains disabled, then use **Stay** or **Discard and leave** without saving.

### BUG-021 — Abandoned public-profile uploads can outlive the browser draft

- Status: **Resolved and deployed in backend commit `a58166b`**.
- Evidence: gym-profile uploads persist as pending with a 24-hour server expiry, save promotes referenced assets, explicit discard deletes pending unreferenced storage immediately, and scheduled cleanup deletes expired storage even after the browser is gone. Persisted Convex tests exercise the database and storage lifecycle.

### BUG-022 — Internal navigation can drop unsaved public-profile edits

- Status: **Resolved in the 12 August reviewed Settings hardening pass; deployed read-only verification pending**.
- Evidence: Settings-tab changes and same-origin internal links are guarded with explicit **Save and leave**, **Discard and leave**, and **Stay** outcomes. Focused tests cover all three outcomes; browser unload remains protected separately.

### BUG-023 — Operational-email disable reasons were inferred from array length

- Status: **Resolved across UI, mock parity, and Convex in backend commit `a58166b` plus the matching frontend release**.
- Evidence: prior-minus-next set comparison requires a reason for disable-only and same-count swap changes while enable-only and no-op changes stay ungated. Exported-handler tests prove direct backend mutations cannot bypass the rule. External delivery remains off by default and independently guarded by the live switch, provider configuration, owner confirmation, and category allowlist.

### BUG-024 — Shared Field labels can target the wrong or nonexistent control

- Status: **Resolved in the 12 August reviewed Settings hardening pass**.
- Evidence: an existing child id takes precedence; generated ids are limited to native controls and known id-forwarding Input/Textarea components; untrusted custom controls receive no invented label target. Focused accessibility tests prove label-click focus and absence of false associations.

### TODO-007 — Complete supervised finance/reconciliation evidence

- Status: **Cash, card, CliQ-style, partial balance, partial refund, same-day void, PT charge, receipts, and balanced reconciliation are verified in Production; non-zero variance review, realistic volume, and concurrency remain open for staging/TODO-007**.
- Scope: open shift, opening float, cash/card/CliQ-style configured payments, partial balance, receipt, refund/void review, close shift, expected-vs-counted cash, manager variance decision, daily reconciliation.
- Evidence to date: the 9–10 August cash pilot remains valid. On 11 August, a second explicitly labelled demo day verified three active members; cash/card/CliQ-style membership collection; a JOD 20.000 partial CliQ balance; receipt generation; allowed and outstanding-balance-warning check-ins; a JOD 100.000 opening float; JOD 145.000 expected/counted balanced close; a JOD 5.000 partial cash refund; same-day CliQ void; and a fully paid JOD 240.000 card PT package that atomically granted 12 purchased credits alongside 2 included credits. The final report correctly excluded the void and showed JOD 330.000 gross completed collections plus a JOD 5.000 refund (JOD 325.000 net). The separate JOD 120.000 future-plan charge overstates current outstanding and is tracked as BUG-017.
- Acceptance: the credential-gated `finance-reconciliation` browser body now creates a disposable unpaid membership, records card-reference and cash partial payments, closes an intentional non-zero variance, requires manager approval, archives the member, and preserves immutable financial/audit facts through its cleanup ledger. It still must be executed against isolated staging; realistic-volume reconciliation, rejection, payment concurrency, and cross-browser finance propagation remain open. Volume/concurrency proof must be generated against an isolated staging dataset with documented load results rather than inferred from this Production demo day.

### TODO-008 — Verify automation scheduling, deduplication, quiet hours, and retries end to end

- Status: **Scheduler/command coverage implemented locally; credentialed staging journey remains open**.
- Scope: expiry/follow-up trigger, task creation, sandbox message attempt, daily dedupe key, quiet-hours suppression, retry metadata, and manager notification.
- Acceptance: one trigger produces one action per dedupe window; retryable failures do not report false success; audit/execution records remain queryable.

The UI/API now expose persisted execution/action/attempt history, dedupe keys, suppression and retry metadata, reason-gated previews/forced runs/manual retries, immutable audit facts, and manager attention notifications. Scheduler tests now run the internal evaluator twice to prove one execution per dedupe window, verify manager notification fan-out, and suppress opted-out marketing messages. Existing command tests verify retry limits/reason gates and the pure scheduler tests cover quiet-hour boundaries. The remaining acceptance work is a credentialed scheduler-driven staging journey covering quiet hours and transient retry recovery.

### TODO-009 — Record marketing-preference provenance and revocation history

- Status: **Member-facing preference/history slice implemented; channel scope, migration, and Production verification remain open**.
- Evidence: RIVET intentionally defaults new members to **Opted in** across manual creation, lead conversion, imports, and consumer profiles, while explicit opt-out remains supported. Member details now expose source, timestamp/actor metadata, and wording version; staff edits create a `marketing_preference_changed` timeline fact and an immutable audit event. Imports are marked `imported`, while omitted legacy booleans are surfaced as a `system_default` compatibility fact. The member My Gyms surface now separates promotional updates from essential service messages, lets the member opt out or back in, and shows an append-only preference history. Convex stores the consumer preference and history globally by authenticated user, outside a gym tenant.
- Risk: historical profiles still need an explicit migration/backfill decision before withdrawal can be treated as a complete operational guarantee, and live provider delivery is still disabled by policy.
- Remaining acceptance: define migration/backfill treatment for historical records, verify opt-out behavior in Production, and retain clear service-message exceptions. Never describe the system default as explicit consent.
- Implementation checklist:
  - [x] Persist consumer preference metadata and append-only history in Convex; keep the mock adapter behaviorally aligned.
  - [x] Add member-facing opt-out/re-enable control and readable history with current-state labeling.
  - [x] Apply the preference at the shared automation message boundary for email, SMS, and WhatsApp requests; explicit opt-out suppresses the message while operational/service notifications remain separate.
  - [x] Add `explicit_opt_in`, `explicit_opt_out`, and `unknown`; migrate historical missing/system defaults to unknown without fabricated consent facts.
  - [x] Add migration preview counts, bounded idempotent apply batches, progress/failure state, and immutable audit summary.
  - [ ] Run a disposable Production member verification and document the migration/backfill decision.

### TODO-011 — Complete PT staging and Production acceptance

- Status: **Core domain, adapters, UI surfaces, notifications, and handler tests implemented; credentialed acceptance remains open**.
- Scope: trainer profile/publication, availability/time off, included and purchased credits, partial/full payment, member/staff booking, cancellation/no-show/completion/reschedule, proportional unused-credit refund, realtime balances, and deactivation safety.
- Acceptance: the credential-gated `personal-training` browser body now reserves a real member credit, verifies the assigned trainer view in a second browser, cancels, and verifies credit restoration with cleanup evidence. It still must be run against isolated staging and expanded to owner/manager package setup, foreign-tenant denial, package-payment activation, outcome/no-show, and concurrency before any separately approved disposable Production PT path.

### TODO-012 — Complete all registered production-shaped staging journeys

- Status: **Safety/dispatch/role/cleanup harness complete; all five formerly missing product journey bodies are now authored and wired, but credential-complete execution remains open. The latest isolated-staging dispatch passed membership-lifecycle, realtime-smoke, and owner-settings, then stopped before functional writes because the manager Clerk storage state is not configured.**
- Registered journeys: provisioning, owner settings, staff authorization, trial/CRM, membership lifecycle, reception entry, finance/reconciliation, automation, member portal, isolation/audit, and personal training. A separate `realtime-smoke` is also registered. The owner-settings body persists a valid branch trial time, reloads it, and restores the prior schedule through its cleanup ledger.
- Acceptance: each journey uses unique markers, correct role files, audited archive/deactivate/unpublish/suspend cleanup, and refuses Production. The combined dispatch requires owner, manager, salesperson, receptionist, trainer, member, platform-admin, and foreign-tenant Clerk states plus an isolated invitation inbox template. Provisioning, reception-entry, automation, member-portal, and isolation/audit are now implemented but unexecuted; each must still pass against the exact isolated staging deployment before additional Production mutation. The latest run archived disposable members and preserved/restored the operational policy; it stopped before functional writes at the missing manager-state credential gate.

### TODO-010 — Verify application review-note editing in Production

- Status: **Implemented locally; Production verification pending**.
- Evidence: platform review notes now save independently, remain editable after final decisions, support clearing, and write platform audit before/after snapshots through both Convex and the mock adapter. Background application polling no longer resets unsaved text.
- Fix/acceptance: use a disposable Production application to save, edit, clear, and reload a final review note; confirm the audit event and note survive the refresh. Do not use a real gym application for this test.

## P2 — Deliberately deferred until after the first pilot

- Modular owner-selected workspace pages, first-owner survey, later dashboard-block preferences, and premium placeholders are specified in `docs/14_MODULAR_WORKSPACE_PLAN.md`. Implementation is deliberately paused for owner steering; no tier entitlement matrix has been approved.
- Full class schedules, capacity, waitlists, and no-shows.
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
| Production cash-shift render crash | 2026-08-09 | `8e81bd4` | 236 unit/component tests, both typechecks, lint, and production build passed; Vercel deployed the fix; the existing Production shift then rendered its JOD 50.000 float and later reconciled one JOD 30.000 cash payment into a JOD 80.000 expected drawer. Final shift close remains open under TODO-007. |
| BUG-005, BUG-006 | 2026-08-09 | `850454c` | 238 unit tests; 7 public-experience Playwright tests passed, including authenticated/unauthenticated trial confirmation and preview QR wording. Convex-mode production assertion remains release-gated. |
| Historical provisioning slug failure | 2026-08-09 | `5a7622e` | Clerk organization creation no longer requires the optional Clerk slug feature; the internal RIVET organization slug remains stable. Retry/idempotency coverage remains open as BUG-011. |
| Historical public plan-catalog fallback | 2026-08-09 | `55cead9` | Approved launch defaults keep the public gym application usable when editable catalog rows are absent; production success/timeout/recovery coverage remains open as BUG-010. |
| Dashboard scope and CRM capture slice | 2026-08-09 | `2269863` + `1bd4b05` | 248 unit tests, 19 preview Playwright journeys, typecheck, Convex typecheck, lint, and production build passed after merging branch-aware dashboard copy, lead email capture, explicit unassigned-owner handling, assignment authorization, and cash-shift error-path coverage. Production one-branch visual verification and TODO-009 preference provenance/revocation remain open. The overlapping opt-out default was subsequently realigned to the product owner's opted-in default decision. |
| Application review notes | 2026-08-09 | `8c0d34f` | 249 unit tests, 19 preview Playwright journeys, typecheck, Convex typecheck, lint, and production build pass. Notes can be saved, cleared, edited after final decisions, and audited; disposable Production reload verification remains required. |
| Supervised disposable Production pilot | 2026-08-10 | Production deployed head plus operator evidence | `Hashem Test` completed application, approval, provisioning, owner invitation/account creation, settings, branch and plan setup, CRM conversion, membership sale, JOD 30.000 cash receipt, check-in, unified timeline, sensitive-action audit review, JOD 80.000 balanced shift close, daily reconciliation, public-listing removal, subscription suspension, and audited platform-control save. BUG-012 and BUG-013 capture defects discovered during cleanup. |
| BUG-012 | 2026-08-10 | `06c5872` deployed in `6a3678b` | 267 unit tests across 27 files, 21 preview Playwright journeys passed with 2 trusted Convex journeys skipped without credential switches, typecheck, Convex typecheck, lint, build, and diff check passed. GitHub Actions run `31378028265` and the Vercel Production deployment passed. Credentialed Production verification showed only target-scoped tenant facts and explicit provider configuration gaps; no fabricated preview owner, billing, health, or activity data remained. |
| BUG-013 implementation slice | 2026-08-10 | `06c5872` deployed in `6a3678b` | Zero/positive/negative variance tests passed in Convex, mock, and UI reconciliation helpers. Credentialed Production verification confirmed the shift-history row is **balanced** with JOD 0.000 variance and no review action. The immutable pre-fix `shift.close` audit event still renders a generic **approved** badge; audit compatibility presentation remains open under BUG-013. |
| Invited-owner acceptance flow | 2026-08-10 | `947e4d2` | Dedicated branded Clerk ticket route, owner signup form, existing-user sign-in finalization, explicit expiry/revocation/mismatch recovery, owner/staff provisioning redirect coverage, and cancelled/hidden platform-directory handling. Local 277-test suite, typechecks, lint, production build, and targeted invitation/filter tests pass. Credentialed Production fresh-owner, existing-user, and directory visibility acceptance remain required. |
| BUG-014 | 2026-08-10 | `947e4d2` | Platform-only directory hook/filter preserves hidden, suspended, overdue, and cancelled tenants while public discovery stays filtered; 2 focused filter tests pass. Credentialed Production directory/detail verification remains required. |
| BUG-014 Production verification | 2026-08-10 | deployed `0eff62a` | The suspended/private `Hashem Test` tenant remained absent from public discovery, appeared under Platform → Gyms with the correct state, and opened its authorized target-scoped detail. It was left suspended with public listing disabled. The separate unsaved shortcut behavior is tracked as BUG-015. |
| BUG-010 / TODO-004 / BUG-013 presentation slice | 2026-08-10 | `9931a4a` | 283 unit tests across 32 files, typecheck, Convex typecheck, lint, and diff check passed. Public applications retain approved fallback plans during catalog failure, discovery explains the empty publication state with an application CTA, and historical balanced-shift audit rows no longer show a false approval badge. Production read-only checks remain required. |
| TODO-005 experience refresh recovery slice | 2026-08-10 | `110b0d3` | 285 unit tests across 33 files, typecheck, Convex typecheck, and lint passed. Initial live-data failures remain explicit; post-hydration failures preserve the last good snapshot and expose a retry notice. Broader operational-query and offline/reconnect coverage remains open. |
| TODO-005 operational query recovery slice | 2026-08-10 | `4a6eaea` | 287 unit tests across 34 files, typecheck, Convex typecheck, lint, and the full unit suite passed. TanStack Query operational screens now preserve loaded snapshots after background refetch failures, expose `isBackgroundError`, and show a global retry notice; offline/reconnect browser coverage and redacted server-side logging remain open. |
| TODO-009 member preference/history slice | 2026-08-10 | `0e42018` | 291 unit tests across 35 files, typecheck, Convex typecheck, lint, diff check, and production build passed. Consumer preference metadata, append-only history, member opt-out/re-enable UI, and mock/Convex adapter coverage are implemented. Channel enforcement, migration/backfill, Convex Production deployment, and Production member verification remain required before closing the item. |
| BUG-002 / BUG-004 customer ownership slice | 2026-08-10 | This focused commit | Both typechecks, lint with zero warnings, Convex codegen/typecheck, the 304-test/37-file unit suite, the focused 8-test public-experience Playwright suite, the full 22-pass/2-environment-gated-skip Playwright suite, the 39-route production build, and `git diff --check` passed. Five persisted-fixture exported-handler tests cover subject-only identity, hostile IDs/email, cross-tenant My Gyms data, selected-gym/active-branch routing, private/suspended/inactive targets, staff/platform/deactivated denial, inactive membership behavior, anonymous transition isolation, and non-disclosing `NOT_FOUND`. Broader Milestone 1 identifier families remain under TODO-006; Production was not mutated or deployed. |
| Pilot-readiness platform operations pass | 2026-08-10 | `135a5f1` | 324 tests across 44 files, both typechecks, zero-warning lint, 22 preview browser journeys with 2 credential-gated skips, production build, and diff check passed. Added persisted platform overview/subscriptions/invoices/support, role dashboards, notifications, automation controls, durable sandbox email attempts, broad typed realtime subscriptions, and platform handler tests. Live provider delivery, credentialed staging journeys, and remaining adversarial money/staff matrices stay open. |
| BUG-015 implementation | 2026-08-10 | `76a28a8` | 324 tests across 44 files, both typechecks, zero-warning lint, 23 preview browser journeys with 2 credential-gated skips, production build, and diff check passed. Persisted-state action labels, explicit unsaved drafts, cancel/revert, navigation/reload protection, and realtime draft preservation are implemented; deployed read-only UI verification remains. |
| Engineering/security hardening pass | 2026-08-10 | Current working slice | 332 tests across 49 files, both typechecks, zero-warning lint, production build, `git diff --check`, and 23 preview Playwright journeys passed; 3 credential-gated Convex journeys skipped without trusted staging credentials. Added persisted authorization matrices, immediate/next-renewal plan-change tests, redacted Convex correlation logging, offline/reconnect cache behavior, two-browser staging journey, automation scheduler dedupe/opt-out/manager tests, and shared email/SMS/WhatsApp marketing suppression. Staging credentialed execution, live delivery, and Production verification remain intentionally open. |
| Production frontend/backend alignment | 2026-08-11 | `009b1b8` | `main` fast-forwarded without rewriting partner work; Actions run `31481872192` passed and Vercel Production `dpl_5M3xaECxsTtqxEqcN1NfLNmQ3g2x` is `READY` at the commit. Production Convex `descriptive-meerkat-589` passed dry-run and deploy with no index deletions; health and persisted platform surfaces passed; `Hashem Test` stayed hidden/suspended and the unsaved restore draft was cancelled. Vercel showed no release runtime errors and the latest 20 Convex events had no schema/missing-function/auth/uncaught/JavaScript-runtime error. No Production product data was seeded, imported, restored, or mutated. Owner-dashboard and automation-ledger visual checks require a separate gym-owner session. |
| TODO-006 code-shaped money/staff matrix | 2026-08-11 | `1f29af3` (handoff/main `d200ba5`) | Persisted branch-transfer and discount-approval matrices, sale-dialog reason-gate tests, and mock/Convex idempotency parity passed. Local gates passed: 51 files/340 tests, both typechecks, Convex codegen, lint, build, 23 preview E2E passes, and diff check. Final credentialed staging run `31488471463` at `d200ba5`, with both operational/realtime switches enabled, passed authenticated smoke, ungated routine membership/payment flow, cleanup, two-browser realtime, and offline/reconnect. Main run `31488715756` passed ordinary checks. Vercel Production `dpl_Ai7fZ2X64q4eTNWrvW4DJspK89NC` is `READY`; Convex Production `descriptive-meerkat-589` passed exact-target dry-run/deploy from `d200ba5`, with no index deletions, and `health:check` returned `status: ok`. Realistic Production-volume/concurrency proof remains under TODO-007/staging; no Production mutation or seed was run. |
| Pilot completion and gym-owned PT implementation | 2026-08-11 | current release commit | 365 tests across 60 files, both typechecks, zero-warning lint, Convex codegen consistency, `git diff --check`, all 23 credential-free browser journeys, and the 41-route Production build passed. Added PT commercial/scheduling/credit surfaces, public gym/trainer profiles and photos-only media, explicit consent migration, durable Resend queue/webhooks/templates/application queue, PT reminders, finance lifecycle evidence, trainer dashboard, and staging journey safety/dispatch. Convex Production was deployed separately; Vercel frontend deployment follows the matching main push. Live email activation and Production test-data mutation remain disabled. |
| Navigation active-route and cash-shift input safety | 2026-08-11 | `991d7e2` | Credentialed owner browser verification covered all gym workspace routes read-only; the pre-fix `/memberships` page visibly marked both **Members** and **Memberships** active, fixed by a segment-boundary matcher shared by desktop/mobile navigation. The opening-shift form no longer creates a JOD 50.000 record from a default/fallback and now rejects blank, invalid, and negative amounts. 64 Vitest files / 379 tests, both typechecks, zero-warning lint, production build, 23 preview Playwright passes with 4 staging skips, and diff check passed. Post-deploy visual verification of the active nav state and empty opening-float form remains required. No Production mutation was run. |
| BUG-020 through BUG-024 reviewed Settings/media hardening | 2026-08-12 | backend `a58166b` + matching Phase 2 release | Backend exact-target Convex Production dry run was additive with no index deletion; deploy and health check passed. Local gates passed: both typechecks, Convex codegen, zero-warning lint, 71 files / 400 tests, 41-route Production build, 24 Playwright passes with 4 credential-gated staging skips, and diff check. Persisted media expiry/promotion/deletion and direct email-set mutation coverage pass; deployed frontend read-only verification remains required. No Production tenant/product data or external email was mutated. |
| PT, CMS, member experience, and staging-body completion | 2026-08-14 | `a374f0e` | 83 test files / 453 tests, both typechecks, Convex codegen, zero-warning lint, production build, 24 local Playwright passes, and GitHub Actions push run `31761445414` passed. Vercel Production deployment status `36Zjw9Q6wAAoXjnQW8Epc5Cdksr7` completed. Convex Production `descriptive-meerkat-589` exact-target dry run/deploy reported no index deletions, added only the two profile-event indexes, and health returned `ok`. Staging run `31761753434` passed smoke, membership lifecycle, realtime, and owner settings with cleanup; functional bodies stopped before writes at the missing manager storage secret. |
| PT package volume-pricing correction | 2026-08-14 | `11504b9` | Replaced the fixed 12/20/30 selector with one numeric sessions field, added deterministic suggested totals and an explicit price-per-session tracker, and aligned mock/test fixtures to 12/JOD 240, 20/JOD 300, and 30/JOD 400. Local gates passed with 83 files / 454 tests and 24 Playwright passes with 14 staging-gated skips. GitHub Actions run `31803917097` passed generated-code verification, typecheck/lint/unit/build, and preview Playwright; Vercel Production deployment status `AjxuxEW8m2qGgf3hVj3K7vYU9ovU` completed. No Convex deploy or Production product-data mutation was performed. |
