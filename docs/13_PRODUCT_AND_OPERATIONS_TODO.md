# RIVET product, engineering, and operations backlog

Updated 9 August 2026. This is the single canonical backlog for confirmed bugs, release blockers, missing MVP behavior, production-verification findings, deferred work, and closure evidence. It consolidates the former `docs/14_TODO_AND_BUGS.md`; do not create a second TODO file. Keep secret values, applicant details, and provider credentials out of this file.

## How to use this file

- `P0` blocks a trustworthy pilot or can expose data, money, access, or misleading system state.
- `P1` materially reduces operational quality but does not block the first supervised pilot.
- `P2` is a post-pilot improvement or an intentionally deferred product decision.
- `P3` is deliberately scheduled after functional, security, accessibility, and launch-critical work.
- `Confirmed` means the behavior was observed in code, a test, or a browser run.
- `Needs verification` means there is a credible risk or regression report, but it must be reproduced against the current head before changing behavior.
- Every fix must add or update a focused test and add its commit and evidence to the closure log.
- Update an item's status and evidence when it changes; never erase the history of a release blocker.

## P0 — Finish the disposable production onboarding

- [x] Accept the Clerk owner invitation in a private/incognito browser so the platform-admin and gym-owner sessions cannot mix.
- [x] Confirm the invited identity resolves to the provisioned `Hashem Test` organization with the `owner` role and the first branch.
- [x] Complete the first-owner setup: organization settings, branch details, and one membership plan.
- [x] Exercise lead → member → membership → cash payment → receipt → check-in with disposable data.
- [x] Confirm the member timeline contains conversion, profile creation, membership sale, payment, and check-in in chronological order.
- [ ] Verify the relevant audit events, close the JOD 80.000 drawer without variance, and confirm daily reconciliation after reload.
- [ ] Hide/archive the disposable tenant after verification. Do not run `seed:seedDemoTenant` in Production.

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
- [ ] Close the shift and verify reconciliation before considering this incident fully closed.

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

The lead action says **Create offer**, its confirmation button says **Send offer**, the persisted offer immediately receives `status: "sent"`, and the timeline says **Offer sent**. The operation currently only creates an internal offer record and does not deliver an email, WhatsApp message, SMS, link, or document to the prospect. That wording creates a serious operational risk: staff can reasonably believe a revenue-critical offer reached a lead when nothing left RIVET.

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

- Status: **Environment alignment verified on 9 August 2026; supervised pilot completion remains open under BUG-003 and the onboarding checklist above**.
- Evidence: Vercel Production uses the Production Convex deployment, Clerk Production issuer/key family, Convex-mode data selection, and the approved canonical origins. The public health check passed, and the supervised Production flow has now reached owner onboarding, CRM conversion, membership sale, cash receipt, check-in, and member timeline verification.
- Risk: alignment can regress after credential, domain, deployment, or environment-scope changes; the remaining audit/reconciliation/cleanup steps must still be completed.
- Fix/acceptance: retain the value-free ownership/verification record in `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`, rerun the classification checks after relevant configuration changes, finish the approved Production pilot sequence, and record the exact deployed commit. Never seed Production as a shortcut.

### BUG-002 — Authorization coverage is not yet adversarial at every Convex handler boundary

- Status: **Confirmed coverage gap**.
- Evidence: customer tests currently prove ownership helpers, while the roadmap still requires handler-level attempts using attacker-controlled customer, membership, trial, payment, lead, entry-pass, and branch identifiers.
- Risk: a UI gate or a helper can look correct while a direct authenticated mutation/query still accepts an out-of-scope identifier.
- Fix/acceptance: add authenticated allow/deny/cross-tenant/cross-branch tests for every private identifier family. Test deactivated users, inactive memberships, branch scope, role escalation, and non-disclosing `NOT_FOUND` behavior. Fix the server boundary if any test fails.

### BUG-003 — Production-shaped release sequence is incomplete

- Status: **Confirmed coverage gap; supervised Production sequence is in progress**.
- Evidence: the staged write smoke covers member → membership → payment → check-in → timeline/audit. The supervised Production sequence has additionally verified provisioning, first-owner setup, CRM conversion, a cash shift/payment, check-in, and the unified timeline, but audit review, shift close/reconciliation, cleanup, staff, renewal, automation, member portal, and broader isolation remain incomplete.
- Risk: individual screens can pass while the real gym workflow fails at a handoff between domains.
- Fix/acceptance: finish the supervised disposable-tenant checklist above and add independently runnable, cleanup-safe staging journeys using Development Clerk and isolated Convex only. Gate all mutations explicitly and report cleanup results.

### BUG-004 — Customer trial ownership must be proven through real authenticated mutations

- Status: **Confirmed coverage gap**.
- Evidence: the current customer tests cover profile ownership helpers, but the high-risk behavior is the actual authenticated booking path.
- Risk: a caller could submit another customer's email or ID and attach a booking to the wrong person, or route a booking outside the selected gym/branch.
- Fix/acceptance: test authenticated customer profile resolution, caller-supplied ID rejection, selected gym/branch routing, and staff/platform denial of member-only operations through real Convex handlers.

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

### BUG-010 — Public gym application can fail closed with no selectable plan catalog

- Status: **Needs verification against the current production deployment**.
- Evidence: a browser run on `/signup` showed “Plans are not available yet” and disabled the application action, even though the UI is designed to show the public catalog. The page currently has approved launch defaults, but it still gates the form while the Convex experience provider is loading or in an error state.
- Risk: a temporary public catalog/Convex read failure blocks every new gym application instead of preserving a usable application path and clearly reporting the degraded dependency.
- Fix/acceptance: verify the live `public.catalog` query and the default-plan fallback in both Development and Production. If the catalog is unavailable, keep the approved fallback plans selectable when safe, show a non-blocking “catalog temporarily unavailable” notice, and add a retry/telemetry path. Add a browser test for catalog success, empty, timeout, and recovery.

### BUG-011 — Provisioning retry/idempotency after an external Clerk failure needs fault-injection coverage

- Status: **Needs verification; the known Clerk slug failure is fixed**.
- Evidence: provisioning previously failed with Clerk `organization_slugs_disabled` (fixed in `5a7622e` by removing the requirement for Clerk slugs). The protected action now records `failed` state and exposes retry, but there is no end-to-end test that retries after a partial Clerk organization/invitation response without duplicating the workspace, owner membership, invitation, or audit facts.
- Risk: a transient Clerk/API failure can leave an approved application stuck, create duplicate organizations/invitations on retry, or make the UI report success before Convex state is complete.
- Fix/acceptance: add a deterministic fault-injection test around organization creation, owner invitation, and finalization. Retry must converge to one organization, one branch, one subscription, one owner membership, and one invitation; each failure must remain auditable with a correlation ID and an actionable operator message.

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

- Status: **In progress in the supervised Production flow**.
- Scope: open shift, opening float, cash/card/CliQ-style configured payments, partial balance, receipt, refund/void review, close shift, expected-vs-counted cash, manager variance decision, daily reconciliation.
- Evidence to date: JOD 50.000 opening float, JOD 30.000 cash membership payment, receipt `RV-001001`, JOD 80.000 expected drawer, successful check-in, and unified member timeline were verified in Production on 9 August 2026.
- Acceptance: source transaction facts, receipt numbers, shift totals, audit events, and reports agree after reload and concurrent updates. Shift close/reconciliation and the remaining method/variance scenarios are still open.

### TODO-008 — Verify automation scheduling, deduplication, quiet hours, and retries end to end

- Status: **Confirmed staging gap**.
- Scope: expiry/follow-up trigger, task creation, sandbox message attempt, daily dedupe key, quiet-hours suppression, retry metadata, and manager notification.
- Acceptance: one trigger produces one action per dedupe window; retryable failures do not report false success; audit/execution records remain queryable.

### TODO-009 — Record marketing-preference provenance and revocation history

- Status: **Partially implemented; default policy confirmed by the product owner**.
- Evidence: RIVET intentionally defaults new members to **Opted in** across manual creation, lead conversion, and imports, while explicit opt-out remains supported. The stored domain fact is still a boolean without source, wording version, timestamp, actor, channel scope, or append-only change history.
- Risk: the current system cannot distinguish a system-applied product default from a preference actively selected by a member or staff user, prove why an existing preference has its value, or reliably suppress every future promotional channel after withdrawal.
- Fix/acceptance: add preference source (`system_default`, `staff_selected`, or `member_selected`), version/actor/timestamp facts, an obvious staff/member opt-out path, channel-specific suppression, migration treatment for historical records, and tests for defaulted opt-in, explicit opt-in, explicit opt-out, withdrawal, imports, conversion, and authorization. Never describe the system default as explicit consent.

### TODO-010 — Verify application review-note editing in Production

- Status: **Implemented locally; Production verification pending**.
- Evidence: platform review notes now save independently, remain editable after final decisions, support clearing, and write platform audit before/after snapshots through both Convex and the mock adapter. Background application polling no longer resets unsaved text.
- Fix/acceptance: use a disposable Production application to save, edit, clear, and reload a final review note; confirm the audit event and note survive the refresh. Do not use a real gym application for this test.

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
| Production cash-shift render crash | 2026-08-09 | `8e81bd4` | 236 unit/component tests, both typechecks, lint, and production build passed; Vercel deployed the fix; the existing Production shift then rendered its JOD 50.000 float and later reconciled one JOD 30.000 cash payment into a JOD 80.000 expected drawer. Final shift close remains open under TODO-007. |
| BUG-005, BUG-006 | 2026-08-09 | `850454c` | 238 unit tests; 7 public-experience Playwright tests passed, including authenticated/unauthenticated trial confirmation and preview QR wording. Convex-mode production assertion remains release-gated. |
| Historical provisioning slug failure | 2026-08-09 | `5a7622e` | Clerk organization creation no longer requires the optional Clerk slug feature; the internal RIVET organization slug remains stable. Retry/idempotency coverage remains open as BUG-011. |
| Historical public plan-catalog fallback | 2026-08-09 | `55cead9` | Approved launch defaults keep the public gym application usable when editable catalog rows are absent; production success/timeout/recovery coverage remains open as BUG-010. |
| Dashboard scope and CRM capture slice | 2026-08-09 | `2269863` + `1bd4b05` | 248 unit tests, 19 preview Playwright journeys, typecheck, Convex typecheck, lint, and production build passed after merging branch-aware dashboard copy, lead email capture, explicit unassigned-owner handling, assignment authorization, and cash-shift error-path coverage. Production one-branch visual verification and TODO-009 preference provenance/revocation remain open. The overlapping opt-out default was subsequently realigned to the product owner's opted-in default decision. |
| Application review notes | 2026-08-09 | `8c0d34f` | 249 unit tests, 19 preview Playwright journeys, typecheck, Convex typecheck, lint, and production build pass. Notes can be saved, cleared, edited after final decisions, and audited; disposable Production reload verification remains required. |
