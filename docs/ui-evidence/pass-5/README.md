# Pass 5 review evidence

Baseline: `5356870` (fetched and verified against `origin/main` after the Pass 4 closure). Implementation commits: `d19edca` (reports, finance hub, statements, ledger controls), `8f86c9e` (audit, exports, automations, support, manager metrics) and `4777d83` (browser suite, references and captures). This pass is presented for Hashem's Preview review; `main` has not been pushed.

[Open the protected Vercel Preview](https://rivet-edeeusvew-nusairhashem04-gmailcoms-projects.vercel.app/login/gym). Deployment `dpl_43osRv5uKfvFk1zZ8HBw7uvjL4np` (GitHub deployment 6283660228) targets Preview and was built by the Vercel Git integration from the pushed review branch `review/ui-workflow-pass-5` at `e979991`, with synthetic mock data and the existing deployment protection. Hosted checks could not be run from this session (the protected host resets non-browser connections and the in-app browser refuses the domain), so the hosted check is Hashem's own review; the equivalent local checks are recorded below. Sign in as Omar Al-Khatib (owner) for every finance and oversight surface, or Layla Haddad (manager) for the operations dashboard and the shifts oversight view.

## Verification

| Check | Result |
| --- | --- |
| Typecheck (web and Convex) | Passed |
| Lint (zero warnings) with the secret-output audit | Passed |
| Vitest | 224 files, 1,297 tests passed (25 new: scope parsing and bar, range totals, export states, automation states) |
| Repository safety tests | 14 passed |
| Production build | 67 pages, no tracked file changed by the build |
| Production dependency audit | No known vulnerabilities |
| Patch formatting | `git diff --check` clean |
| Full browser suite | 115 passed, 14 skipped (credentialed tiers); the stock-and-purchasing and Pass 2 360px specs hit page-load timeouts in the 24-minute run and passed when re-run on their own (14 passed) |
| Pass 5 browser suite | 13 of 13 passed: six widths with 28 deterministic references, plus seven journeys |

Reference captures are viewport-sized like the earlier passes; the `after/` folder holds full-page captures of the same routes.

## What changed for owners and managers

- **Reports answer one question each, in one scope.** The page description now states the operating question of the selected view ("What came in, by which method and branch, and what is still unresolved?", "Did we collect what we charged, and what is still owed?"). The view, the window (7/30/90 days), the end date and the branch live in the URL, so a report can be shared, refreshed and returned to exactly as it was asked. The overview and every operational report use the same scope bar: labelled Branch, Date range pills with a pressed state, End date, Refresh, and one sentence that says what the figures cover.
- **The overview totals describe the whole window, not the visible page.** The old "By payment method" panel summed the 25 rows on screen; it now reads every transaction in the range (capped at 1,000 and flagged when the cap is hit). The strip leads with unresolved money and reversals (Outstanding now, Refunded, Voided), then Collected, Net in range and This month; the by-method and by-branch breakdowns show payment counts and refunds separately. Outstanding, refunds, each method and each receipt number link into the Payments ledger with the matching filter when the window ends today.
- **The finance hub is flat.** The four statement cards no longer carry a resting shadow or a hover-slide arrow; they are ordinary panels with a border change on hover.
- **Statements keep their scope and trace to the entries behind them.** The quick ranges use the same pressed pills as Reports, the back link sits above the header exactly as it does on Ledger controls, Ledger controls is a real secondary button, and every statement section with posted lines offers "View journal entries", which opens Ledger controls on the Journals tab in the same branch scope.
- **Ledger controls put the unfinished work first.** The summary strip starts with the source queue (pending, unconfigured and failed counts) before the control totals; the tab and the branch are readable from the URL (`?tab=journals&branchId=…`), so the statement links land on the right tab; the empty trial balance no longer stretches to the height of the chart of accounts; record references are 11px mono rather than 10.5px.
- **Audit questions are shareable.** Search, category, actor, approval state and page are all URL-backed (the automations page already linked to `/audit?category=automations`; now every filter round-trips). The filters stack cleanly on a phone, the approval filter says "Any approval state", and the correlation line is readable text with a mono reference.
- **Exports read as one dense list.** Seven cards became one panel of rows (name, what it holds, Generate CSV). Each request in Recent exports carries a truthful state: Queued, Running, Partial, Completed, Expired (a completed job whose 24-hour content is gone), Failed or Cancelled, and the download control says Download CSV, Preparing, Expired or Unavailable instead of offering a dead button.
- **Automations distinguish held, paused, pending, failed and completed work.** The summary strip leads with Failed / retrying and Suppressed before the healthy counts; the immutable-history warning sits under the strip when there is something to review. Rule state reads "enabled · held" while the global pause is on, "paused" when the saved configuration is off, and Next run says "Held by the global pause" or "Paused in saved configuration" rather than a generic "No run scheduled". Execution badges read completed, suppressed · duplicate, pending, retrying or failed. On phones the rules and executions become two-line lists instead of six squeezed columns; the rule page follows the same treatment and shows how many of its executions need attention.
- **Support keeps the case, its state and the reply together.** Priority and status are shared badges (Urgent, Open, Waiting, Resolved), the created line only names a creator when one is recorded, the thread shows the opening message or an honest "No replies yet" state instead of a blank pane, messages use 12–13px text, and every form label is a real field label (including the plan-upgrade dialog).
- **Dashboards.** The manager metrics use the same warning tone as the owner strip. The owner dashboard was approved in Pass 1 and is unchanged apart from that shared tone; its Needs attention rows already link to their source records.

## Route and state coverage

| Surface | Evidence | Roles and states |
| --- | --- | --- |
| `/dashboard` (owner, manager) | Before/after phone and desktop; six-width browser checks; deterministic captures | Owner and manager; loading, populated, alerts |
| `/reports` and the seven operational views | Before/after; six widths; overview and collections captures; URL journey; six scope unit tests and three totals tests | Owner; loading, populated, stale refresh, empty range, restricted role |
| `/reports/statements` | Redirect to `/finance` unchanged | — |
| `/finance`, the three statements, `/finance/controls` | Before/after; six widths; captures of the hub, income statement, cash flow and the controls Journals tab; scope journey; existing 20 workspace tests | Owner (posting) and read-only roles; coverage warnings; empty ledger; module gating |
| `/payments`, `/payments/shifts` (owner oversight) | Before/after; six widths; shifts oversight capture with a branch chosen; variance review journey | Owner with and without a branch; pending variance |
| `/audit` | Before/after; six widths; URL-backed filter journey with row expansion | Owner; filtered, empty, expanded evidence |
| `/exports` | Before/after; six widths; generate-and-record journey; five presentation tests | Owner; empty and completed requests |
| `/automations`, `/automations/[ruleId]` | Before/after; six widths; phone list journey; two state tests | Owner; global pause, enabled · held, paused, completed, suppressed, failed |
| `/support` | Before/after; six widths; case and dialog journey; existing plan-upgrade test | Owner; open, waiting, resolved cases; empty thread |

The browser suite checks 360, 390, 768, 820, 1280 and 1440px. Deterministic after references live in `apps/web/e2e/__screenshots__/pass-5-*.png`, exercised by `workflow-pass-5.spec.ts`. The baseline captures in `before/` predate implementation; `after/` holds the same script's captures after implementation, plus the extra oversight states (collections view, controls tabs, pending approvals, shifts with a branch chosen).

## Deliberate limits

- The seeded mock ledger has no posted entries, so the statements show empty sections and the "View journal entries" link only appears once a section has lines. The controls Journals tab is verified directly through its URL.
- The automations execution list has no server-side status filter, so the page does not pretend to offer one; failures are counted in the summary and read from the list.
- The overview's "Outstanding now" is the dashboard KPI (unpaid member balances; the mock excludes refunded charges) and the Collections report's "Outstanding now" is computed from the invoice facts, so the two can differ (JOD 592.000 against JOD 822.000 in the seed). Both are server figures; this pass labels them rather than reconciling them, and the difference is flagged for the domain owner.
- The Payments ledger only understands rolling windows that end today, so report rows link into it only when the report's end date is today; otherwise they remain plain text.
- The Impeccable skill is not installed in this environment. An equivalent scan for the DESIGN.md prohibitions ran over the changed targets; findings are recorded in CURRENT_STATE.md. The tracker's detector checkbox stays unticked.
- Hosted Preview checks are Hashem's own review of the Preview; the protected host resets non-browser connections from this session.
