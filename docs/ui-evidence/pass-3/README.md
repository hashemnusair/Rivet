# Pass 3 review evidence

Baseline: `6b190d5`, fetched and synced from `origin/main` before work. Hashem authorized Pass 3 on 5 September 2026. Work is directly on main. Initial implementation finish is `ce264d3`; the first owner correction batch is `3ff4cd8`, and the requested cross-page tab follow-up is `fd46c0c`. Final approval, push, Actions and Production verification remain pending. Pass 4 has not started.

## Workflow changes

- Stock & purchasing keeps its existing five destinations. Tabs wrap on phones, and tab selection and branch links survive refresh. The selected branch is visible without a nested selector frame.
- Inventory puts replenishment alerts first, adds a replenishment filter, and shows readable phone records with available quantity, status, price and the existing Sell, Reorder and Edit actions. Search and replenishment context can be retained in the URL.
- Purchase orders retain draft approval and stock receiving. Approval-reason fields appear only on drafts. Closed orders no longer carry an irrelevant reason input. Received/Open filters survive refresh. Supplier contact text wraps and phone entry uses the phone keyboard.
- Equipment names and safety explanations wrap on phones, with actions below the machine identity. Existing unsafe-machine activation rules, issue states, repair decisions and work-order transitions remain unchanged.
- Checklists show failed items before a completion badge and prioritize runs containing failures. Branch context remains visible, including single-branch accounts. A failed item keeps its reason and opens the exact linked task in Maintenance after escalation.
- Maintenance uses a compact summary and prioritizes active critical/high-priority work. Gym-space links filter the list; history and branch choices survive refresh. Linked checklist tasks are highlighted and scrolled into view. Missing gym spaces, failed space loading and unassigned tasks have distinct explanations.
- Payables separates Record payment and Export from filters, reduces the summary footprint, and retains supplier/status/search context. Payment confirmation remains a supplier remittance record with distinct operational, ledger and reversal states. Finance readers do not see Record another without the existing management permission.
- Loaded records remain visible when refresh fails, with retry feedback. Forbidden and unauthenticated responses still replace the working data with an error state. No server permission, mutation contract, schema, ledger rule or Production data was changed.

## Route and state evidence

| Route or shared work | Evidence |
| --- | --- |
| `/checklists`, opening and closing runs | Desktop/phone before and after; six widths; one-tap completion, failure reason, correction and escalation component tests; phone escalation-to-task browser journey |
| `/operations`, inventory and transfers | All-branch and branch baseline captures; phone/desktop after; six widths; transfer source/destination, quantity, reason and deletion tests; URL refresh journey |
| Purchase orders and suppliers | Before/after phone and desktop; six widths; draft/approval/receiving, supplier archive, read-only and private-source component tests; supplier form and order form at 390×600 |
| Equipment | Before/after phone and desktop; six widths; machine, issue and work-order dialogs, unsafe activation, recommendation and financial boundary tests |
| `/maintenance`, facility tasks | Before/after phone and desktop; six widths; branch selection, QR location shortcut, create/edit/start/complete/block source review and component tests; history/filter refresh and linked-task browser journeys |
| `/operations/payables` | Before/after phone and desktop; six widths; filters, oldest-first balances, allocation, reference, cash-shift and financial-reader tests; short-phone payment dialog |
| `/operations/payables/payments/[paymentId]` | Successful payment confirmation and reversal component tests; phone browser journey checks a partial payment, posting state and reason-gated reversal dialog |

Owner and manager journeys cover management actions. Reception read-only and sales financial denial are exercised by existing component tests; trainer has the same operational-read and no-management permission boundary in the existing role map. Auditor is retired. Member and platform roles do not operate these staff routes; existing authentication and server authorization tests remain part of the full gate.

The required 360, 390, 768, 820, 1280 and 1440px layouts are covered by `apps/web/e2e/workflow-pass-3.spec.ts`. Fourteen deterministic after screenshots cover seven pages at 390px and 1440px. Full-page hosted phone captures, including payment confirmation, are in `after/`. Baseline screenshots live in `before/`, with branch-specific captures in `before/branch/`. Dialogs are checked at 390×600 to verify reachable actions under reduced vertical space. This approximates keyboard space; it does not claim a physical mobile-keyboard test. Existing shared offline, reduced-motion and accessibility behavior is covered by the broader regression suite.

## Deliberate limits

- Purchase orders have no promised-delivery date in the current contract. Open orders stay explicit, but the UI does not invent an overdue-purchasing status. Supplier balances use recorded receipt ages and show a due date only when one exists.
- Checklist escalation creates an unassigned incident with the recorded reason. It has no assignee picker or attachment input. The UI states this and links to the task. Facility tasks expose an assignee ID but no resolved staff name in this response; assigned versus unassigned is shown without guessing a name. The tracker’s combined ownership/evidence outcome remains unchecked.
- Supplier payment history retains its existing 50-record window. Payables retains real 25-record pagination; inventory and purchasing retain their existing unpaginated list contracts. No query or financial semantics were expanded during visual refinement.
- The payables ledger remains horizontally scrollable inside its bounded table on narrow screens. Inventory uses phone records, and equipment actions wrap below machine details.
- Checklist walkthrough item order is retained for the physical opening/closing route. Runs containing failures move earlier; the saved completion and correction events are not reordered.

## Verification

- Full unit gate: 212 files, 1,250 tests passed, plus 14 repository-safety tests.
- Focused tests after the final UI edits: 25 passed across checklist, stock, maintenance and payables.
- App and Convex typechecks, canonical lint, secret-output audit and Production dependency audit passed.
- Impeccable detector ran once over the changed UI targets and returned `[]`.
- Required-width, workflow and dialog browser checks passed in the full gate. Initial captures exposed intermittent mock sign-in startup stalls and test refreshes racing URL updates. URL tests now wait for navigation, the dev cache is isolated, and date-dependent captures use Playwright’s fixed-time API. Separate capture refreshes also encountered occasional startup stalls; the final 390px capture rerun passed, as did the 1440px capture run; this is recorded as test flakiness, not a claim that authentication changed or was repaired.
- The hosted phone review exposed cramped payment-allocation columns; `ce264d3` adds explicit spacing. All six payables component tests and the phone payment-confirmation browser journey passed after that change.
- Final phone supplier/contact wrapping and the purchase-order loaded state were visually inspected after regenerating the references. Canonical lint, secret-output audit and app typecheck passed again after the final text and layout corrections.
- Production build passed (67 routes). Full Playwright gate: 89 passed directly, two existing journeys passed on retry after aborted navigation, and 14 staging-only tests were explicitly skipped. All 11 new Pass 3 journeys passed in that run. The staging skips require separate credentials; they were not exercised against Production.
- Preview `dpl_DRjtRqumgNudQwXFapVFa1FE7b9g` is READY from implementation finish `ce264d3`: [open the protected mock-data Preview](https://rivet-bk0xgsk9u-nusairhashem04-gmailcoms-projects.vercel.app). Authenticated hosted checks passed for all seven primary surfaces at 390px: HTTP 200, no page overflow and no browser errors. A mock partial supplier payment opened its confirmation, kept the posting state explicit and required a reversal reason. `hosted-verification.json` records this check against the exact Preview source.

From the repository root: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `PLAYWRIGHT_PORT=3102 pnpm test:e2e`, `pnpm audit --prod`, and `git diff --check`. The pass uses an isolated `.next-playwright/pass3` development cache on port 3102. No other operator’s development server or landing-page files were changed.

Read `AGENTS.md`, `DESIGN.md`, `CURRENT_STATE.md` and `docs/20_PRODUCT_UI_WORKFLOW_PASS_PLAN.md` first. `FRONTEND_HANDOFF.md` remains frozen.

## Owner correction batch

Hashem requested that Cancel sit immediately left of Add machine at every viewport, and that the Stock & purchasing sections look like navigation tabs. Commit `3ff4cd8` implements both. The machine form uses its native form ID to submit from the footer, retaining browser validation. The navigation uses the existing open-tab underline pattern with larger semibold labels and a full-width divider. All sections remain visible on phones. `DESIGN.md` records the owner-requested direction change.

All 15 operations component tests, app typecheck, canonical lint and the secret-output audit passed. A six-width browser check verified inline footer geometry, Cancel before Add machine, empty required-field validation, cancellation, arrow-key tab switching and no page overflow. Corrected captures are in `corrections/`. The full initial pass gate above remains the baseline; the correction batch receives focused checks rather than claiming a second full suite run.

The 390px and 1440px visual references and stock tab/branch/filter browser journey were verified. Capture runs encountered the previously recorded local startup stalls; the final 1440px rerun passed. No authentication change is claimed.

Corrected Preview [open for review](https://rivet-dakpc272d-nusairhashem04-gmailcoms-projects.vercel.app/login/gym) is READY: `dpl_3GVNGnN9Wr11t2QQKEyRBR35BCE4`, source `3ff4cd8`. The six-width footer and keyboard-tab checks passed on this hosted Preview with no browser errors. `corrections/hosted-verification.json` records the results; the four correction screenshots were captured from that deployment. Final owner approval and push remain pending.

## Shared navigation follow-up

Hashem explicitly extended the approved underline tab direction to the app’s in-page section navigation and requested a better toolbar/mobile arrangement. Commit `fd46c0c` places Stock & purchasing tabs immediately below the heading, before a toolbar of matching 44px controls. On phones the branch selector occupies a full row and Checkout/Maintenance share the next row equally. Tabs use one horizontally scrollable row, with selected shared tabs revealed on initial load, selection changes and window resize. This supersedes the previous wrapping rule.

The audit covered shared tabs in Stock & purchasing, member records, ledger controls and the design gallery, plus custom navigation in Payments/Shifts, Reports, Retention, Classes, member accounts and member class history. Shared exported style classes keep route links and existing section controls visually consistent without changing their domain handlers. Settings’ vertical navigation, status/timeline filters, Board/List display switches, billing choices, guided tutorial/wizard steps and the separate marketing system retain their distinct roles. The member-portal touch is explicitly authorized shared navigation work; Pass 4 workflow work remains pending.

Verification: app typecheck, canonical lint/secret-output audit and 31 focused tests passed. Local browser geometry checks passed at 360, 390, 768, 820, 1280 and 1440px for one-row tabs, selected-tab visibility, tab placement, matching control heights, keyboard tab switching, machine form validation/cancellation and inline footer actions. Hosted six-width geometry and staff/member navigation checks passed on [Preview `https://rivet-4f7coe2a4-nusairhashem04-gmailcoms-projects.vercel.app`](https://rivet-4f7coe2a4-nusairhashem04-gmailcoms-projects.vercel.app/login/gym), deployment `dpl_6wfmabQzysYNsg8mpgQMm1zrRMg6`, source `fd46c0c`. Loaded-page captures and JSON results are in `tab-consistency/`. Ten targeted browser journeys were verified: six passed directly and four passed after retrying the previously documented local startup/navigation stalls. The refreshed references cover affected Pass 1–3 screens; unrelated captures were preserved. The initial full pass gate remains the baseline; these are focused checks of the follow-up.

## Horizontal-scroll regression

The owner reported flickering and a disappearing page while scrolling the tabs in the in-app browser’s iPhone 15 Pro preset. The initial tab-selection, layout and hosted-page checks did not exercise this interaction under delayed frames. A browser reproduction with a fine pointer, a mostly horizontal wheel gesture (`deltaX=160`, `deltaY=-3`) and a 30fps frame interval produced alternating whole-page translations exceeding `10^23px`.

The root overscroll hook accepted the vertical noise and integrated its spring with an unstable Euler step. It also sampled coarse-pointer mode only on mount, so changing an already-loaded desktop page to phone emulation did not disable that handler. Fix `b413d08` uses the exact critically damped solution, bounds visual movement to 7px, ignores horizontal wheel gestures, leaves all touch gestures native and updates/cancels damping immediately when pointer mode changes. The tab style and URL handlers are unchanged.

Nine hook regressions passed, including 30fps, one-second frame pauses and phone-mode changes mid-pull. `e2e/tab-scroll-stability.spec.ts` passed horizontal gesture isolation, slow-frame recovery, live desktop-to-phone emulation switching, repeated native swipes, unchanged selection during swipes, a subsequent tab tap and branch-picker interaction. The existing settings desktop/mobile overscroll journey passed after retrying its known navigation race. Typecheck, canonical lint and the secret-output audit passed. Corrected [Preview](https://rivet-hf42gg007-nusairhashem04-gmailcoms-projects.vercel.app/login/gym) is READY from `b413d08`, deployment `dpl_3PMTE8eAVxv8hHbckgPQb9W9TKdg`; its Production build passed. The exact browser regression passed against that hosted build in 8.7 seconds. Before-reproduction measurements and hosted results are saved in `tab-scroll-fix/`. Approval and release remain pending.

## Owner approval and release

Hashem approved the final Pass 3 result on 5 September 2026 and authorized pushing to main. Approved implementation: `b413d08`; approved Preview: `dpl_3PMTE8eAVxv8hHbckgPQb9W9TKdg`. GitHub Actions and matching Production verification are pending the approved push. A partner agent is independently handling Pass 4, as reported by Hashem; this release does not include or claim that work.
