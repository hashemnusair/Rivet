# Pass 4 review evidence

Baseline: `6b190d5` (fetched and verified against `origin/main`, including the Pass 2 closure). Pass 3 closed on `main` at `9caab72` while this pass was in progress; the work was integrated onto that tip before any commit, and the member section tabs adopt the shared underline tab strip Hashem approved there. Implementation commits: `9f6a78f`, `5a556d6`, `1d2696d` and `816205a` (rebased onto `21788af`, which realigned the Pass 2 retention references). This pass is presented for Hashem's Preview review; `main` has not been pushed.

[Open the protected Vercel Preview](https://rivet-11pgc2j6x-nusairhashem04-gmailcoms-projects.vercel.app/login/member). Deployment `dpl_4NuGxbM5wLQAK1mEmRC2yKRz1MKh` (GitHub deployment 6280576593) targets Preview and was built by the Vercel Git integration from the pushed review branch `review/ui-workflow-pass-4` at `816205a`. It uses synthetic mock data and the existing Vercel deployment protection. Hosted 390px checks could not be run from this session: the protected host resets non-browser connections, the in-app browser refuses the domain, and Claude in Chrome was not connected, so the hosted check is Hashem's own review of the Preview. The equivalent local checks (six widths, touch journeys, deterministic captures) are recorded below. Sign in as Lina Haddad for an active member with a membership, or Yousef Nasser for a member who is still looking for a gym.

## What changed for members

- **Home says what is true.** Each membership is one pass: the gym's mark, plan and branch, a status chip and a dated sentence ("Ended 12 Aug 2026", "Valid until … · 40 days left"), the member number, and two actions: Entry QR and Membership. The duplicated Profile and Find a gym buttons are gone, and a gym without a cover image no longer paints a solid accent slab. The installed-app shortcuts now work: `?entry=1` opens the pass from the home screen and `?section=pt` continues into the only membership.
- **The entry pass is one component.** The dialog states when the pass expires, flips to an expired state on time with a refresh action, explains a failed request with a retry, and never leaves a scannable code behind when closed.
- **Membership detail is one summary, then the rest.** The section tabs (Membership, Classes, PT) use the shared underline tab strip from the Pass 3 consistency follow-up, are URL-backed, arrow-key operable, and scroll the selected tab into view on phones without moving the page. The summary panel carries the plan, status sentence, progress while active, member number, branch, visits, balance and the gym's WhatsApp and Call actions. Freeze requests use labelled fields with a numeric keyboard and plain outcome copy. The referral panel is compact and keeps its reward history. Classes and PT keep their contracts with larger targets and no sub-12px copy; failed refreshes keep the loaded timetable or credits on screen.
- **Payments read as a ledger strip.** Outstanding, paid and receipt counts sit in one panel; the search is first on phones with the narrower filters behind one toggle that shows what is active; every row with a receipt is a full-width tap target. Background refresh failures keep the loaded list. The redundant My gyms button is gone.
- **Receipts print and read.** The member receipt now shares the print stylesheet's `receipt-print` id, so Print no longer produces a blank page. Human language is in Manrope with the receipt number in mono, the total is prominent, balance remaining is explicit, and a missing receipt sends the member back to Payments instead of the staff dashboard. Download remains a plain-text copy.
- **Discovery and gym pages use the product system.** No marketing hero, grid overlay, oversized display type, scroll-reveal motion or per-card signal buttons. Search and category are URL-backed; the category switcher uses the shared tab strip with pressed buttons, and cards carry the gym mark, facts and one secondary action. The gym page has a product header, a Book a free trial jump on phones, and a flat booking panel with labelled fields, a phone keyboard and one signal action.
- **Profile, guide, offline and signup are consistent.** Profile uses the shared page header and 44px fields with tel keyboards; the guide drops the framed icon and only offers install or notification controls that can actually work; the offline page respects the safe area; the preview signup notice lives inside the member sign-in frame; the Clerk verification panel is a flat panel.
- **The shell fixes two member-facing defects.** Communication settings now links to the profile section that actually exists, and the onboarding banner's Continue setup no longer sends members to the staff route; the banner also stops calling a member account "your workspace". The dock hides while a text field is focused so the keyboard never fights it, and account menu items meet the 44px target on phones.

## Route and state coverage

| Surface | Evidence | Roles and states |
| --- | --- | --- |
| `/customer/my-gyms` | Before/after phone and desktop; six-width browser checks; deterministic captures; six component tests | Lina (membership), Yousef (none); ended/active/ending/frozen status logic; entry and section shortcuts; empty state |
| `/customer/my-gyms/[membershipId]` | Before/after; six widths; classes and PT captures; entry pass captures; existing five component tests plus dialog tests | Membership, classes, PT, freeze, referral, activity; loading, error, background-refresh, not-found |
| `/customer/finance` | Before/after; six widths; three component tests with populated fixtures | Loading, populated rows, filters, empty, failed load; export action |
| `/customer/receipts/[receiptId]` | Component tests with fixture; browser check of the not-found route | Populated receipt, plain-text copy, not-found, failed load |
| `/customer/discover`, `/customer/gyms/[gymId]` | Before/after; six widths; phone trial journey; existing nine gym component tests | Visitor and member; search/category state; empty search; booking form states; success |
| `/customer/profile`, `/customer/getting-started` | Before/after; six widths; account-menu journey | Saved state, error state, communication preferences, install and notification states |
| `/login/member`, `/login/member/create`, `/customer/signup`, `/customer/login` | Six widths; existing signup component tests; redirect check | Preview chooser, preview signup notice, Clerk signup client, legacy redirect |
| `/offline`, manifest, service worker | Six widths; existing manifest and service-worker policy tests | Static offline page, standalone start URL and scope |
| Member dock and account menu | Component tests; touch journeys at 390px | Safe-area clearance, keyboard hiding, single window, menu links, sign out |

The browser suite checks 360, 390, 768, 820, 1280 and 1440px. Twenty deterministic after references live in `apps/web/e2e/__screenshots__/pass-4-*.png`, exercised by `workflow-pass-4.spec.ts`. The baseline captures in `before/` predate implementation; `after/` holds the same script's captures after implementation. Reduced-height checks approximate keyboard space; they are not claims of testing a physical iOS/Android keyboard. Touch journeys use a touch-enabled context.

## Deliberate limits

- The seeded preview member (Lina, `ABD-2214`) has no generated payment records, so the Preview shows the empty payments state. The populated list and the receipt are verified with component fixtures. Adding records to the demo seed would shift approved Pass 1 screenshots and totals, so the seed was left alone.
- The Impeccable skill is not installed in this environment. An equivalent scan for the DESIGN.md prohibitions ran over the changed targets; its only findings were pre-existing marketing tokens, the shared sign-in footer treatment and the gym mark's monogram, which is a record-style mark rather than human copy. The tracker's detector checkbox stays unticked.
- Trial bookings are not listed on the member home. That region was removed deliberately in an earlier release and the existing journey asserts its absence; this pass keeps that decision.
- `/customer/login` is a redirect to `/login` and has no interface of its own.
- Push notifications remain unconfigured in preview (`NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` unset), so the guide explains that state instead of offering a dead button.
- Two shared files carry member-scoped fixes: the onboarding banner (member copy and member route) and the member dock CSS in `globals.css`. No other shared component changed.

## Verification

- App and Convex typechecks: passed on the integrated tree.
- Lint and secret-output audit: passed (canonical `pnpm lint`, zero warnings).
- Unit tests: 220 files, 1,284 tests passed, including 25 new component and unit tests for the member home, entry pass, section tabs, status logic, payments, receipt and shell; 14 repository-safety tests passed.
- Production build: passed, 67 pages.
- Full Playwright: full run on the integrated tree: 100 journeys passed, 14 explicit credential-gated skips, 4 failures. The two navigation timeouts (the operations workflow journey and the Pass 2 360px sweep) passed in an isolated rerun and match the local startup flakiness recorded by Passes 2 and 3. The two Pass 2 retention-detail captures (390 and 1440px) fail identically on `origin/main` itself: GitHub Actions run 33961660539 for the Pass 3 tip `9caab72` failed its browser job on exactly those captures and on two Pass 3 journeys. Nothing in this pass touches that panel, so those references are left for the Pass 3 release verification rather than regenerated here.
- Pass 4 suite: 12 journeys pass deterministically on the integrated tree against the 20 committed references (a second run without snapshot updates). The design-system visual suite passes with the regenerated member finance reference; the other Pass 1 references are byte-identical to `main`.
- Production dependency audit: no known vulnerabilities.
- `git diff --check`: passed.
- Linux references: Linux Chromium renders the ten 390px captures beyond the 4% ceiling (the sign-in capture differed by 6% in Actions run 33964187792 for the review commit), so each 390px capture keeps an inspected Linux reference at the same tolerance, generated on GitHub's Ubuntu runner (run 33970182948, corrected in run 33970396433 after the framework badge was excluded) and verified there: run 33970396433 passed all 12 Pass 4 journeys on Linux. The 1440px captures matched on both platforms. The temporary capture workflow lived only on the throwaway branch `tmp/pass-4-linux-refs`, which is deleted after release.
- Equivalent banned-pattern scan (the Impeccable skill is not installed here): the changed member targets carry no `transition-all`, gradient, glass, resting shadow, oversized radius, hover-only motion, marketing utility, colored rail or sub-12px human copy; the remaining hits are pre-existing marketing tokens in `globals.css`, the shared sign-in footer treatment and the gym mark's monogram.

Run from the repository root: `pnpm typecheck`, `pnpm convex:typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, `pnpm audit --prod`, and `git diff --check`. Use an unused `PLAYWRIGHT_PORT` if another operator already owns 3100.

## Release verification

Hashem reviewed the Preview and approved the pass on 5 September 2026 ("merge to main") with no correction batch. The approved implementation finishes at `332973a` (the four pass commits rebased onto the Pass 3 closure, plus the inspected Linux references). Push, GitHub Actions and Vercel Production verification for the exact pushed SHA are recorded below once complete.

- Pushed: `main` fast-forwarded to `affb49b` after a final fetch found no partner advancement; the review branch `review/ui-workflow-pass-4` and the temporary `tmp/pass-4-linux-refs` branch were deleted.
- GitHub Actions: [run 33970837435](https://github.com/hashemnusair/Rivet/actions/runs/33970837435) passed every job for `affb49b`.
- Vercel Production: `dpl_CJiusik3bL597A2akbXgKzgE4eaa` READY for the exact pushed commit; `www.rivetjo.com`, `app.rivetjo.com/login/member` and `dashboard.rivetjo.com/login/gym` returned HTTP 200, the root domain redirected (308) to www, `/dev/design-system` returned 404 and the new `/customer/signup` redirect answered 307 to the canonical signup.
- Convex: no deploy needed; no `apps/web/convex/**` file changed in this pass.
