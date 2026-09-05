# RIVET product UI workflow pass plan

## Purpose

This is the living completion tracker for the workflow-focused product UI program. It covers every product route, shared interaction, role state, and supported viewport after the visual-system refinement completed at `9e267cc` and the brand-kit commit at `3090bd0`.

The work is a refinement of the implemented product. It must preserve authorization, accounting, audit, tenant, and workflow contracts unless a confirmed usability defect requires a separately reviewed behavior change.

## Progress

- [x] Pass 1: Daily front-desk work
- [x] Pass 2: Sales, retention, and scheduling
- [x] Pass 3: Branch operations
- [x] Pass 4: Member mobile experience
- [ ] Pass 5: Owner, finance, and oversight
- [ ] Pass 6: Settings
- [ ] Pass 7: Platform, authentication, and public product states
- [ ] Final closure: Route, state, role, and device coverage

## Completion rules

A pass may be checked only when all of the following are true:

- [ ] The branch started from the latest `origin/main`, including partner commits.
- [ ] Before screenshots or equivalent visual evidence were captured for the pass.
- [ ] Every route and shared component listed for the pass was inspected.
- [ ] The primary workflow is faster and clearer, not merely restyled.
- [ ] Loading, empty, error, retry, stale, permission, offline, success, and long-content states were handled where applicable.
- [ ] Owner, manager, sales, reception, trainer, auditor, member, and platform roles were checked where applicable.
- [ ] The pass was checked at 360, 390, 768, 820, 1280, and 1440 pixels where its layouts apply.
- [ ] Coarse-pointer targets, keyboard operation, visible focus, and screen-reader names were checked.
- [ ] Sticky regions, overlays, scrolling, safe areas, and virtual keyboards do not hide focused or actionable content.
- [ ] Tabs, filters, pagination, and other shareable view state are URL-backed where appropriate.
- [ ] Product copy says what happened and what to do next. Permission, setup, empty, and failure states are not conflated.
- [ ] The pass follows [`DESIGN.md`](../DESIGN.md) and the exact product boards in [`docs/brand`](brand).
- [ ] Signal red remains rare, Manrope carries human language, and IBM Plex Mono is limited to technical records.
- [ ] There are no decorative eyebrows, colored active rails, nested card walls, gradients, glass effects, routine shadows, or `transition-all` declarations.
- [ ] Changed components reuse or improve shared patterns rather than adding one-off visual systems.
- [ ] Focused component tests, browser journeys, and visual checks pass.
- [ ] Typecheck, Convex typecheck, lint, unit tests, Production build, Playwright, dependency audit, and `git diff --check` pass before final integration.
- [ ] The Impeccable detector was run once over the finished changed targets.
- [ ] A Vercel Preview was reviewed by Hashem.
- [ ] One consolidated correction batch was applied after review.
- [ ] The coherent pass commits were integrated into `main`, GitHub Actions passed, and the matching Vercel deployment completed.
- [ ] `CURRENT_STATE.md` and this tracker record the exact finish SHA and any deliberate compromise.

The root marketing page has its own visual system. Authentication, onboarding, offers, gym discovery, and other public product experiences remain governed by the product system and are included below.

## Pass 1: Daily front-desk work

**Status:** Complete
**Baseline SHA:** `f16d36d`
**Finish SHA:** `797ae99`
**Preview:** `https://rivet-r859pdjxy-nusairhashem04-gmailcoms-projects.vercel.app`
**Human approval:** Pass 1A and Pass 1B approved by Hashem on 5 September 2026

### Pass 1A: Shift command path

Routes and shared surfaces:

- [x] `/dashboard`, including the role-specific dashboard and Today queue
- [x] `/reception`, including branch selection, search, scanning, verdicts, warnings, and overrides
- [x] `/checkout`, including product search, barcode entry, cart, guest/member choice, payment, and completion
- [x] `/operations/checkout`, confirming the legacy destination cannot drift from canonical Checkout
- [x] `/payments`, including filters, balances, collection, refunds, voids, and receipt access
- [x] `/payments/shifts`, including shift opening, live totals, closing, discrepancy, and recovery
- [x] `/payments/receipts/[receiptId]`
- [x] `/payments/receipts/view`
- [x] Global command palette
- [x] Notification center
- [x] Branch selector and assigned/default branch behavior

Workflow outcomes:

- [x] The likely next safe action is visible without opening a menu.
- [x] Reception and Checkout select an eligible assigned or default branch when one unambiguous branch exists.
- [x] “All branches” never produces a misleading permission error on single-branch workflows.
- [x] Reception supports name, canonical phone, member number, and scanner input from one strong entry point.
- [x] A straightforward successful check-in clears naturally; warnings remain until the employee acts or advances.
- [x] Check-in warnings keep Collect, Renew, member detail, and override actions reachable.
- [x] Checkout starts with Guest and never requires a name for an ordinary retail sale.
- [x] Member attachment is optional, reversible, and clearly valuable when selected.
- [x] Cart, payment, and completion use one canonical implementation on desktop and mobile.
- [x] A completed sale offers receipt, next sale, and reason-gated refund or void paths without trapping the operator.
- [x] Cash collection explains and resolves the missing-open-shift state.
- [x] Shift closure cannot proceed before authoritative totals load.
- [x] Ambiguous post-mutation failures preserve context and explain how to confirm the outcome.
- [x] Command-palette and notification failures never masquerade as empty results.

Quality and verification:

- [x] Desktop front-desk flow checked with keyboard-only semantics and focus handling.
- [x] Barcode-scanner style exact-SKU input and Enter-to-commit behavior checked.
- [x] Reception and Checkout checked on 768 and 820 pixel tablet layouts.
- [x] Checkout, collection, and receipts checked at 360 and 390 pixels.
- [x] Destructive and money-changing actions retain their reason, authorization, audit, and idempotency contracts.
- [x] Before and after screenshots approved.

### Pass 1B: Member-to-sale path

Routes and shared surfaces:

- [x] `/members`
- [x] `/members/new`
- [x] `/members/[memberId]`
- [x] `/members/duplicates`
- [x] `/members/import`
- [x] `/memberships`
- [x] `/plans`
- [x] Membership sale dialog
- [x] Membership adjustment dialogs
- [x] Payment dialog and receipt continuation
- [x] Member header, tabs, and timeline

Workflow outcomes:

- [x] Member search, filters, saved views, columns, counts, and actions form one readable toolbar at desktop widths.
- [x] Filter controls collapse intentionally on smaller widths without hiding active filters.
- [x] Quick creation asks for the minimum required identity, preselects branch, and keeps optional detail behind progressive disclosure.
- [x] Gender remains required and offers only the legally supported values for this market.
- [x] Duplicate checks distinguish “no match” from “check unavailable.”
- [x] Create and sell continues through member, plan, collection or balance, receipt, and one clear completion result.
- [x] Returning from a failed step does not duplicate a member, membership, charge, or payment.
- [x] Member detail makes status, balance, membership, last activity, and likely next action readable before secondary history.
- [x] Sensitive actions remain reason-gated and audited.
- [x] Duplicate resolution explains the surviving record and the consequences before confirmation.
- [x] Import uses real file upload, clear branch destination, mapping, safe preview, useful row decisions, rejected-row download, resume, and bounded undo.
- [x] Memberships and plans remain manageable at realistic volume without silent caps.

Quality and verification:

- [x] Staff can complete the member-to-sale path with keyboard only.
- [x] The same path works on a tablet without horizontally squeezed forms.
- [x] Lists handle realistic long names, international phone numbers, plan names, and branch names.
- [x] Empty, one-record, typical, and large working sets remain clear.
- [x] Before and after screenshots approved.

### Pass 1 completion

- [x] Pass 1A accepted by Hashem.
- [x] Pass 1B accepted by Hashem.
- [x] Complete Pass 1 local gate passed: 1,240 Vitest tests, 14 repository-safety tests, 67 credential-free Playwright journeys, Production build, typechecks, lint, dependency audit, and repository checks.
- [x] Pass 1 fast-forwarded to `main`; GitHub Actions run `33925997793` passed and Vercel Production deployment `dpl_4P5CmBPkyWMGQTJQQxNY4ZHKcRWk` is `READY`.
- [x] Pass 1 progress and finish evidence recorded here and in `CURRENT_STATE.md`.

Review evidence is committed in `apps/web/e2e/workflow-pass-1-visual.spec.ts` and its eight deterministic screenshots. Reception deliberately remains RIVET's distinct night command desk; the pass refines its hierarchy and failure handling without flattening it into the light workspace system. The canonical marketing and application domains returned HTTP 200 after deployment, while the Production design-gallery route correctly returned 404.

## Pass 2: Sales, retention, and scheduling

**Status:** Complete; approved visual refinement with the deliberate limits recorded below
**Baseline SHA:** `b06292a`
**Implementation SHA:** `352d501` (including the consolidated correction batch)
**Finish SHA:** `4204613` (approved implementation and correction evidence)
**Preview:** [https://rivet-hgn62dl9h-nusairhashem04-gmailcoms-projects.vercel.app](https://rivet-hgn62dl9h-nusairhashem04-gmailcoms-projects.vercel.app/login/gym) · `dpl_4tYNU78PJx1tRcRFxw5AgBhA6JJm` · READY
**Human approval:** Approved by Hashem on 5 September 2026 after requesting the two Leads/retention corrections; push explicitly authorized.

Routes and shared surfaces:

- [x] `/crm/pipeline`
- [x] `/crm/leads/[leadId]`
- [x] `/crm/queues`
- [x] `/offers/[token]`
- [x] `/memberships`
- [x] `/plans`
- [x] `/classes`
- [x] `/pt`
- [x] Lead creation and contact editing
- [x] Call, WhatsApp, contact, trial, offer, loss, and conversion controls
- [x] At-risk and win-back queues
- [x] Class schedule, occurrence, roster, waitlist, attendance, cancellation, and coach substitution
- [x] PT trainer, package, availability, booking, payment, outcome, cancellation, and payout views

Workflow outcomes:

- [x] Explicit lead actions are primary; drag and drop remains an optional desktop shortcut.
- [x] Terminal outcomes ask for a short useful reason.
- [ ] The lead timeline, board stage, queues, offers, trials, and conversion status agree.
- [x] Follow-up urgency, owner, last contact, next action, and snooze state are easy to scan.
- [x] At-risk rows state the exact reason and provide Call, WhatsApp, contacted, follow-up, snooze, and member actions.
- [x] Class schedules communicate date, time, coach, audience, capacity, booked, waitlisted, and attendance state without opening every class.
- [x] Staff roster and attendance work cleanly on touchscreens and cannot create accidental no-shows.
- [x] PT scheduling separates availability, booking, outcome, credit, and payment without making staff understand internal state machines.
- [ ] All flows handle realistic volume and preserve server-owned rules.

Completion:

- [x] Before and after evidence approved; one consolidated correction batch applied.
- [x] Local technical gate passed (1,249 unit tests, 14 safety tests, 80 browser journeys verified, 14 explicit staging skips; both typechecks, build, lint, audit, detector and diff checks). Human review and release checks passed.
- [x] Pass committed directly to main and deployed; Actions [run `33954966139`](https://github.com/hashemnusair/Rivet/actions/runs/33954966139) passed, and matching Vercel Production `dpl_3XKWcQPh9c596AAuMeG1LfZ1Uikv` is READY.
- [x] Finish evidence recorded here, in `CURRENT_STATE.md` and in the linked review evidence.

Implementation and review evidence: [`docs/ui-evidence/pass-2/README.md`](ui-evidence/pass-2/README.md). All listed surfaces were inspected; Hashem approved the pass and explicitly authorized release after requesting the two corrections. Existing dated-class cancellation and PT payout views are not implemented product surfaces; auditor is retired. The mock trainer workspace has a documented permission mismatch with Convex, so trainer UI and server scoping are verified separately. Legacy stage-only trial records and bounded plan pickers remain explicit review limitations; no domain/data repair was folded into visual work. The two absolute workflow checks remain unchecked because legacy trial records and bounded plan pickers are existing limitations, not fully resolved outcomes. These limits remain recorded with the approved visual pass; no domain/data repair was requested. Pass 3 remains untouched and requires Hashem’s separate confirmation.

## Pass 3: Branch operations

**Status:** Complete — approved by Hashem, pushed to main and live. Authorized and approved on 5 September 2026
**Baseline SHA:** `6b190d5` (fetched and synced before work)
**Finish SHA:** `21788af` (approved implementation `b413d08`, integration push `9caab72`, verified visual-reference correction `21788af`)
**Preview:** [Protected mock-data Preview](https://rivet-hf42gg007-nusairhashem04-gmailcoms-projects.vercel.app) · `dpl_3PMTE8eAVxv8hHbckgPQb9W9TKdg` · READY · source `b413d08`
**Human approval:** Approved by Hashem on 5 September 2026

Routes and shared surfaces:

- [x] `/checklists`
- [x] `/operations`
- [x] `/operations/payables`
- [x] `/operations/payables/payments/[paymentId]`
- [x] `/maintenance`
- [x] Inventory
- [x] Purchase orders
- [x] Suppliers
- [x] Payables and supplier payments
- [x] Equipment
- [x] Facility tasks
- [x] Opening and closing checklist runs

Workflow outcomes:

- [x] Stock, purchasing, payables, equipment, and maintenance have a clear information structure.
- [x] Branch scope is always visible and defaults safely.
- [ ] Urgent stock, overdue purchasing, unpaid supplier amounts, and failed checklist items outrank healthy records.
- [x] Primary actions remain visible without tab or overflow-menu hunting.
- [x] Opening and closing tasks work comfortably on a phone.
- [ ] A failed checklist item can become a maintenance task with clear ownership and optional evidence.
- [x] Partial, disabled, empty, and permission-limited configurations explain the next step.
- [x] Money and stock mutations keep authorization, audit, idempotency, and reversal rules intact.

Completion:

- [x] Before and after evidence approved.
- [x] One consolidated owner correction batch applied.
- [x] Full pass gate passed.
- [x] Pass committed directly to main and deployed; Actions [run `33963797469`](https://github.com/hashemnusair/Rivet/actions/runs/33963797469) passed every job, and matching Vercel Production `dpl_CxpUz1qqaPueS3TLL1MjphuXseoS` is READY.
- [x] Finish evidence recorded here, in `CURRENT_STATE.md` and in the linked review evidence.

Implementation commits: `bfc8521`, `ad82397`, `89ab1a4`, `36ccc33` and `ce264d3`. Review evidence: [`docs/ui-evidence/pass-3/README.md`](ui-evidence/pass-3/README.md). All listed surfaces were inspected; Hashem approved the final corrected result and authorized release. The combined overdue-purchasing and ownership/evidence outcomes remain unchecked: purchase orders have no promised-delivery date, and checklist escalation has no assignee or attachment input. These existing contract limits are documented rather than invented for visual completion. The initial full browser gate verified 91 credential-free journeys (two existing journeys needed a retry), with 14 explicit staging-credential skips. Hosted 390px checks passed for all seven primary surfaces and payment confirmation. Hashem reviewed the first Preview and requested aligned machine form actions and stronger tab navigation. The consolidated correction batch is `3ff4cd8`; final approval and successful GitHub/Production release verification are recorded above. Hashem reports Pass 4 is being handled in parallel by a partner agent.

Hashem’s subsequent review extended the underline style to in-page section navigation across the app and requested one-row mobile tabs with consistently sized Stock & purchasing controls. `fd46c0c` implements that shared consistency follow-up. Member-record, financial, scheduling and member-portal navigation changes are recorded under this explicit extension; Pass 4 is now proceeding separately under the partner agent. The earlier wrapping-tab layout is superseded. Hosted staff/member checks and all six toolbar widths passed. The follow-up passed typecheck, lint, 31 focused component tests and ten targeted browser journeys, including four retries for known local navigation/startup flakiness. Final approval and successful release verification are recorded above.

Horizontal scrolling regression: Hashem’s iPhone 15 Pro in-app emulation report exposed an unstable root overscroll spring and mount-only pointer detection. Fix `b413d08` isolates horizontal/touch gestures, reacts to pointer changes and replaces unstable integration with a bounded exact spring solution. Nine regression tests and a slow-frame/emulation-switch/swipe browser journey pass. The exact regression also passed on READY Preview `b413d08`. Earlier static geometry checks were insufficient for this failure; Hashem approved the corrected result; the final release gate passed.

Release verification: all 1,259 unit/component tests and 14 repository-safety tests passed, together with typechecks, canonical lint, build, audit and actual Convex code generation. CI verified all 92 credential-free browser journeys (the existing standalone member navigation journey passed on retry); 14 staging-only journeys remained explicitly credential-gated. Stale retention crop references and two Linux-specific mobile wrapping references were inspected and corrected without changing application code or screenshot tolerance. Marketing returned HTTP 200 after its canonical redirect, both login entry points returned 200, and the Production design gallery returned 404. The two existing workflow-contract limitations above remain honestly unchecked.

## Pass 4: Member mobile experience

**Status:** Complete; approved by Hashem, pushed to main and live
**Baseline SHA:** `6b190d5`, integrated onto the Pass 3 closure `9caab72` before review
**Implementation SHA:** `816205a`
**Finish SHA:** `332973a`
**Preview:** [https://rivet-11pgc2j6x-nusairhashem04-gmailcoms-projects.vercel.app](https://rivet-11pgc2j6x-nusairhashem04-gmailcoms-projects.vercel.app/login/member) · `dpl_4NuGxbM5wLQAK1mEmRC2yKRz1MKh`
**Human approval:** Approved by Hashem on 5 September 2026 ("merge to main") with no correction batch requested

Routes and shared surfaces:

- [x] `/customer/login`
- [x] `/customer/signup`
- [x] `/customer/getting-started`
- [x] `/customer/my-gyms`
- [x] `/customer/my-gyms/[membershipId]`
- [x] `/customer/finance`
- [x] `/customer/receipts/[receiptId]`
- [x] `/customer/discover`
- [x] `/customer/gyms/[gymId]`
- [x] `/customer/profile`
- [x] `/login/member`
- [x] `/login/member/create`
- [x] `/offline`
- [x] Member bottom navigation and PWA behavior
- [x] Membership, classes, waitlist, referrals, freeze requests, payments, receipts, export, and communication preferences

Workflow outcomes:

- [x] Every member task works comfortably with one hand at 360 and 390 pixels.
- [x] Safe areas, browser chrome, keyboards, and bottom navigation never cover actions.
- [x] There are no compressed desktop tables or horizontally squeezed toolbars.
- [x] Membership, money, booking, waitlist, referral, and freeze states use plain member language.
- [x] Downloads open in useful mobile formats with human-readable content.
- [x] Browser scrolling remains native and natural.
- [x] Retry and reconnect behavior preserve useful loaded data.
- [x] No action depends on hover, drag, or a hidden gesture.

Completion:

- [x] Before and after evidence approved.
- [x] Full pass gate passed.
- [x] Pass merged and deployed.
- [x] Finish evidence recorded here.

Implementation and review evidence: [`docs/ui-evidence/pass-4/README.md`](ui-evidence/pass-4/README.md). The seeded preview member has no gym payment records, so the populated payments list and receipt are verified with component fixtures rather than in the Preview; the Impeccable skill is not installed in this environment, so an equivalent banned-pattern scan was run and is recorded instead of ticking that gate.

Release: `main` fast-forwarded to `affb49b` on 5 September 2026 after a final fetch found no partner advancement. GitHub Actions [run `33970837435`](https://github.com/hashemnusair/Rivet/actions/runs/33970837435) passed every job for that SHA, and Vercel Production deployment `dpl_CJiusik3bL597A2akbXgKzgE4eaa` is READY for it; `www.rivetjo.com`, `app.rivetjo.com/login/member` and `dashboard.rivetjo.com/login/gym` returned HTTP 200, the root domain redirected (308) to www, `/dev/design-system` returned 404 and the new `/customer/signup` redirect answered 307 to the canonical signup. No Convex deploy was needed: this pass changed no `apps/web/convex/**` file.

## Pass 5: Owner, finance, and oversight

**Status:** In review
**Baseline SHA:** `5356870`
**Finish SHA:** Implementation tip `4777d83`; final SHA recorded at closure
**Preview:** https://rivet-edeeusvew-nusairhashem04-gmailcoms-projects.vercel.app (Vercel deployment `dpl_43osRv5uKfvFk1zZ8HBw7uvjL4np`, GitHub deployment 6283660228, built from review branch `review/ui-workflow-pass-5` at `e979991`, protected, synthetic mock data)
**Human approval:** Pending

Routes and shared surfaces:

- [x] Owner and manager variants of `/dashboard`
- [x] `/reports`
- [x] `/reports/statements`
- [x] `/finance`
- [x] `/finance/income-statement`
- [x] `/finance/balance-sheet`
- [x] `/finance/cash-flow`
- [x] `/finance/controls`
- [x] Owner oversight variants of `/payments` and `/payments/shifts`
- [x] `/audit`
- [x] `/exports`
- [x] `/automations`
- [x] `/automations/[ruleId]`
- [x] `/support`

Workflow outcomes:

- [x] Exceptions, unresolved money, risks, and approvals appear before healthy totals.
- [x] Reports answer a clear operating question instead of presenting disconnected charts.
- [x] Accounting language remains accurate and is explained in gym-owner terms.
- [x] Every summary traces to its source records.
- [x] Money, dates, comparisons, filters, and exports use one consistent presentation.
- [x] Dense tables remain readable without becoming oversized card lists.
- [x] Audit and automation states distinguish pending, failed, paused, stale, and completed work.

Completion:

- [ ] Before and after evidence approved.
- [ ] Full pass gate passed.
- [ ] Pass merged and deployed.
- [ ] Finish evidence recorded here.

## Pass 6: Settings

**Status:** Not started
**Baseline SHA:** To record
**Finish SHA:** To record
**Preview:** To record
**Human approval:** Pending

Sections:

- [ ] Organization
- [ ] Brand Kit
- [ ] Public profile
- [ ] Branches
- [ ] Gym spaces
- [ ] Agreement
- [ ] Subscription & invoices
- [ ] Users
- [ ] Roles & permissions
- [ ] Payments
- [ ] Receipts & tax
- [ ] Notifications
- [ ] Operational email
- [ ] Operational rules
- [ ] Hours & trials
- [ ] Daily checklists

Workflow outcomes:

- [ ] The Settings heading and local rail stay stable while content scrolls.
- [ ] Search, URL state, Back, and refresh preserve the selected section.
- [ ] Every editable section has predictable dirty, save, saving, success, failure, discard, and navigation-protection behavior.
- [ ] Labels, fields, units, helper text, and validation align consistently.
- [ ] Toggles clearly control the settings beneath them.
- [ ] Permission and agreement tables remain usable on narrow screens and with keyboard navigation.
- [ ] Subscription, invoice, email, and legal states use consistent record treatment.
- [ ] Settings work on phones without cramped multi-column fields.

Completion:

- [ ] Before and after evidence approved.
- [ ] Full pass gate passed.
- [ ] Pass merged and deployed.
- [ ] Finish evidence recorded here.

## Pass 7: Platform, authentication, and public product states

**Status:** Not started
**Baseline SHA:** To record
**Finish SHA:** To record
**Preview:** To record
**Human approval:** Pending

Platform routes:

- [ ] `/platform`
- [ ] `/platform/gyms`
- [ ] `/platform/gyms/[gymId]`
- [ ] `/platform/applications`
- [ ] `/platform/billing`
- [ ] `/platform/subscriptions`
- [ ] `/platform/agreements`
- [ ] `/platform/email-log`
- [ ] `/platform/support`

Authentication, onboarding, and public product routes:

- [ ] `/login`
- [ ] `/login/gym`
- [ ] `/login/gym/create`
- [ ] `/login/admin`
- [ ] `/login/accept-invitation`
- [ ] `/signup`
- [ ] `/onboarding/gym`
- [ ] `/onboarding/agreement`
- [ ] `/getting-started`
- [ ] `/offers/[token]`
- [ ] `/privacy`
- [ ] `/terms`
- [ ] Global error, unavailable, not-found, and offline states

Workflow outcomes:

- [ ] Portal identity is obvious before sign-in.
- [ ] Authentication never shows an irrelevant role or workspace while identity loads.
- [ ] Invitations and profile completion explain expiration, conflict, retry, and already-completed states.
- [ ] Provisioning shows truthful progress and recovery without exposing internal machinery.
- [ ] Platform money, subscription, legal, email, and support records share one administrative language.
- [ ] Sensitive platform actions remain explicit, reason-gated, audited, and recoverable where possible.
- [ ] Public offers and legal records remain readable and actionable on phones.
- [ ] Error pages preserve context and provide a useful next action.

Completion:

- [ ] Before and after evidence approved.
- [ ] Full pass gate passed.
- [ ] Pass merged and deployed.
- [ ] Finish evidence recorded here.

## Final closure

**Status:** Not started
**Baseline SHA:** To record
**Finish SHA:** To record
**Preview:** To record
**Human approval:** Pending

Inventory and coverage:

- [ ] All gym-workspace page entries inventoried.
- [ ] All member-portal page entries inventoried.
- [ ] All platform-console page entries inventoried.
- [ ] All authentication, onboarding, offer, offline, error, and legal-product page entries inventoried.
- [ ] Shared dialogs, drawers, sheets, popovers, toasts, tables, PDFs, exports, command surfaces, and permission boundaries inventoried.
- [ ] Every inventory row records applicable roles, states, widths, tests, finish SHA, and human approval.
- [ ] Orphaned, duplicated, legacy, and unreachable routes are removed or intentionally documented.

System checks:

- [ ] Shared components still match the design gallery.
- [ ] No product route has introduced its own competing typography, radius, color, shadow, state, or motion language.
- [ ] No page contains unexplained clipping, accidental horizontal scrolling, delayed snap-back, or sticky overlap.
- [ ] Focus order and keyboard operation work across every primary flow.
- [ ] Touch targets, safe areas, browser zoom, and mobile text sizing remain usable.
- [ ] Short, typical, long, empty, and large-volume content ranges are covered.
- [ ] Dates, times, numbers, and currencies use tenant-aware formatting.
- [ ] Logical directions preserve the later Arabic and RTL path.
- [ ] Complete visual regression set reviewed and stabilized.
- [ ] Complete local and hosted verification passed.
- [ ] Final Product UI acceptance approved by Hashem.

## Change log

- 2026-09-04: Created the workflow pass tracker from the approved product design system and the current product-route inventory. All workflow passes begin unchecked.
