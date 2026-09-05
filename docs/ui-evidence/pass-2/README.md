# Pass 2 review evidence

Baseline: `b06292a` (fetched and verified against `origin/main`). Implementation commits: `dbbae4d`, `59320ed`, `021a85f`. Hashem reviewed the first preview and requested two corrections. The consolidated correction batch is implemented at `352d501`; Hashem approved the pass and authorized the push on 5 September 2026. Actions and Production verification remain pending.

[Open the protected Vercel Preview](https://rivet-hgn62dl9h-nusairhashem04-gmailcoms-projects.vercel.app/login/gym). Deployment `dpl_4tYNU78PJx1tRcRFxw5AgBhA6JJm` is READY, targets Preview, and was built from committed source `352d501`. Authenticated hosted checks opened Leads, Retention, Classes and PT with HTTP 200 at 390px and no horizontal overflow. It uses synthetic mock data. Existing Vercel deployment protection remains enabled.

## Hashem’s consolidated correction batch

- Removed Saved views and Save from Leads. The only state they stored here was search text and Board/List, so they added controls without a useful filtering workflow. Search and Board/List remain URL-backed; saved-view controls on other surfaces and existing stored preferences are untouched.
- Flattened both retention detail panels into a linked member heading, a readable facts grid and a compact wrapping action row. The member-name link replaces the stretched Open member record button. Call, WhatsApp, Log contact and Snooze retain their existing actions. Removed redundant “membership signal” copy and kept each exact risk reason.
- Added selected-member screenshot coverage at 390px and 1440px, alongside the six existing width checks. Focused queue/pipeline component tests, lint, build and typecheck passed. The corrected preview uses the same mock data and existing Vercel protection.

## Workflow changes

- Leads retain explicit Call, No answer, Not sold and Open actions. Small screens have readable rows; the desktop board keeps optional dragging. Owner, last contact and follow-up urgency are visible. Explicit view, search and pagination survive navigation.
- Retention has compact reason filters, exact risk reasons, real 25-record pagination and URL-backed filter/member context. Loaded records remain available during refresh failures. Call, WhatsApp handoff, logged contact/follow-up and snooze retain their existing contracts.
- Classes starts with a dated seven-day agenda showing time, coach, audience, booked/capacity, waitlist and attendance. The weekly timetable remains available, including print. Roster targets are larger and finalization explains the no-show consequence before confirmation. Finalization visibility now follows the existing owner/manager server rule.
- PT starts with member lookup and the existing member booking tab. Compact metrics, trainer availability and package/payment states remain distinct. Trainers see their own availability controls from a scoped workspace response. Payment collection is shown only with its existing permission.
- Public offers distinguish unavailable links, initial request failures, stale terms and recorded responses. Contact phone inputs use the phone keyboard. Shared sale, credit, cancellation, loss and audit semantics are preserved.

## Route and state coverage

| Surface | Evidence | Roles and states |
| --- | --- | --- |
| `/crm/pipeline` | Before desktop/phone; after deterministic desktop/phone; six-width browser checks; pipeline component tests | Owner and sales; explicit terminal reason, board/list persistence, long human records, optional drag, pagination, loading/error/stale review |
| `/crm/leads/[leadId]` | Before phone; after desktop/phone; six widths; existing detail/contact/WhatsApp tests and CRM browser journey | Owner/sales; trial window setup/error/retry, history, contact editing, offers, loss, conversion, pending success |
| `/crm/queues` | Before and after desktop/phone; six widths; filter/member/pagination refresh journey; queue and retention tests | Owner/sales; exact reasons, renewal ranges, empty/search, loading/error/stale, contact, follow-up and snooze |
| `/offers/[token]` | Before/after source inspection; unavailable state checked at all six widths; seven component cases | Public visitor; available/confirm acceptance, preparing, accepted, declined, expired, missing, retry and stale terms |
| `/memberships`, `/plans` | Before desktop/phone and six-width revisit; existing sale/renewal/adjustment journeys | Approved Pass 1 layouts retained; collection, plan changes, reasons, pagination and long names |
| `/classes` | Before and after desktop/phone; six widths; roster role journeys, agenda/date/refresh/keyboard details and finalization review | Owner/manager/reception; schedule, booking, waitlist, attendance, attendee removal, coach substitution, full template removal, loading/error/empty/stale |
| `/pt` and member PT tab | Before and after desktop/phone; six widths; member lookup journey; trainer UI component tests; existing Convex and credit/outcome tests | Owner/manager/trainer UI; empty, pending, scoped access, availability, booking, payment, cancellation, outcomes and stale recovery |
| Shared forms | `after/` captures and `dialog-checks.json`; existing focused form tests | New lead, class editor, trainer profile, package and availability at 390px; footer reachable at 360×520, no page overflow |

The browser suite checks 360, 390, 768, 820, 1280 and 1440px. Twelve deterministic after references live in `apps/web/e2e/__screenshots__/pass-2-*.png`, exercised by `workflow-pass-2.spec.ts`. The thirteen baseline captures in `before/` predate implementation. Dialog screenshots use synthetic preview data. Reduced-height checks approximate keyboard space; they are not claims of testing a physical iOS/Android keyboard. Keyboard Enter, named controls, focus treatment, touch targets and contained timetable scrolling were reviewed. Existing shared offline/realtime and reduced-motion tests remain part of the full gate.

## Deliberate limits

- Dated-class cancellation has no operation in the current client interface. The existing attendee cancellation and reason-gated removal of a weekly template were inspected; this pass does not add a cancellation workflow or rewrite historical bookings.
- Coach payout was deliberately removed on 31 August. There is no PT payout surface to refine. This tracker item is not authorization to recreate it.
- Auditor is retired. Member and platform roles do not operate these staff routes; their existing boundaries remain in the full regression suite. The offer route is public.
- The mock PT workspace still requires `pt.reports.read`; Convex also allows `pt.schedule.self` and scopes trainers to their own schedule. The preview cannot demonstrate the trainer workspace directly. A component test covers its actual controls against that scoped response, and the existing Convex test verifies the authorization/data boundary. No permission was broadened to make a preview work.
- Existing legacy lead stage labels can lack matching trial-event evidence. The UI continues to use factual completion history for sale eligibility, rather than inventing completion or repairing data. Historical offer records without a public token still say that a new offer is required for a public link.
- Existing plan pickers use their established bounded queries; this pass does not alter the sale contract. Pipeline and retention working lists expose pagination instead of silently truncating records.
- The weekly timetable retains its existing owner-requested audience dots. These convey audience, not selected navigation, and do not become colored rails. Reception and marketing remain untouched.

## Verification

- App and Convex typechecks: passed.
- Production build: passed, 67 route entries.
- Unit tests: 212 files, 1,249 tests passed; 14 repository-safety tests passed.
- Lint and secret-output audit: passed, including canonical `pnpm lint` after the isolated preview server was shut down.
- Production dependency audit: no known vulnerabilities.
- Impeccable detector: run once across changed UI targets; `[]` findings.
- `git diff --check`: passed.
- Full Playwright: 80 credential-free journeys verified; 14 staging/credential-gated skips. The full run initially had 78 passes and two failures: a hidden responsive lead link selected by an old test, and a transient member-preview sign-in in the existing visual suite. The selector now targets the visible link; both failed journeys passed in the targeted rerun. No approved Pass 1 screenshot was replaced.
- Correction browser gate: all 13 journeys verified across six widths. The first run passed 12 and encountered a local Next.js JSON parse error on `/plans` at 1280px; the targeted 1280px rerun passed. The 390px capture was regenerated and its journey also passed. No product code change was needed for that development-server error.
- Corrected hosted Preview: READY at source `352d501`; four authenticated phone route checks passed (HTTP 200, correct headings, no page overflow), including absence of Leads saved-view controls and the linked retention member heading.

Run from the repository root: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm audit --prod`, and `git diff --check`. Use an unused `PLAYWRIGHT_PORT` if another operator already owns 3100.
