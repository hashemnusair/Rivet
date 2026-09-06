# Pass 7 review evidence

Baseline: `b86f146` (fetched and verified against `origin/main` after the Pass 5 closure; the Pass 6 Settings work is proceeding in parallel in the same checkout and is not part of this pass). Implementation commits, the review Preview and Hashem's decision are recorded in the Review section at the end of this file and in the tracker.

Sign in as the platform administrator (`/login/admin` → Open platform console) for every console surface, and as Omar Al-Khatib (owner) for `/getting-started` and `/onboarding/agreement`. The sign-in portals, the invitation states, the gym application, the public offer link, the legal pages, the offline page and the not-found page are reached signed out.

## Verification

| Check | Result |
| --- | --- |
| Typecheck (web and Convex) | Passed |
| Lint (zero warnings) with the secret-output audit | Passed on the tracked sources; the local run also had to skip the parallel Pass 6 session's untracked `.next-pass6` build output, which is not in the ESLint ignore list and does not exist in CI |
| Vitest | 225 files, 1,301 tests passed (5 new: gyms navigation mock, sentence-case application status, sunken focus row, already-accepted invitation) |
| Repository safety tests | 14 passed |
| Production build | 67 pages, no tracked file changed by the build |
| Production dependency audit | No known vulnerabilities |
| Patch formatting | `git diff --check` clean |
| Pass 7 browser suite | 29 of 29 passed in one run: four tests per width at 360, 390, 768, 820, 1280 and 1440px with 36 deterministic references, plus five journeys (shareable console filters, keyboard search into a gym record and its billing deep link, support reply and resolution, application validation and receipt, not-found recovery and the legacy redirects) |
| Full credential-free browser suite | 140 passed, 20 failed, 14 skipped (credentialed tiers) in a 45-minute run on a laptop shared with the parallel Pass 6 session; every failure was a navigation aborted or a click landing before hydration under that load, and all 20 passed when their spec files were rerun alone once the machine was quiet, after one legitimate reference realignment (below) |
| GitHub Actions on the review branch | [Run 34048045890](https://github.com/hashemnusair/Rivet/actions/runs/34048045890) for `d88fdbb` passed every job on a clean Ubuntu runner: typecheck, lint, unit tests, build, audit and clean worktree; the Convex generated-code check; and the full credential-free browser suite (3 flaky,14 skipped,143 passed) with the Linux references and the invitation-route fix |
| Design-system checkpoint | `platform-gyms-desktop.png` regenerated for the refined directory; the other five checkpoint references are unchanged and the checkpoint test passes |
| Cross-pass reference | `pass-4-login-member-390.png` regenerated because the shared sign-in chrome's footer moved from 10.5px mono to 12px Manrope, shifting the centred content by a few pixels (7% of the frame at 390px); the Pass 4 suite passes on it |

The 390px captures select `-linux.png` references on Linux, as the earlier passes' captures do; the Linux variants are generated on a GitHub runner and recorded in the tracker's release paragraph.

## What changed for RIVET staff and for people arriving at RIVET

- **The console is one product surface.** Every platform page shares one content frame (`PlatformPage`), the workspace's paper canvas, the 26px page title and 8px hairline panels; the earlier square panels, sunken canvas, 30px titles, "Network control" eyebrows, hover shadows and night-tinted panels are gone. The sidebar matches the gym workspace's quiet tonal navigation (32px rows, one active cue, `aria-current`), the "Platform" mark is set in Manrope, the identity block says "RIVET staff", and the phone drawer is a labelled dialog that Escape closes.
- **One administrative status language.** Tenants, applications, invoices, support cases and email deliveries use the same shared badge shape with sentence-case labels and four meanings (`platform-status.tsx`): Active / Trial / Past due / Suspended / Cancelled, Pending / Under review / Approved / Rejected, Draft / Open or Upcoming / Paid / Past due or In grace / Failed / Void, Urgent / Normal and Open / Waiting / Resolved, Sent / Failed / Not configured. The `info` colour that four pages referenced never existed in the token set; those states now use the neutral surface.
- **Signal red is rare again.** The console had signal buttons on nearly every page (Manage gyms, Add gym, Manage subscription, Save listing, Publish draft, Approve, Provision, Send reply, Review, Confirm & bill). Routine primary actions are now the ink primary; signal remains only for the one exceptional commit on a screen: Bill a gym on Billing, Confirm & bill inside the wizard, and Provision gym workspace on an approved application.
- **The overview leads with the work.** "Needs attention" sits directly under the header, before the healthy totals, and each item links to the console filter that resolves it (pending applications, provisioning failures, past-due accounts, urgent support cases, trials ending soon). The totals, billing position, subscribed gyms, network demand and operator activity follow as panels with `Stat` blocks and readable 12.5–13.5px rows.
- **Shareable queues.** The gym directory's status and search live in `?status=&q=`, the application queue's status in `?status=`, and both read the URL back on refresh, back and forward; the existing `?application=`, `?invoice=`, `?bill=` and `?case=` deep links are unchanged. Filters use the pressed-pill pattern the reports scope bar established.
- **Gym record.** The subscription facts are a normal panel instead of a night block, the renewal value is a formatted date instead of a raw ISO timestamp, usage labels and the timeline are human language (mono only for the action code and branch codes), the danger zone is a plain panel with the danger button, and the two-column layout no longer stretches the branches panel to the facts column's height.
- **Applications.** One toolbar (search plus pressed status pills), a readable list (name, owner · plan, chip, submitted date), a detail pane with an applicant definition list, a labelled review-notes field, truthful email-delivery badges and a decision column where Approve is primary, Mark under review secondary and Reject danger. Provisioning states keep their exact copy (Ready to provision, in progress, partial, permanent, provisioned) as inline semantic notices.
- **Billing.** The past-due notice moves above the totals and says what to do; the totals lead with Outstanding; Gym subscriptions and the invoice ledger use the shared table with 13px rows, mono invoice numbers and the shared chips; the manual-invoice disclosure and the exception-invoice row are plain panels; the dialogs use labelled fields; the billing wizard's steps, plan and cadence choices, "Current" chip and billing preview use ink, sunken and hairline instead of night and signal tints.
- **Pricing & entitlements.** The four tiers are four equal panels (no night or signal-tinted cards), the provisional-pricing warning is kept as a truthful note, and the description now says that a gym's own subscription is changed in Billing.
- **Agreements and Email log** finally sit inside the content frame instead of flush against the shell, with a real loading state (`role="status"`) instead of a blank Suspense fallback; their tables, badges and dialogs are otherwise unchanged.
- **Support inbox.** Cases show a mono ID beside the gym in Manrope, the subject, and the priority and status chips; the header carries the same chips, a plain link to the gym record, and an honest first-response line; messages are 13px in surface and sunken bubbles; the reply form is a labelled field with a primary button; a resolved case says how to continue.
- **Sign-in portals and invitations.** The auth chrome's mono uppercase footers and the night panel's mono signature are Manrope sentence case; the portal tile is one neutral mark for every audience (signal stays on the admin portal's single action); the verification card is a flat hairline panel instead of a rounded, shadowed card; helper copy is at least 12px. An invitation opened while signed out after its account already exists now says "This invitation was already accepted" with a Sign in action instead of spinning on "Verifying your invitation".
- **Gym application.** The public form leaves the marketing grid, the ink frame and the resting shadow behind: a 26px title, one hairline panel, two 15px section titles, ink selection states for the plan and cadence, an ink primary submit (the marketing header already carries the page's one signal action) and a flat receipt panel. Validation, the fallback catalog notice and the receipt copy are unchanged.
- **Error, not-found, getting started.** The not-found page offers "Go back" (history, or the public site when there is none) and "Open RIVET" (sign-in, which routes by role) instead of a dashboard link that is wrong for members and visitors; the root error boundary uses the page-title scale and says reloading keeps you where you are; the owner's getting-started header drops its decorative signal icon.

## Route and state coverage

| Surface | Evidence | Roles and states |
| --- | --- | --- |
| `/platform` | Before/after phone and desktop; six-width browser checks; deterministic captures; existing overview test | Administrator; attention items, quiet state, loading placeholders, empty directory and audit |
| `/platform/gyms` | Before/after; six widths; URL journey; seven component tests (navigation mocked) | Administrator; active default, every status filter, search, empty, stale, loading, error |
| `/platform/gyms/[gymId]` | Before/after (provisioned and cleanup-only rows); six widths; reason-gate journey; seven component tests | Administrator; provisioned, unprovisioned, suspended listing, draft awaiting review, archive dialog, stale |
| `/platform/applications` | Before/after; six widths; URL journey; seven component tests | Administrator; pending, under review, approved, rejected, every provisioning state, empty, loading, error, live-subscription race |
| `/platform/billing` | Before/after; six widths; `?bill=` journey; eight page tests, three subscription tests, three wizard tests | Administrator; past-due notice, renewal states, automatic and manual ledgers, focused deep link, dialogs |
| `/platform/subscriptions` | Before/after; six widths; six component tests | Administrator; loading, empty, failed, edit dialog validation and module dependencies |
| `/platform/agreements` | Before/after; six widths; two component tests with the signature pad | Administrator; awaiting and countersigned, deep link, reveal, countersign, resend, void |
| `/platform/email-log` | Before/after; six widths; one component test | Administrator; suppressed and delivered rows, empty |
| `/platform/support` | Before/after (`?case=` selected); six widths; reply-and-resolve journey; one component test | Administrator; loading, empty, no matching case, legacy case without history, resolved |
| `/login`, `/login/gym`, `/login/admin`, `/login/member` | Six widths; captures of the chooser, gym team and platform portals; existing portal, identity and password tests | Signed out; preview chooser, staff roles, unavailable-gym recovery fixture, admin entry |
| `/login/accept-invitation` | Six widths; captures of the already-accepted state; seven component tests (one new) | Invalid link, expired, revoked, already accepted, sign-up form, conflict, verifying, error |
| `/login/gym/create`, `/onboarding/gym` | Redirect journey | Both land on `/signup` |
| `/signup` | Before/after; six widths; validation-and-receipt journey; two component tests | Signed out; validation errors, fallback catalog notice, annual cadence, receipt |
| `/onboarding/agreement`, `/getting-started` | Before/after; six widths; captures; existing signing and checklist tests | Owner; signed and countersigned record, checklist progress |
| `/offers/[token]` | Six widths of the unavailable link; existing three component tests | Unavailable link, outage retry, preserved terms, acceptance dialog (component fixtures) |
| `/privacy`, `/terms`, `/offline` | Six widths; existing legal-page tests | Signed out; contents navigation, retention table, contact links |
| Not found and the root error boundary | Six widths; go-back journey | Signed out and signed in; back to the previous page, into sign-in |

The browser suite checks 360, 390, 768, 820, 1280 and 1440px. Deterministic after references live in `apps/web/e2e/__screenshots__/pass-7-*.png`, exercised by `workflow-pass-7.spec.ts`. The baseline captures in `before/` predate implementation; `after/` holds the same script's captures after implementation.

## Deliberate limits

- A live public offer cannot be shown in the mock Preview: seeded offers carry no public token, the CRM's "Open offer" link opens a new tab, and the mock database is per-tab memory, so a fresh tab always answers "This link cannot be opened". The available, preparing, expired, accepted and declined states are covered by the offer component's fixtures; the browser suite checks the unavailable state at every width.
- The shared onboarding checklist (its uppercase category chip and signal progress bar) is also the member guide that Pass 4 approved and captured, so it is left untouched; only the staff page header changed.
- The marketing header on `/signup` belongs to the landing-page system and keeps its signal call to action; the form's own submit is therefore the ink primary so the page keeps one signal action.
- The seeded mock support cases carry no timestamps or creator, so the inbox shows no time and no creator for them rather than "not recorded" filler; the detail header still states that the creation time is not recorded.
- `/login/accept-invitation` in preview mode runs against Clerk's development instance; the sign-up form renders and validates, but no ticket can be redeemed in the mock.
- The Impeccable skill is not installed in this environment. An equivalent scan for the DESIGN.md prohibitions ran over the changed targets; the tracker's detector checkbox stays unticked.
- Hosted Preview checks are Hashem's own review of the Preview; the protected host resets non-browser connections from this session.

## Review

- Implementation commits: `350063f`, `eef2abd`, `dbf73c3`, `e333740`, `e94f004`, `8358ac0` and `38f60e1`.
- Preview: https://rivet-ebfqypj7c-nusairhashem04-gmailcoms-projects.vercel.app (GitHub deployment 6295612990, READY, built by the Vercel Git integration from review branch `review/ui-workflow-pass-7` at `8358ac0`, protected, synthetic mock data; the earlier deployment 6295389058 at `e94f004` is the same build without the invitation-route fix). Hosted checks could not run from this session (the protected host resets non-browser connections and the in-app browser pane did not render), so the hosted check is Hashem's own review; the equivalent local checks are recorded above.
- Linux references: GitHub Actions run 34047242595 on the throwaway branch `tmp/pass-7-linux-refs` (deleted after download) generated and verified the eighteen `pass-7-*-390-linux.png` references and the realigned `pass-4-login-member-390-linux.png`.
- Hashem's decision: pending. One consolidated correction batch follows the review; `main` is pushed only after approval, after a final fetch and integration.
