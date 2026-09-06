# Pass 6 review evidence

Baseline: `b86f146` (fetched and verified against `origin/main` after the Pass 5 closure). Scope is exactly the tracker's Pass 6 list: the Settings shell (sticky heading, rail, search, phone picker, URL state) and its sixteen sections: Organization, Brand Kit, Public profile, Branches, Gym spaces, Agreement, Subscription & invoices, Users, Roles & permissions, Payments, Receipts & tax, Notifications, Operational email, Operational rules, Hours & trials and Daily checklists.

Sign in as Omar Al-Khatib (owner); the seeded owner reaches every section. The manager persona cannot open Settings in the seed (no staff or settings permission), so the manager-with-staff-rights case is verified with a component test rather than in the Preview.

## What changed for owners

- **Every section starts the same way.** The section heading matches the rail label and the phone picker exactly (the old "Staff", "Permission matrix", "Member service email" and "Draft and publication" titles no longer disagree with the navigation), followed by one sentence of context and the section's primary action in the same place each time (Add branch, Add gym space, Invite user, New checklist, Download PDF, Publish draft / Send to RIVET for review). The decorative eyebrows, the framed Brand Kit icon and the three different heading sizes are gone; panels inside a section carry 15px panel titles.
- **One save model.** Every editable section uses the shared save bar: it appears on the first edit, names what is unsaved, disables Save with the reason when a value is invalid, saves with Ctrl/Cmd+S, shows "Saving changes…" then "Changes saved", keeps a failed save's message in view, and guards section changes, internal links and page unload with Stay / Discard and leave / Save and leave. Public profile, Payments and Notifications join it: the public profile's draft is saved from the bar while publication stays an explicit action in the header; payment methods and discount limits save as one draft (each part is saved on its own, so a partial failure keeps only the failed part dirty and says which); manager alerts, renewal recovery, external delivery and quiet hours save together (the quiet-hour fields previously wrote to the server on every keystroke).
- **Toggles read as rows, not cards.** Switch rows are divided lists with a 44px target across the whole row and a hint that says what the switch changes; header switches (Member booking, Reward referrals, Accept requests) visibly govern the fields beneath them. Units sit inside the field (7 days, 2 min, 50.000 JOD, 5 %) instead of in labels.
- **Records work on phones.** Branches, Gym spaces, Users and Invoices become two-line lists below 768px with the same actions; the permission matrix becomes a role picker with one permission per row (the old matrix was a 4,000px horizontal scroll with 20px cells); the desktop matrix keeps a sticky permission column, 44px coarse-pointer cells, a busy state while a change saves and keyboard operation; the invite dialog stacks its fields.
- **The rail is keyboard operable and the URL is the truth.** Arrow keys, Home and End move focus along the rail and Enter chooses, so an unsaved-changes prompt never fires while browsing; the section lives in `?section=`, survives refresh and Back, and the search narrows the rail without losing the open section (with a clear control, Escape, an announced match count and a sentence naming the section still shown).
- **Permission and failure states are truthful.** The rail and phone picker list only the sections the signed-in role can save (server permissions are unchanged and still enforced); a deep link to another section explains which permission it needs instead of showing a form that would be refused. Every section that loads settings now has a section-level error state with Try again (Branches, Users, Roles, Payments and Notifications had none), and empty branches, spaces, staff, invoices and checklists each say what to do next.
- **Copy, sizes and states.** Status chips use sentence case (Active, Invited, Deactivated, Published), the email readiness badges read "Worker live", "Provider configured" and "Webhook verified", delivery notices are rounded and toned, helper copy is 12px or larger, raw `<select>` elements are the shared Select, the gallery controls are real icon buttons, the agreement and subscription pages share the same section and panel treatment, and Hours & trials opens on the session's branch instead of an empty "Choose a branch" state.

## Route and state coverage

| Surface | Evidence | Roles and states |
| --- | --- | --- |
| `/settings` shell (heading, rail, search, phone picker, URL state) | Before/after; six widths; URL / search / refresh / Back journey; keyboard journey; existing happy-path geometry journey; two permission component tests | Owner; manager with staff rights (component test); deep link to a closed section |
| Organization, Receipts & tax | Before/after; six widths; guard / shortcut / discard journey | Owner; dirty, invalid, saving, saved, failed, discard, guard |
| Brand Kit | Before/after; six widths; existing three component tests | Owner and non-owner notice; invalid hex; pending logo |
| Public profile | Before/after; six widths; draft / publication journey; existing two component tests; existing guard tests | Owner; published-locked, draft, dirty, pending media |
| Branches, Gym spaces | Before/after; six widths; phone list journey; existing gym-spaces journey and component test | Owner; populated, empty branch, dialogs |
| Agreement, Subscription & invoices | Before/after; six widths; existing legal and invoice tests | Owner; countersigned record; one paid invoice; empty invoices |
| Users, Roles & permissions | Before/after; six widths; phone list and role-picker journey; keyboard matrix journey; the Pass 1 desktop Settings reference (`settings-desktop.png`) still needs refreshing on a quiet server | Owner; active, invited, deactivated; pending toggle |
| Payments, Notifications | Before/after; six widths; one-draft journeys; updated component tests | Owner; invalid limit, no method, discard, saved |
| Operational email | Before/after; six widths; existing five component tests | Owner; worker disabled; reason required |
| Operational rules, Hours & trials | Before/after; six widths; existing draft and guard tests | Owner; governed fieldsets; branch preselected; closed days |
| Daily checklists | Before/after; six widths | Owner; populated list; editor dialog |

The browser suite checks 360, 390, 768, 820, 1280 and 1440px. Deterministic after references live in `apps/web/e2e/__screenshots__/pass-6-*.png`, exercised by `workflow-pass-6.spec.ts`. The baseline captures in `before/` predate implementation; `after/` holds the same script's captures after implementation.

## Deliberate limits

- The seeded manager has neither staff nor settings permissions, so the Preview cannot show a partially permitted Settings; that state is covered by `settings-permissions.test.tsx`.
- The Payments section saves methods and each role's limit as separate server calls (there is no combined mutation). A partial failure is reported per part and only the failed parts stay unsaved.
- The credential-gated staging journey `staging-owner-settings.spec.ts` already referenced a "Rules & hours" tab and a "Save operational rules" button that stopped existing before this pass; it is left as found and flagged for the staging owner rather than rewritten blind.
- The Impeccable skill is not installed in this environment. An equivalent scan for the DESIGN.md prohibitions ran over the changed targets; findings are recorded in CURRENT_STATE.md. The tracker's detector checkbox stays unticked.
- Hosted Preview checks are Hashem's own review of the Preview; the protected host resets non-browser connections from this session.
- The Pass 1 design-system reference `settings-desktop.png` captures the Roles section, which changed on purpose. Every local attempt to refresh it coincided with the shared dev server rebuilding under the partner agent's saves, so it is refreshed before the release push, once the checkout is quiet; until then the design-system visual job fails on that one capture.

## Verification

| Check | Result |
| --- | --- |
| Typecheck (web and Convex) | Passed |
| Lint (zero warnings) with the secret-output audit | Passed on the Settings feature and route files; the whole-tree run is recorded on the review branch by GitHub Actions (the local tree carried a temporary build directory outside the ESLint ignore list while a partner agent worked in the same checkout) |
| Vitest | 225 files, 1,301 tests: 1,299 passed in the full run; the two 5-second timeouts (the Settings gym-spaces page test and the operations command center test) ran during a concurrent Production build and passed on rerun alone (20 of 20) |
| Repository safety tests | Included in the Vitest run |
| Production build | Compiled successfully, 67 static pages, no tracked file changed by the build |
| Production dependency audit | No known vulnerabilities |
| Patch formatting | `git diff --check` clean |
| Pass 6 browser suite | 14 of 14 passed inside the full local run (six widths with 32 deterministic references, plus eight journeys); the 390 and 1440 sweeps were also verified on their own |
| Full browser suite | Not stable in this checkout: a partner agent edited and tested in the same tree, and each of its saves rebuilt the dev server mid-test (stack-less "Invalid or unexpected token" chunk errors, sign-in timeouts, one server restart under memory pressure). The first full run passed 80 with 14 credential-gated skips and 62 environment failures; the specs that touch Settings (the happy-path Settings navigation geometry, the legal agreement record) passed in it. The clean full-suite verdict is GitHub Actions on the review branch |

Reference captures are viewport-sized like the earlier passes; the `after/` folder holds full-page captures of the same routes from the same script as `before/`.

The Pass 6 sweeps ignore exactly one page error: a stack-less "Invalid or unexpected token", which is the dev server handing a rebuilt chunk to a page that loaded before the rebuild. A real syntax error fails the build, typecheck and lint gates; every other page error still fails the sweep.
