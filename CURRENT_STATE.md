# GymOS / RIVET current implementation state

## Credentialed release verification — 31 August 2026

- The isolated Development release pass exercised the owner-settings,
  staff-authorization, membership-lifecycle, reception-entry,
  finance-reconciliation, member-portal, isolation/audit, personal-training,
  and realtime journeys with role-specific Clerk identities. Every created
  finance, PT, and invitation artifact was cleaned up, and the shared staging
  ledger now fails a journey when any planned cleanup remains incomplete.
- Live verification exposed and fixed two contract defects: legacy role rows
  now retain the later product-owned PT/operations/accounting capabilities
  until an owner saves the current permission catalog, and staff invitations
  call the dedicated Convex action with its actual validator shape instead of
  the generic domain-operation envelope.
- The trial/CRM and gym-provisioning public-write journeys remain blocked in
  Development because `RIVET_PUBLIC_REQUEST_PEPPER` is absent from
  `fleet-otter-621`; the fail-closed behavior is correct. The salesperson
  browser state also expired and must be refreshed before the sales-specific
  trial pass. Automation remains deliberately deferred and disabled.
- Local verification passed both TypeScript checks, zero-warning lint and
  secret-output audit, 169 Vitest files / 1,013 tests plus 14 repository-safety
  tests, the 58-page Production build, a focused two-role class-calendar
  browser regression, the Production dependency audit, and `git diff --check`.
  The complete credential-free browser suite is left to the pushed GitHub gate
  so it runs against a fresh mock server rather than the active credentialed
  Development server on port 3100.
- Release tip `b1da867` is pushed on matching `main` and `origin/main`.
  Vercel completed the exact-SHA deployment, and the guarded Convex dry run and
  deploy explicitly targeted Production `descriptive-meerkat-589`; schema
  validation passed and no indexes were deleted. Production health returned
  `status: ok`, the renewal aggregate audit returned zero records, and the
  default-off subscription preview processed five organizations with two
  eligible and zero invoice, past-due, or suspension writes.
- A hard reload of the authenticated owner session cleared the stale cached-data
  banner. Audit, Operations, Finance/Statements, and Settings loaded live with
  no browser errors; Renewal recovery was unchecked and external delivery was
  disabled. Vercel is green, and GitHub run `33341837875` passed all three
  jobs, including the clean-server credential-free browser suite.

## Membership migration and member referral sharing — 30 August 2026

- The batch started by fetching GitHub and merging Elias's five Settings
  follow-ups (`4fdde4f` through `3755f66`) into `main` without rewriting
  partner history. Merge commit `d2a45e2` was pushed before feature work began.
- Commit `d4a66c8` expands the existing file-first CSV/XLSX member importer into
  the approved membership-migration contract. A gym can map source plans to
  active RIVET plans and import active or scheduled terms, remaining visits,
  a current freeze, an opening balance, and read-only historical payment
  evidence at an explicit migration cutoff date. Profile-only imports remain
  valid.
- Migration never fabricates historical sales, payments, receipts, cash shifts,
  or posted revenue. Imported terms use zero sale price; opening balances are
  dated migration receivables marked ineligible for accounting-source posting;
  historical paid totals are evidence records only. Source filename, row,
  mapping, cutoff, batch progress, rejection, and audit provenance are retained
  without storing the uploaded workbook body.
- Resumable commit and seven-day undo now cover the exact untouched member,
  membership, opening-receivable, freeze, and historical-evidence records made
  by the batch. Any later operational or financial use makes that row ineligible
  for undo and the skip is reported rather than silently deleting history.
- Commit `24e3749` adds the member referral-sharing loop. Eligible members see
  the gym's configured reward, rolling-window progress, and an on-demand
  private share link in My Gyms. The URL contains only an opaque token and
  survives real member signup before the referred visitor submits a trial.
- Convex validates a referral against the exact target gym and a live referrer,
  records the CRM lead as `source: referral`, carries attribution through the
  completed-trial sale, and delegates the reward to the existing first-sale,
  cap, active-membership, self-referral, and immutable-audit rules. The token is
  not copied into the trial booking or exposed to gym staff.
- Mock parity covers the same link → trial → CRM → member → first-sale reward
  path. Its atomic trial-sale helper was corrected after the new integration
  test found that it had dropped referral attribution while Production Convex
  preserved it.
- Commit `fe54838` aligns browser, mock, and Convex import-size validation at
  5 MB (measured as UTF-8 bytes) while retaining the 10,000-row batch cap.
- Commit `31eae98` aligns the synchronous member-preview fixture with the
  enabled referral policy so the first browser paint and the live API
  projection expose the same referral card.
- The completed local gate passed both TypeScript checks, lint/secret audit,
  169 Vitest files / 1,011 tests plus 14 repository-safety tests, the 58-page
  Production build, `pnpm audit --prod`, `git diff --check`, and 46
  credential-free Playwright journeys with 14 explicit staging-only skips and
  zero failures. The Impeccable UI detector reported no flagged patterns in
  the importer or member referral surfaces.
- No Convex deployment, provider activation, or Production tenant-data import
  was performed for the migration/referral commits. During the final sync,
  Elias's commit `3c43829` recorded that Convex Production
  `descriptive-meerkat-589` was deployed cleanly through merge `d2a45e2`
  (schema valid; no index deletions). Current application code tip `31eae98`
  still needs the normal exact-target backend/hosted release procedure after
  the repository push.

## Partner features, weekly timetable, and integration hardening — 30 August 2026

- Classes moved from dated sessions to a fixed weekly template: `classSessions`
  now stores `dayOfWeek`/`startMinute` (legacy dated rows are normalized on
  read in the tenant timezone), the page renders a gantt-style grid (days down,
  hours across, chips spanning their duration with lane packing for overlaps),
  and each class carries a Women/Men/Mixed audience shown as a W/M badge.
- The class scheduler gained a coach directory (`classes.coach.upsert/remove`,
  entityType `coach`; renames sync every class's snapshot, removal keeps the
  class), right-click Edit / Who is in / Remove-from-schedule (removal is
  reason-gated and audited as `classes.session.delete`), press-a-slot creation
  at 30-minute resolution, optional class photos (`class_image` assets), and a
  Print button that prints only the schedule for a PDF via the browser.
- The finance cluster is coherent again: the sidebar keeps Payments active
  across `/payments/shifts` and `/reports` (and Leads active on lead detail
  pages), and all three finance views share the same eyebrow, one-line
  description, and tab-strip position so nothing jumps between tabs.
- Settings became a ServiceTitan-style vertical rail — grouped sections with a
  search box that filters by name and synonyms (e.g. "freeze" finds Rules &
  hours, "whatsapp" finds Notifications) — replacing the horizontally
  scrolling tab strip. After trialing an accordion of sub-sections, the rail
  settled on plain buttons only: dropdowns are reserved for the day a section
  splits into separate pages. The rail scrolls independently when tall and
  uses pointer cursors.
- A saved Brand Kit logo now replaces the RIVET lockup in the workspace
  sidebar and mobile drawer with a quiet "Operated by RIVET™" credit beneath;
  route changes across the staff, customer, and platform shells animate with a
  240 ms rise-and-fade (`template.tsx` per shell, inert under reduced motion).
- Commit `5772a9c` closes the referral and freeze integration gaps found during
  review. Referrer selection now enforces branch scope, and a future scheduled
  membership no longer qualifies for a reward. Freeze-request listing,
  approval, and denial enforce the linked membership's branch boundary,
  including legacy request rows without a branch key.
- The member app now reads an identity-owned freeze-policy preview, hides the
  action when requests are disabled, and shows the current limits and predicted
  fee before submission. Loading and failure states do not masquerade as an
  empty request history; the staff panel is equally explicit about retries and
  approval-time fee recalculation.
- The reconciled class UI preserves Reception's roster/attendance permission,
  keeps scheduling and deletion manager-only, validates capacity before save,
  and exposes honest retry states for the timetable, coach directory, and
  member lookup.
- A final fetch caught Elias's follow-up commits `25c73f9` and `c8cce1c` before
  push. Merge commit `8e5adeb` preserves the fixed weekly timetable, workspace
  shell, vertical Settings rail, and repaired browser selectors alongside the
  earlier referral/freeze and UI hardening; no partner history was rewritten.
- Verification at application tip `8e5adeb` passed both TypeScript checks,
  zero-warning lint and secret-output audit, 169 Vitest files / 1,003 tests plus
  14 repository-safety tests, the 58-route Production build, 45 credential-free
  Playwright journeys with 14 explicit staging-only skips, a clean Production
  dependency audit, and `git diff --check`.
- This batch did not deploy Convex, enable a provider, or mutate Production
  tenant data. Release `156f9b1` remains the last fully verified exact-target
  backend and hosted pair. Do not infer backend parity from an automatic
  frontend deployment; run the normal release procedure for this tip.

## Migration and front-desk completion — 30 August 2026

- A fresh GitHub fetch began this batch with clean, matching `main` and
  `origin/main` at `bc3dfba`; no newer Elias/partner commit was waiting and the
  frozen `FRONTEND_HANDOFF.md` remains unchanged.
- Commit `f60a724` closes the remaining quality-of-life data boundaries:
  complete-or-fail exports with expired payload cleanup, indexed customer
  identity lookups, bounded duplicate detection with a 10,000-record fixture,
  and deletion of revoked push-subscription credentials instead of indefinite
  retention.
- Commit `8726737` turns the member importer into a real migration tool. It
  accepts CSV and XLSX files, recognizes English and Arabic-style headings,
  lets the operator confirm column mapping, normalizes international contacts,
  previews duplicates and invalid rows, saves batch provenance and progress,
  resumes interrupted chunks, downloads rejected rows, and supports a
  seven-day audited undo that archives only untouched records created by that
  batch. Original uploaded file bodies are not persisted.
- Commit `7f336c9` replaces the two-write **Create & sell membership**
  continuation with one idempotent Convex transaction. Staff review the member,
  choose a branch-eligible plan, collect a full/partial payment or deliberately
  leave a balance, and receive one completion result with the member number,
  term, balance, and receipt. A failed plan/payment step rolls back the member;
  replay cannot charge twice. Contact matches require an explicit
  different-person confirmation and create immutable override evidence.
- The sale work also corrects an older response inconsistency: a successful
  payment now returns the persisted post-payment charge and canonical receipt,
  rather than a stale pre-payment balance in the immediate response.
- Local verification for application tip `822f328` passed both TypeScript
  checks, zero-warning lint and secret-output audit, 166 Vitest files / 990
  tests plus 14 repository-safety tests, the 57-page Production build, 43
  credential-free Playwright journeys / 14 explicit staging-only skips / 0
  failures, `pnpm audit --prod` with no known vulnerabilities, and
  `git diff --check`.
- Release commit `156f9b1` was pushed directly to matching `main` and
  `origin/main`; no partner commit arrived during the final fetch. GitHub
  Actions run `33311009377` passed all three jobs for that exact SHA, including
  the 43-pass credential-free browser suite. Vercel Production deployment
  `dpl_HXZ7Qym8nDaaSiVkQMFTRUCxjngq` is `READY` for the same SHA and the
  canonical origin returned HTTP 200.
- Convex Production `descriptive-meerkat-589` passed the exact-target guarded
  dry run and deploy. Schema validation completed, no indexes were deleted,
  and four additive indexes were installed for bounded customer identity,
  expired-export cleanup, and maintenance state. The read-only `health`
  operation returned `status: ok`. Convex repeated the existing Free-plan
  overage warning; no plan or PAYG change was made.
- No Production tenant, member, membership, payment, import, or provider data
  was created or changed by this release. The importer and guided sale are now
  available for an authorized operator to exercise deliberately.
- Membership terms, opening balances, historical payments, and financial
  history are intentionally not accepted by the generic member importer. Their
  accounting and migration rules remain an explicit product decision. Arabic
  translation and the measured performance sprint remain last, as directed.

## Customizable referrals + member freeze requests — 30 August 2026

- **Referral rewards (Settings → Operational rules → Referral rewards):**
  fully gym-customizable — enabled flag, free days per referral, a per-member
  day cap, and the rolling window that resets it. Member creation gained a
  "Referred by" member search; when the referred person completes their
  first membership sale, the referrer's active membership is extended
  automatically, the outcome (applied / cap reached / no active membership)
  is recorded as an immutable `referralReward` fact with an audit event and
  a membership adjustment, repeat sales and self-referrals grant nothing,
  and the customer-app projection is kept in sync.
- **Member freeze requests (Settings → Operational rules → Member freeze
  requests):** members ask from the membership page in their app (dates,
  days, reason, with the expected fee shown); gyms configure free freezes
  per window, the fee after that (e.g. first free, then 10 JOD), the max
  days per freeze, and the reset window. Requests cannot be gamed: policy
  bounds, one pending request per membership, no overlap with an active
  freeze, and the fee is **re-computed at approval**. Staff decide from a
  panel on Memberships — approval applies the freeze through the existing
  audited machinery and books an unpaid "Membership freeze fee" charge when
  due; denial requires a reason the member sees.
- Legacy settings normalize safely on both server and client; MockGymOSApi
  mirrors both features (including a stable demo link from bundled customer
  memberships to generated seed members). New Convex suites cover the
  reward/cap/dedupe/disabled referral paths and the request → decide →
  fee/charge freeze paths (suite now 997). Verified in the mock browser:
  member "Request a freeze" → policy-checked submission → confirmation.

## Group class calendar — 30 August 2026

- New **Classes** workspace (nav: Workspace → Classes, all plan tiers): a
  press-to-schedule weekly calendar with time across the top and dates down
  the left, per the owner's spec. Pressing an open slot opens the create
  dialog (name, coach from active staff, start, duration, capacity, notes,
  optional photo); pressing a class opens roster management — "who is in" —
  with live member search, one-tap add/remove, attendance checkboxes, edit,
  and reason-gated cancellation.
- Backend: dedicated `classSessions` table with a `(org, branch, startsAt)`
  window index; `classes.*` operations routed through the domain seam;
  scheduling/cancelling requires `operations.manage`, roster and attendance
  accept `members.write` or reception's `pt.book_for_member`; capacity,
  duration, window, branch-scope, and cancelled-state guards are
  server-enforced with audit events for every action. Class photos are a new
  `class_image` media type that uploads as an expiring draft and activates
  when the session references it.
- MockGymOSApi mirrors the contract with seeded demo classes. Covered by a
  Convex suite (scheduling, window listing, roster capacity/dedupe,
  attendance, reason-gated cancel, branch scope, receptionist permissions;
  suite now 979) and verified in the mock browser end-to-end (slot → create
  → save; roster attendance + live member add reaching 3/12 booked).

## Quality-of-life program — 30 August 2026

- The approved quality-of-life program is implemented on
  `codex/qol-implementation` in focused application, audit-fix, and test
  commits from `0c6ea31` through `6296fea`. The frozen
  `FRONTEND_HANDOFF.md` remains
  unchanged and no provider, deployment, environment, or Production data was
  touched.
- Members now have an ownership-scoped financial center with balances,
  itemized transaction history, status explanations, receipt deep links,
  printable/downloadable receipts, and a self-service personal-data export.
  Receipt and export authorization is enforced from the authenticated member
  identity rather than a caller-supplied customer ID.
- Members and CRM now preserve filters in shareable URLs and support private
  saved views with automatic personal defaults, rename/update, duplicate, and
  delete controls. Members have selectable columns and bounded, idempotent bulk
  tag, branch, follow-up, and reason-gated archive work; CRM has selectable
  list/board records and bounded owner/follow-up actions. Every operation
  rechecks tenant, branch, permission, and record eligibility and reports
  succeeded, skipped, and failed records.
- `/members/duplicates` provides a tenant-scoped candidate queue, match reasons,
  field-by-field survivor choices, an impact preview, optimistic version check,
  reason-gated ignore/merge decisions, and immutable merge evidence. Completed
  receipts, payments, ledger facts, and audit history are not rewritten;
  linked history remains visible from the surviving member. Records attached
  to a member-owned account are deliberately blocked from automatic merge and
  require supervised identity resolution.
- New owners, invited staff, and members receive versioned, persisted,
  resumable, dismissible, and replayable guidance. Owner readiness derives
  required operating progress from real organization, branch, payment, plan,
  invitation, import, reception, shift, and public-profile state. Staff tours
  are permission/role aware, state-derived readiness cannot be manually
  bypassed, and member guidance covers memberships, short-lived QR
  entry, PT, profile ownership, finance, installation, and notifications.
- The member app is installable. Its service worker caches only a versioned,
  non-sensitive shell and offline assets; authenticated member, financial,
  receipt, entry-decision, and QR requests are explicitly excluded. Install
  prompting is user-initiated, notification subscription is explicit opt-in,
  and the offline screen never claims a QR remains valid.
- Automations now expose a read-only operational monitor with rules, global
  pause state, provider readiness, expected next run, last result, and
  suppressed/retried/failed activity. `RIVET_AUTOMATIONS_LIVE` must equal
  `"true"` before create, update, run, or retry operations are permitted; this
  batch did not enable it.
- `/exports` provides audited, branch/permission-scoped CSV generation for
  members, leads, payments/refunds/receipts/reconciliation, audit events,
  membership liabilities, PT orders, and inventory/supplier operations.
  Exports include filter/scope/timezone metadata, use idempotency keys, and
  expire their inline download content after 24 hours. CSV text cells are
  spreadsheet-formula neutralized and PT rows honor selected-branch scope.
- Global navigation now searches permitted members, leads, receipts, pages,
  and role actions, including phone fragments, receipt numbers, and external
  references. It records bounded recent work, supports user-pinned quick
  actions, and includes a keyboard-shortcuts reference opened with `?`.
- Verification passed both TypeScript checks, zero-warning lint and the secret
  audit, **161 Vitest files / 977 tests**, **14 repository-safety tests**, the
  **57-route** Production build, **43 credential-free Playwright passes / 14
  explicit staging-only skips / 0 failures**, `pnpm audit --prod` with no known
  vulnerabilities, and `git diff --check`.
- Intentionally deferred to the final pre-launch work: legal/commercial pages
  and consent copy, full Arabic localization and language switching, and the
  broad measured performance-optimization sprint. Online member payment,
  renewal/purchase, live automation delivery, web-push delivery, and any
  deployment/provider activation still require their separate policy and
  operator gates.

## File-first member import and plain-language maintenance — 29 August 2026

- A fresh GitHub fetch started from clean matching `main` and `origin/main` at
  `59ec0a5`; no newer Elias/partner commit or other non-Arabic slice was
  waiting. The frozen `FRONTEND_HANDOFF.md` was not changed.
- Member onboarding is now visibly file-first. The primary flow accepts a real
  CSV through drag-and-drop or the native file chooser, shows the selected file
  and size, chooses a sensible concrete branch when the global workspace is in
  **All branches**, and proceeds through **Review members** and **Import
  members** language. Raw CSV editing remains available as a secondary option;
  the old dominant textarea, narrow `Import destination` rail, sample-import
  trap, and internal `commit` wording are gone.
- Operations now calls the physical-work surface **Maintenance**, describes it
  as cleaning, inspections, and incidents, and asks employees **Where in the
  gym?** instead of exposing facility/area jargon. Existing internal
  `facilityTask` and `zone` identifiers remain unchanged so history, indexes,
  authorization, accounting links, and QR URLs stay compatible.
- Owners now have **Settings → Gym spaces**, which explains that spaces are
  recognizable places inside one branch—Reception, Main floor, Studio, Locker
  room, and similar. Owners can add, edit, classify, size, activate, or archive
  these spaces through the already-audited `zones.upsert` boundary; managers
  continue to create and complete branch-safe maintenance work.
- Application commits `4ce9d24` and `234c62e` contain the importer and
  maintenance slices. Both TypeScript checks, zero-warning lint and the secret
  audit, **158 Vitest files / 961 tests**, **14 repository-safety tests**, the
  **51-page** Production build, **43 Playwright passes / 14 explicit
  credential-gated skips / 0 failures**, `pnpm audit --prod`, the Impeccable
  pattern detector, rendered desktop inspection, and `git diff --check` passed.
- This was a frontend and existing-contract release: no Convex schema/function
  change, provider activation, environment mutation, or Production tenant-data
  write was required. The next high-value code candidate is a flexible import
  mapping and batch-report workflow for the messy spreadsheets real gyms will
  provide. Importing live memberships, opening balances, and historical money
  must remain behind explicit product/accounting decisions.

## Clean-tenant engagement, offers, facilities, and scale — 29 August 2026

- RIVET now treats each organization as a clean tenant rather than requiring
  shared demo data. Staff can onboard an existing member book through a safe
  CSV review flow: download a template, choose a file or paste CSV, preview
  validation and duplicates, then explicitly commit. The server independently
  enforces required headers, normalized contact identities, a 2 MB payload
  limit, and a 10,000-row limit. Import is an onboarding path, not proof of
  marketing consent; unknown imported preferences remain suppressed.
- Contact handling is international by contract. Each organization owns a
  configurable calling code, Jordan `962` is only the provisioning default,
  and explicit `+` or `00` numbers preserve their supplied country. Search,
  duplicates, lead/member capture, imports, and WhatsApp links share the same
  canonical normalization.
- Lead detail and renewal work now offer provider-free WhatsApp handoffs with
  editable prefilled copy and a next-day follow-up. Opening WhatsApp records an
  immutable handoff attempt; RIVET never claims that an external message was
  delivered. The older provider-backed delivery fact remains distinct.
- Staff can create branded, expiring offer links and share them through the
  same truthful handoff. A tokenized public page supports available, expired,
  accepted, and declined states. Responses are rate-limited, idempotent, and
  persisted to the offer, lead, immutable response fact, and unified member/
  lead timeline. Acceptance is an expression of intent only—it cannot collect
  payment or activate a membership.
- Operations now includes a signed-in Facilities workspace with active/history
  views, critical/open/in-progress totals, quick task presets, status actions,
  and downloadable zone QR shortcuts. A scan opens the authorized workspace,
  selects branch/zone, and prepares a task; it is not an unauthenticated write
  endpoint. Waivers and signed-document collection remain legal/pilot-gated.
- The scale pass added status-aware facility indexes and relationship-scoped
  member, membership, invoice, offer, and timeline reads. Today aggregation
  remains bounded to 12 ranked results while computing truthful counts before
  truncation. Automated fixtures cover 600 facility tasks and 25,000 Today
  candidates, including deduplication and stable priority ordering.
- The implementation was committed directly on `main` in five coherent slices:
  `ea19e03`, `bf2cea8`, `8a05dcd`, `ffebf49`, and `0db74af`, followed by the
  living-document reconciliation at `63d97de`. A final fetch found no newer
  Elias/partner commit; `main` and `origin/main` matched at `63d97de` after the
  push. `FRONTEND_HANDOFF.md` remains unchanged.
- The full local gate passed both TypeScript checks, zero-warning lint and the
  secret-output audit, **157 Vitest files / 958 tests**, **14 repository-safety
  tests**, the **51-page** Production build, **41 Playwright passes / 14
  explicit credential-gated skips / 0 failures**, `pnpm audit --prod` with no
  known vulnerabilities, the Impeccable UI-pattern detector, and
  `git diff --check`.
- The guarded Convex dry run explicitly targeted Production
  `descriptive-meerkat-589`, proposed no index deletion/destructive migration,
  and only added `facilityTasks.by_organization_status`. The matching deploy
  completed and the read-only health check returned `status: ok`; no gym data
  was seeded, imported, rewritten, or deleted by the release.
- GitHub Actions run
  [33260137190](https://github.com/hashemnusair/Rivet/actions/runs/33260137190)
  passed all three jobs. Exact-SHA Vercel Production deployment
  [`dpl_F2BWHM7DQWmVEaJA8HtwnbUUauQm`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/F2BWHM7DQWmVEaJA8HtwnbUUauQm)
  is `READY`; the canonical landing, directory, and invalid-token offer shell
  returned HTTP 200.
- Next product decisions are real message-provider activation, whether offer
  acceptance may enter payment/membership activation, and approved waiver/
  retention policy. Operator/staging closure remains separate. Arabic through
  the chosen translation solution and final measured optimization remain last.

## Unified Today queue — 29 August 2026

- A fresh synchronization check started from clean `main`/`origin/main` at
  `87080de`; no newer partner commit or non-Arabic partner slice was waiting.
  `arabic-localisation` remains intentionally deferred and
  `FRONTEND_HANDOFF.md` remains unchanged.
- The dashboard contract now returns one deterministic, deduplicated and
  role/branch-safe **Today** queue from the existing dashboard subscription.
  It combines due CRM tasks, renewals, collectible balances, same-day access
  denials, pending approvals, cash variances and due/high-severity facility
  work without adding a client request waterfall. Full, priority, kind and
  overdue counts remain truthful even when only the 12 highest-priority rows
  are returned.
- Owners, managers, sales staff and reception now share the same calm work
  surface while retaining role-specific metrics and context. Auditors receive
  a dedicated read-only review projection instead of the owner dashboard.
  Trainers retain their PT-specific day. Server permissions decide whether an
  item is navigational or may expose one-tap task completion.
- The queue is placed immediately after the dashboard KPI strip, labels the
  first item **Do this next**, expands without navigation, clearly discloses a
  truncated highest-priority set, and removes completed tasks in place after
  invalidation. Renewal and balance links open the exact permitted member
  action; unauthorized or inapplicable deep links fail closed.
- Desktop and 390px-phone browser inspection found no horizontal overflow,
  framework overlay or console error. The shared panel stays within RIVET's
  existing warm monochrome, ruled-panel, compact-type and signal-red design
  language; the Impeccable detector reported no banned-pattern findings.
- Verification at application tip `8c4be51` passed both TypeScript checks,
  zero-warning lint and the secret-output audit, **155 Vitest files / 945
  tests**, **14 repository-safety tests**, the **51-page** Production build,
  **41 credential-free Playwright passes / 14 explicit credential-gated skips
  / 0 failures**, `pnpm audit --prod` with no known vulnerabilities, and
  `git diff --check`.
- No Convex deployment, Production configuration/provider change or
  Production data mutation was performed. The next product candidates are
  provider-free WhatsApp handoffs, branded offer acceptance, and the
  realistic-volume query/index/invalidation pass. Facilities QR tasks remain
  demand-gated; Arabic/translation and measured optimization remain last.

## Jordan-first workflow hardening — 29 August 2026

- A fresh GitHub fetch found no newer partner work. `origin/main` remained at
  `b04feecba95e447c5e023ec1d6a1bafe4426ee58`; the application and browser-test
  tip for this sprint is `ea962fa`, nine coherent direct-main commits ahead.
  `arabic-localisation` remains intentionally deferred and
  `FRONTEND_HANDOFF.md` remains unchanged.
- Marketing preferences now preserve their provenance through member creation,
  profile edits, imports, lead conversion, mock data, and Convex. A system
  default is no longer treated as explicit staff/member consent.
- Jordanian phone variants (`079…`, `+96279…`, `0096279…`, punctuation and
  spacing variants) resolve to the same canonical identity for validation,
  lookup, duplicate prevention, and cross-adapter behavior.
- Cash-shift closure waits for authoritative live totals, distinguishes loading
  and failure from a legitimate zero, rejects a stale shift, and supports an
  explicit retry. Transaction ranges and CRM follow-ups now use the tenant's
  timezone rather than the browser or UTC day boundary.
- Audit approval filtering is applied at the server boundary before pagination.
  Command search and member duplicate checks now show real failures, retry, and
  explicit safe-override behavior instead of presenting a failed lookup as an
  empty result.
- Lead capture is reduced to name and phone when a branch is already selected;
  the remaining fields are optional and collapsed with walk-in/current-owner
  defaults. Member capture offers an explicit **Create & sell membership**
  continuation. Pipeline cards expose Call, No answer, Not sold, and Open as
  separate keyboard/touch actions; terminal losses require and immutably audit
  a real reason in both mock and Convex implementations.
- Reception results no longer disappear on a timer. A recorded allowed,
  warning, or overridden verdict remains until staff deliberately advances or
  starts another lookup. Shared buttons reach a 44px target on coarse-pointer
  devices without enlarging laptop layouts. Reception and CRM now expose later
  pages instead of silently capping working sets.
- Verification passed both TypeScript checks, lint and the secret-output audit,
  **153 Vitest files / 937 tests**, **14 repository-safety tests**, the
  **51-page** Production build, **39 Playwright passes / 14 explicit
  credential-gated skips / 0 failures**, `pnpm audit --prod` with no known
  vulnerabilities, and `git diff --check`. The first Playwright attempt was
  interrupted when a disposable Next development cache exhausted local disk;
  after that cache was removed, the full suite passed. No source or user data
  was removed.
- No Convex deployment, provider activation, Production configuration change,
  or Production product-data mutation was part of this code sprint. The next
  product candidates are the unified Today queue, truthful provider-free
  WhatsApp handoffs, and branded offer acceptance. Operator setup, product and
  provider decisions, isolated staging, Arabic, and final measured performance
  work remain separate launch-closure gates.

## Platform closure, QA-listing cleanup, and Production export — 29 August 2026

- A fresh fetch found no newer partner work; `main` and `origin/main` matched at
  `04b1f0ffa1c751af86d4d3d279b72a0dc5b819b8` before this release-record
  update.
- Current-head read-only platform-owner acceptance passed for Overview,
  Applications, Gyms, Pricing & entitlements, Billing, and Support. All routes
  loaded under the Production platform identity with no page or console
  errors.
- With explicit operator approval, the exact historical **Hashem Test** QA
  tenant (`5fb83293-ee76-405e-a336-901347b600eb`) was removed from public
  discovery through the audited listing control. The hidden state survived an
  admin reload, the tenant disappeared from `/customer/discover`, and its
  direct public URL returned **Gym not found** without exposing disposable QA
  copy. Its organization, subscription, payment, audit, and other historical
  records were preserved. **Elias Test** remained publicly visible and was not
  mutated.
- The obsolete Convex Production deploy key named `vercel-production` was
  revoked after Vercel's deploy environment and build path had already been
  decoupled from Convex deployment. The separate `rivet_prod_cli` operator key
  remains. The GitHub `CONVEX_DEPLOY_KEY` is the documented non-Production
  generated-code/staging credential and was not changed.
- Convex disables **Backup Now** on the Free plan. The operator explicitly
  declined a plan purchase for now, so no billing or PAYG change was made.
  Instead, an exact-target snapshot export of Production
  `descriptive-meerkat-589`, including file storage, was created through the
  authenticated CLI and downloaded outside the repository to
  `/Users/hashemnusair/Documents/RIVET Production Backups/rivet-production-descriptive-meerkat-589-2026-08-29.zip`.
  The ZIP passed an integrity test, is mode `0600`, is 502,886 bytes, and has
  SHA-256 `bd11a9f179bb3674164a4cb9c5f598d92ce38b76edad75b674105c08dc20cbb4`.
- Remaining launch gates are Convex capacity/service-interruption risk (August
  database I/O remains above the Free allowance), the 14 isolated credentialed
  staging journeys and cleanup evidence, authenticated mobile verification,
  monitoring/WAF/recovery ownership, Clerk signup/MFA policy, and the documented
  product/provider decisions. Arabic and final measured performance work remain
  last.

## Active-owner Production acceptance and public-detail repair — 29 August 2026

- A fresh fetch confirmed `main` and `origin/main` match at
  `fb43a14cdcd65fc47c79f410c0b5aeb0949597d8`; no newer partner commit or
  unmerged non-Arabic partner slice was present. `arabic-localisation` remains
  deliberately deferred.
- The authenticated active-owner session belongs to **Elias Test gym** and the
  organization `elias test gym 1`, which is the intended pilot/test tenant.
  Read-only Production acceptance passed for the dashboard, Operations and
  inventory, retail checkout readiness, Finance and all three management
  statements, finance controls, a completed retail receipt, Settings, and the
  direct-forbidden `/platform` route. Balance-sheet and cash-flow equations
  reconciled, Renewal recovery was visibly off, the checkout remained empty
  and disabled, the owner was redirected away from `/platform`, and no browser
  console errors were observed. No sale, refund, void, settings change, or
  other Production product-data mutation was performed.
- A cold direct visit to a valid public gym profile could briefly show **Gym
  not found** before the marketplace subscription delivered its first
  snapshot. Commit `fb43a14` now keeps the detail page in its shared loading or
  recovery state until the live marketplace is ready, and only renders the
  not-found state after a ready snapshot proves the ID is absent. The focused
  regression increased the full suite to **148 files / 914 tests**.
- Local verification passed both typechecks, lint and secret-output audit, all
  914 tests, the 51-route Production build, **39 Playwright passes / 14
  explicit isolated-staging skips / 0 failures**, `pnpm audit --prod` with no
  known vulnerabilities, and `git diff --check`. GitHub Actions run
  [33240389955](https://github.com/hashemnusair/Rivet/actions/runs/33240389955)
  passed all three jobs for exact SHA `fb43a14`. Vercel Production deployment
  [`dpl_Ep5eEmAYBdRrpyqH6Mf1hhvb29rj`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/Ep5eEmAYBdRrpyqH6Mf1hhvb29rj)
  is `READY`; the canonical Elias Test profile loaded the live gym, branches,
  plans, PT packages, and trial-request shell without console errors.
- Production still publicly lists **Hashem Test**, whose profile exposes
  disposable Production-QA copy and membership data. It is not the intended
  current test tenant. Hiding it is a reversible platform-admin action that
  still requires explicit operator approval; do not delete its historical
  records.
- The active Convex Production deployment is healthy, but August database I/O
  is **1.65 GB against the 1 GB Free-plan allowance** and no current dashboard
  backup exists. Plan/capacity ownership and a current backup remain launch
  gates. Clerk is a live Production instance with password and email-code
  sign-in, compromised-password rejection, and Device Trust; public sign-up is
  open and MFA is not enabled, both of which remain explicit security/product
  decisions.
- Remaining closure work is the current-head platform-administrator read-only
  pass, an approved hide of Hashem Test, isolated credentialed staging and
  cleanup evidence, backup/capacity resolution, monitoring/WAF ownership, and
  the documented provider/product decisions. The browser session used here
  could not force a signed-in mobile viewport, so authenticated responsive
  evidence remains open even though credential-free mobile/tablet Playwright
  coverage passed. Arabic and final performance optimization remain last.

## Production backend and deployment-path closure — 29 August 2026

- `main` and `origin/main` matched at `d06021ebb2b013957efbc00127288c223be4ebb3`
  after a fresh fetch. No new partner commit or unmerged non-Arabic partner
  slice was found; Five Pillars and the landing refresh are already contained
  in `main`. `arabic-localisation` remains deliberately unmerged.
- Convex Production was selected explicitly as `descriptive-meerkat-589` with
  the checkout's Development deploy key suppressed. The names-only check
  reached the expected Production environment. The guarded dry run and deploy
  both completed schema validation and reported no deleted indexes; the dry
  run proposed no destructive migration. The current backend functions are
  deployed to `https://descriptive-meerkat-589.eu-west-1.convex.cloud`.
- Post-deploy `health:check` returned `status: ok`. The aggregate-only
  `renewalJobs.releaseAudit` returned zero deliveries, delivery events,
  renewal timeline facts, and staff call tasks. The read-only subscription
  preview processed five organizations, found two eligible boundaries, and
  projected zero invoices, past-due transitions, or suspensions. Reconciliation
  reported `enabled: false`; `RIVET_OPERATIONAL_EMAIL_LIVE` and
  `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED` remain absent.
- Vercel project `rivet-web` still had the legacy raw
  `npx convex deploy ... --cmd 'pnpm build'` Build Command. It was replaced
  with `pnpm build`, and the now-redundant Production `CONVEX_DEPLOY_KEY` was
  removed from Vercel. The authenticated, exact-target operator flow through
  `pnpm convex:deploy` is now the only tested Production backend release path.
- A clean Production redeploy from exact repository head `d06021e` passed
  without the Vercel Convex key. Deployment
  [`dpl_8thJP5sjVUgH9YZREpQjgerpUbfh`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/8thJP5sjVUgH9YZREpQjgerpUbfh)
  is `READY`; its build log shows `pnpm build`, 51 generated pages, and no
  Convex deploy command. The canonical aliases return successfully, and the
  first post-deploy error and HTTP-500 scans were empty.
- Public read-only acceptance loaded the landing page, gym directory, and a
  gym detail without console warnings or errors. Production currently exposes
  two test gyms; the first includes disposable-verification copy and test
  membership data. Those exact tenants must be unpublished, archived, or
  converted to approved pilot content before public launch. No Production
  product data was mutated during this closure.
- Remaining release gates are the signed-in active-owner/platform acceptance,
  isolated credentialed staging and cleanup evidence, a current backup,
  resolution of the Convex above-Free-plan-limit warning, monitoring/WAF
  ownership, and the documented product/provider decisions. Arabic and final
  performance work remain deferred.

## Current release summary — repository-hardening sprint — 28 August 2026

- The final application/code verification tip for this sprint is `3c99fc7`.
  The final pushed history also includes this documentation reconciliation.
  It includes the
  production Next dependency-chain repair, public experience retry/timeout
  recovery, CRM identity/assignment and event-backed progression hardening,
  permanent credential-free role-routing coverage, CI browser and repository
  safety gates, deterministic billing deep-link focus, RIVET image warning
  fixes, and the focused browser-assertion follow-up required by the first
  hosted run.
- The starting SHA was `e1cac31127a94659ad95f1e0f5f45f536678fa6f`, and no partner
  commits arrived during the implementation pass before the final
  synchronization check. `FRONTEND_HANDOFF.md` remains unchanged.
- The verified credential-free local gate passed with frozen install, web and
  Convex typechecks, lint plus secret-output audit, **148 Vitest files / 913
  tests**, **14 repository safety tests**, the Next production build with **51
  route entries**, **39 Playwright passes / 14 explicit credential-gated
  skips / 0 failures**, `pnpm audit --prod` reporting **no known
  vulnerabilities**, and `git diff --check`. The prior documented Vitest
  baseline was 888 tests; no tests were silently removed.
- The public retry path now recreates live listeners, bounds first snapshots,
  keeps the last good data on later failures, and retains approved fallback
  plans. CRM contact edits, owner assignment, immutable audit facts, and
  persisted progression facts are aligned across Convex, mock, adapter, UI,
  projections, and browser coverage. CI now runs the credential-free browser
  suite without Production credentials and asserts a clean worktree.
- The approved runtime is Next.js App Router + Clerk + Convex + Vercel behind
  the `GymOSApi` boundary. Mock mode is explicit preview/test infrastructure;
  Production remains Convex-backed and fail-closed. No Convex deployment,
  Production provider/configuration change, credentialed staging run, or
  Production data mutation is part of this sprint. GitHub Actions run
  [33127740606](https://github.com/hashemnusair/Rivet/actions/runs/33127740606)
  passed for the final application/code tip `3c99fc7`, and Vercel Production
  deployment [`dpl_28TJU394KFMmiE1bxddpZj2TVMc5`](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/dpl_28TJU394KFMmiE1bxddpZj2TVMc5)
  is `READY` for that exact tip; the canonical site returned HTTP 200.
- Remaining gates are the exact-target Convex Production dry run/deploy,
  Production health and aggregate checks, credentialed isolated staging,
  provider/product decisions, operational-email and subscription-reconciliation
  activation, capacity/backups/recovery/WAF/monitoring ownership, and the
  deferred Arabic/final-performance and separately scoped feature work.

See [HANDOFF_PLAN.md](HANDOFF_PLAN.md) for the current implementation, release, and owner-verification plan.

## Dead-end applications + readable action errors — 27 August 2026

- Retrying Test 123 revealed the real, current blocker is no longer Clerk:
  provisioning refuses because **the applicant email belongs to a platform
  administrator** (a correct guard — admin accounts cannot own gym
  workspaces). Two defects fixed around it:
  - Convex **action** failures used to surface as a raw "Uncaught
    ConvexError {json} at …" blob rendered into the page;
    `errorFromConvex` now extracts the embedded ConvexError JSON from action
    error strings, so operators see the domain message.
  - An approved application whose provisioning failed permanently (and
    provisioned nothing) was stuck forever, pinning the overview's
    provisioning-failure counter. `reviewRecord` (+ mock and UI) now allows
    exactly that state to be **rejected**, clearing its provisioning flags;
    successfully provisioned approvals stay immutable. Covered by a new
    provisioning-retry test (suite 888).

## Convex bandwidth pass + production config findings — 27 August 2026

- **Indexed point lookups replace full-table scans.** `domainRecords` gained
  a global `by_entity_type_public_id` index; every platform lookup that used
  to `collect()` a whole entity table and `.find()` in JS now reads one row:
  marketplace gyms by id (owner-recipient emails, gym.update, archive,
  profile publish, invoice payment), platform invoices by id (issue /
  past-due / payment / void), and customer memberships by id (two member-app
  paths). The gym-detail invoice list and the manual-invoice cycle check now
  scope by `by_organization_type` instead of scanning every tenant's
  invoices. These scans grew with the invoice/membership tables, so this
  directly cuts the DB-bandwidth overage seen on the Convex Starter usage
  screen.
- **Production config findings** (from a names-only env listing):
  `RIVET_OPERATIONAL_EMAIL_LIVE` and
  `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED` are both unset in production.
  All operational email is therefore suppressed (the Resend keys themselves
  are present — this, not a provider regression, explains the Aug 8→11
  SENT→NOT CONFIGURED flip), and the hourly renewal clock exits without
  running, so T−3 invoices/grace/suspension have never executed live. Both
  are owner decisions to enable (Convex dashboard → prod deployment →
  Environment Variables).
- Test 123's provisioning failure is a bare Clerk 403 on the
  organization-creation POST with no error payload — an instance/plan-level
  organizations restriction is the likely cause; a console retry is the
  next diagnostic.

## Reviewed public pages + console cleanup — 27 August 2026

- **Public-page governance:** a gym's first publish stays self-serve; after
  that the page locks. Tenants keep saving drafts, but `profiles.gym.publish`
  rejects with a support pointer, `profiles.gym.unpublish` is tenant-blocked
  entirely (the platform hides listings from the console), and the editor
  swaps its Publish button for **"Send to RIVET for review"**, which files a
  prefilled support case. The new `platform.gym.profile.publish` op (admin +
  reason, shared `applyGymProfilePublish` core with the tenant path) lets the
  platform team publish the saved draft in one click from the gym page's new
  **Public page** card ("Live at v1 · Draft v2 awaiting your review →
  Publish draft"). `GymPublicProfile.publishLocked` and the platform detail's
  `publicPage` facts carry the state; MockGymOSApi mirrors all of it.
- **Console cleanup ("simplicity and efficiency"):**
  - Overview: hero card KPIs with short factual sublines, and the always-on
    zero-count strip replaced by an **attention strip** that renders only
    real work (e.g. "2 applications awaiting review") or a quiet "Nothing
    needs your attention right now."; billing position lost its disclaimer
    paragraph.
  - Billing: the large automated-renewal-policy section is now a **Renewal
    policy** button opening a centered dialog with the four steps; section
    sublines shortened throughout.
  - Gym detail: a proper hero (logo, name, status chip, "Pro · monthly ·
    paid through …", Public page / Manage subscription actions) plus the
    Public page review card; verbose explainer sentences trimmed.
- Suite now 887 (profile lock + platform publish covered in Convex tests,
  the review flow in the editor test, the admin publish card in the detail
  test; mock media tests route second publishes through the review path).
  Verified in the mock browser end-to-end on the gym side (locked editor →
  save draft v2 → "Send to RIVET" support case + toast) and the console
  side (attention strip, policy dialog, hero, review-card states).

## Billing owns subscriptions; gym pages are informational — 27 August 2026

- Per the owner's direction, every subscription action now lives on the
  Billing page and the gym detail page is purely informational.
  - Billing gained a **Gym subscriptions** section: every provisioned tenant
    with live plan · cadence, status badge, and paid-through date, plus
    per-row actions — **Change plan** / **Reactivate & bill** (opens the
    billing wizard preselected on that tenant at the plan step) and
    **Suspend** / **Cancel** (reasoned confirmation dialogs that promise "no
    invoice is issued; the paid-through date stays on record").
  - The gym detail page lost the plan/status/cadence editing card and the
    Suspend header button. It keeps identity, branches, usage, owner, the
    read-only subscription facts, the platform timeline, archiving, and a
    standalone **Public directory listing** card (toggle + audited reason).
    Both "Manage subscription" and the facts card's "Manage in Billing" link
    deep-link to `/platform/billing?bill=<gymId>`, which auto-opens the
    wizard on that tenant.
- Unit suite still 886 (info-only detail tests, a Gym subscriptions suite,
  wizard preselect, and the deep-link test replaced the removed editing
  tests). The platform entitlements and public-experience Playwright specs
  were rewritten to drive tier changes and suspension from the billing page;
  the staging provisioning spec's cleanup helper now suspends from billing
  too. Verified end-to-end in the mock browser: suspend from the table →
  row flips to "Reactivate & bill" → wizard reactivation billed a fresh
  month (paid through 27 Sept 2026, no credit from a suspended state) with
  the Subscription change invoice in the ledger, and the gym page renders
  info-only with working deep links.

## "Bill a gym" guided walkthrough — 27 August 2026

- The billing page gained a **Bill a gym** wizard (three steps: choose gym →
  plan & billing → review & confirm) as the friendly front door over the
  same `platform.gym.update` path the gym detail controls use — no new
  backend, so every date, credit, and invoice stays server-derived.
  - Step 1 lists only provisioned, unarchived gyms with their live status,
    plan · cadence, and paid-through date, behind a search box.
  - Step 2 shows the four catalog tiers (current one tagged) and the
    monthly/annual cards with computed amounts.
  - Step 3 adapts to the situation: reactivation ("starts a fresh paid term
    today"), a change on an active tenant ("unused paid days carry over, so
    there is no need to wait for the current term to end" — deliberately no
    "schedule for later" option, since the day credit makes it financially
    equivalent), or a no-op guard when the gym is already on exactly that
    plan and cadence. It reuses the shared billing preview and requires the
    audit reason.
  - The billing-preview math moved to a shared module
    (`src/lib/platform/subscription-billing.ts`) used by both the wizard and
    the gym detail page; invoice-type badges now distinguish **Subscription
    change** from **Automatic renewal** (CSV export too).
- Covered by a wizard test suite (walkthrough payloads, reactivation with
  explicit active status, provisioned-only listing, no-op guard), shared
  billing-math tests, and a billing-page assertion (suite now 886). Verified
  in the mock browser end-to-end: wizard → annual Pro → "JOD 2390.400 · 19
  unused paid days" → confirm → invoice landed in the ledger tagged
  Subscription change.

## Subscription changes bill themselves — 27 August 2026

- Release `f140edb` rebuilds the platform subscription-change flow around one
  rule: **a material change that lands on an active subscription starts a new
  paid term today, and the server does all the math.** This fixes the
  monthly/annual asymmetry the owner reported (activating monthly appeared to
  "add money" while switching to annual changed nothing) and adds the
  requested compensation for mid-term switches.
  - `platform.gym.update` now derives the new period end (today + 1 or 12
    calendar months), credits every unused paid day from the outgoing active
    term into the new one (e.g. 14 days into a monthly term → the remaining
    days extend the new annual term), immediately issues an **open platform
    invoice** at interval-correct pricing (annual = monthly × 12 × 0.8 via the
    shared `annualPrice`), voids superseded unpaid cycle invoices so nothing
    is billed twice, queues the invoice-issued email, and records the invoice
    id + credit days in the audit event. Suspend/cancel no longer demand a
    date and never bill. An explicit admin date remains a supported override.
  - **Active MRR is now interval-aware**: annual tenants count at their
    effective monthly rate (price × 0.8) instead of the headline monthly
    price, which previously overstated them by 25%.
  - The gym-detail controls lost the mandatory "Membership end date" field;
    in its place a live **"What happens when you save"** preview shows the
    exact invoice amount, carried-over days, and new term end before the
    admin commits. Suspend/cancel drafts preview their consequences too.
  - Billing page copy now covers both invoice sources ("Subscription
    invoices": clock renewals + change term invoices).
  - MockGymOSApi mirrors the whole derivation; `PlatformBillingInvoice`
    gained `creditDays`.
- Covered by new Convex tests (interval-correct amounts, 16-day credit roll,
  supersede-void, no-invoice suspend; suite now 878), an interval-aware MRR
  unit test, rewritten detail-component tests asserting the preview, and the
  platform entitlements + public-experience Playwright specs (date-field
  interactions removed; the Pro round now performs a real annual save).
  Verified end-to-end in the mock browser: Pro monthly → annual showed
  "JOD 2390.400 · 19 unused paid days carry over · runs until 15 Sept 2027",
  and the save produced exactly that renewal date, the open invoice, and the
  audit entry.

## Platform admin console production pass — 27 August 2026

- Release `034415f` (CI run `33062534767` green, Vercel deploy verified live
  with an authenticated platform-admin session) makes the gym detail page
  production-honest:
  - **Archive dialog fixed.** The confirm UI was rendered without
    `DialogContent`, so the header/body/footer painted inline on the page
    permanently and the Archive button opened nothing. It is now a real
    modal (typed gym-name confirmation + reason, danger action), and the
    unit test asserts the closed→open→confirm flow instead of indexing
    duplicate buttons.
  - **Recurring amount is now derived**, not absent: the live plan catalog
    price × the tenant's billing interval (annual = monthly × 12 × 0.8 via
    the shared `annualPrice` helper exported from
    `subscriptionReconciliation.ts`). Verified live: "Recurring amount
    JOD 500.000" on elias test gym 1.
  - **Invoices are now real**: platform invoices scoped to the tenant
    replace the permanent "not configured" placeholder ("Invoices 0
    recorded" live today, honestly empty).
  - MockGymOSApi mirrors both derivations; `platformGymDetail.test.ts`
    covers the new source fields.
- Read-only production walk of the whole console with zero console errors:
  overview KPIs live (MRR JOD 579.000, 4 gyms, audit trail), gyms
  directory, gym detail, applications, billing (empty-honest ledger),
  pricing catalog (annual math correct on all four tiers), support inbox
  (real resolved case with thread).
- Two open findings from the walk, not yet acted on:
  - Application "Test 123" (Aug 8) shows **"Provisioning needs attention —
    Clerk organization request failed (403)"** with a Retry provisioning
    control. Retrying is a production write (creates the Clerk org and
    emails the applicant) and awaits an owner decision.
  - That Aug 8 application shows decision email **SENT**, while the Aug 11
    application shows email **NOT CONFIGURED** — the Resend sender
    configuration regressed between those dates and should be re-checked in
    the Convex prod env / Resend dashboard.

## Operations workspace simplification — 27 August 2026

- Release `237dc71` (CI run `33025029459` green, Vercel deploy verified live
  with an authenticated owner session) simplifies the operations surface
  without changing any server contract, permission gate, or audit behavior:
  - Inventory gains a search box; each row gains **Sell** (jumps into the
    Checkout tab with the item already in the sale via the existing
    preselect seam) and **Reorder** (opens a purchase-order draft with that
    product preselected, emphasized on low-stock rows). The per-row
    permanent-delete button was removed — deletion stays behind Edit where
    the typed confirmation lives. The Purchase orders button shows its open
    count.
  - Checkout reorders to desk flow: items first with an autofocused search,
    then customer, then payment.
  - Equipment stats compress to one three-across row on every screen, and
    open issues/work orders sort above closed history.
- Covered by three new unit tests (suite now 875) plus the existing
  operations Playwright spec; verified in mock-mode browser (Sell → checkout
  preselection observed) and live on Production (search box, Sell/Reorder
  row actions with a branch selected, row delete gone).

## Ledger tutorial on the statements hub — 27 August 2026

- `/finance` gained a "How the ledger works" button under the three
  statement cards (release `21c13b9`, CI run `33023409096` green, Vercel
  auto-deploy verified live). It opens a seven-step plain-language animated
  walkthrough for non-accountant owners: the notebook concept, the
  refresh/post queue loop, balanced posting, each of the three statements,
  and the two-click monthly routine. Vignettes reuse the existing
  settle-motion keyframes plus three new direction-neutral ones
  (`ledger-tilt`, `ledger-fill`, `ledger-draw`), replay when a step mounts,
  need no RTL mirroring, and flatten under the global reduced-motion rule.
  Covered by a new hub test (full suite now 872); verified in mock-mode
  browser and live on Production with an authenticated owner session.

## Release and authenticated Production smoke — 27 August 2026

- Application release `cb9f10c` (five commits over `4b8bcc4`: tenant-local
  accounting dates + ledger read performance, demo-auth inlining repair,
  consolidated source-queue refresh, browser-suite restoration, and docs)
  pushed to `main`. GitHub Actions run `33019165155` passed (typecheck, lint,
  unit tests, build, and the credential-gated Convex codegen check). The
  only CI annotation is the known Node 20 deprecation on the pinned
  `checkout@v4` / `setup-node@v4` / `pnpm-setup@v4` actions.
- Vercel auto-deployed the web from the push; the live site serves the new
  build (verified behaviorally: rebuilt operations command center, statement
  URL scope canonicalization, consolidated Refresh queue with its banner).
- The owner deployed Convex to exact Production `descriptive-meerkat-589`
  through the guarded wrapper. First attempt did not take effect (live
  statements still emitted pre-`4b8bcc4` warning copy — caught during the
  smoke); after the owner re-ran the deploy, the live responses switched to
  the current conditional completeness copy, confirming the new functions.
- The owner set `RIVET_PUBLIC_REQUEST_PEPPER` in the Convex Production
  environment; `pnpm convex:env:names -- --prod` now lists it (names only).
  The 25 August pepper-strength blocker is closed.
- Signed-in, read-first Production smoke with an active gym owner
  (two-branch test gym), all passing: sign-in routes to the gym workspace;
  dashboard KPIs live; `/operations` all-branches view read-only with
  writes gated, per-branch inventory scoping correct (7/5 split), Checkout
  loads members, stock, and Cash/CliQ/Visa options with no sale created,
  Machines lists the branch asset with zero issues/work orders; all three
  `/finance` statements render with the conditional completeness warnings,
  single deduplicated panel, balance-sheet equation reconciling, cash-flow
  reconciliation honestly `unproven` pending a queue refresh, and date/
  branch scope changes updating figures and the canonical URL; ledger
  controls show the 17-account chart and the consolidated refresh. No
  writes were performed. Console: one 422 confined to the Clerk sign-in
  handshake, no app errors; network all 200s; laptop and narrow-viewport
  layouts clean.
- With the owner's explicit approval, the accounting operating procedure was
  then executed live on the owner's two-branch test gym (27 August 2026):
  an organization-wide source-queue refresh discovered 46 facts
  (15 pending / 31 unconfigured, month-scoped facts correctly anchored to
  tenant-local Asia/Amman dates); all 15 originals were posted; a second
  org-wide refresh surfaced 16 dependency-unlocked facts (STAIR-01
  straight-line depreciation months and membership recognition schedules),
  which were posted; a final org-wide refresh left 0 pending / 15 honestly
  unconfigured and proved coverage. Result: trial balance JOD 2.4K = 2.4K
  across 11 accounts; income statement with retail revenue 175.000, COGS
  100.000, repairs 200.000, depreciation 20.000/month; balance sheet
  reconciling to zero difference (equipment 1,200.000 gross, accumulated
  depreciation −280.000 = 14 posted months, deferred membership revenue
  210.000, negative AR −355.000 reflecting collections that predate the
  ledger — the documented opening-balance responsibility); cash flow
  proven (0 → +740.000 → 740.000, all operating); and a full-August range
  showing earned membership revenue 18.924 recognized inside August by the
  tenant-date anchoring. The consolidated coverage badge cleared on all
  three statements.
- The owner then posted the opening-balance manual journal (Main branch,
  posting date 2025-06-01, memo "Opening balances at ledger cutover"):
  Dr 1200 Accounts receivable 355.000 / Cr 3000 Owner equity 355.000,
  derived from the trial-balance offset and the outstanding-balances record
  of JOD 0.000. Verified after posting: receivables net to zero, owner
  equity 355.000, and the balance sheet reconciles at 1,810.000 =
  1,810.000 with difference 0.000. Remaining unconfigured queue rows are
  the reviewed deliberate exclusions (cancelled test memberships and their
  recognition schedules, stock adjustments without a posting policy, one
  historical stock sale without a unit cost).

## Management-ledger deep dive: tenant-date anchoring, demo-auth repair, consolidated refresh — 26 August 2026 (working-tree update)

- **Tenant-local date anchoring (correctness fix, Convex + mock parity).**
  Monthly recognition/depreciation facts were timestamped at the UTC month
  end, so for tenants ahead of UTC (Asia/Amman) an August service month
  resolved to a September tenant-local date: it posted into the September
  period and fell out of any August-scoped statement and its coverage check.
  Equipment purchase dates parsed at UTC midnight had the mirror-image drift
  (previous local day) for tenants behind UTC. Both adapters now anchor these
  facts to a timestamp whose tenant-local calendar date equals the stated
  date. Regression tests cover Asia/Amman recognition (posts into the service
  month's own period) and America/New_York acquisition (same calendar day).
  Already-posted journals are immutable and keep their historical dates;
  non-posted queue projections re-anchor on the next refresh.
- **Demo-auth client bundle regression (repaired).** Commit `5ac4b59` moved
  the demo-bypass environment reads behind a function parameter, which
  Next.js cannot statically inline into browser bundles; every client bundle
  therefore computed `DEMO_AUTH_BYPASS === false`. The demo persona picker
  never rendered and the entire mock-mode Playwright contract was broken
  (the repo's happy-path spec failed at sign-in). The constant is now built
  from literal `process.env.*` member expressions; production remains
  fail-closed because NODE_ENV inlines as "production" there. The happy-path
  spec passes again.
- **Consolidated queue refresh (functional gap closed).** The ledger-controls
  UI offered "Refresh queue" only with a concrete branch selected, while a
  consolidated statement's coverage can only be proven by an
  organization-wide run — so consolidated statements could never reach proven
  coverage through the product UI. A queue refresh is a projection scan, not
  a posting write; it is now available in the consolidated view (posting a
  source and manual journals remain branch-gated, and read-only roles are
  unchanged). New workspace test covers the consolidated refresh.
- **End-to-end verification.** Mock-mode browser walkthrough of the sign-in
  personas, ledger hub, all three statement routes, and ledger controls
  (org-wide refresh, branch-scoped pending queue, role gating), plus a new
  integration test that drives queue refresh → deferred membership posting →
  recognition posting → the income statement's account-4100 revenue line →
  proven coverage for both branch and consolidated scope.
- **Dead code removed** from `convex/security.ts`: `hashRequest` (its
  JSON.stringify array-replacer silently dropped nested keys from the
  fingerprint) and `branchIdFromPublic` — both unused.
- `.claude/launch.json` gained a `web-mock` configuration encoding the
  sanctioned mock + demo-auth local browser contract (mirrors the Playwright
  webServer environment); the existing `gymos-web` entry is preserved.
- Validation for this working tree: complete Vitest suite **142 files /
  871 tests** (includes the four new regression tests), application and
  Convex TypeScript checks, full ESLint with secret-output audit, Next.js
  production build, `git diff --check`, and the mock-mode Playwright
  happy-path spec — all passing.

## Mock-mode browser suite restored — 26 August 2026 (working-tree update)

- Running the full credential-free Playwright suite after the demo-auth
  repair surfaced six failures that had been invisible while the whole suite
  failed at sign-in. Diagnosis: **no product defects** — six specs had
  fossilized against deliberate, documented, unit-tested product changes
  while the browser contract was dark. The specs were updated to today's
  product truth:
  - Reception and Operations are fail-closed concrete-branch lanes; the
    manager-override and operations specs now select a branch (and the
    operations spec was rewritten for the rebuilt Inventory/Checkout/
    Equipment command center — the old Facilities tab and "Add supplier"
    button no longer exist; it now also asserts the read-only all-branches
    gate and resolves the seeded equipment issue).
  - Statement routes canonicalize their date/branch scope into the URL, so
    `$`-anchored URL assertions were relaxed.
  - Preview member signup deliberately refuses to imitate account creation;
    the spec now asserts the Clerk notice and the seeded-persona entry point
    instead of typing a fake password.
  - Public/member trial requests are scheduled: the specs select a branch,
    wait for the unlocked time window, and assert the enabled submit.
  - The platform entitlement spec's fixed goBack choreography rotted (in-app
    tours coalesce history entries and a back-restored document re-enters
    the console root); tier rounds now return by reloading the gym record —
    each round stays reload-free between the platform save and the
    gym-workspace observation, which is the realtime contract being proved.
  - The pricing spec additionally asserts the Starter card's
    `?plan=&interval=` href (the carrying contract) before navigating.
- Final browser verdict: **31 passed / 0 failed / 14 skipped** — the skips
  are the credential-gated Convex smoke, operational-flow, and staging
  journeys, which require Clerk storage-state files and the staging guard
  environment documented in the release runbook.

## Accounting query performance and release-gate evidence — 26 August 2026 (working-tree update)

- Report/accounting read paths were optimized without changing behavior,
  posting policy, amounts, or any authorization decision:
  - `stockMovements` gained a `by_public_id` index. The stock-movement
    source-fact resolver and the posted/reversed status writeback now use an
    indexed unique lookup instead of collecting the entire movement table per
    lookup. Source-queue coverage evaluation (which resolves every candidate
    on each statement render) previously scanned all movements once per
    stock-movement candidate.
  - Cash-flow classification receives each journal bundle directly instead of
    re-searching every period bundle for the line it already came from.
  - The statement report context collects the organization's journal entries
    once per request and shares that collection between the policy scan and
    the statement builders, halving the entry-table scans per report.
- The next Convex deploy will therefore propose exactly one additive schema
  change: new index `by_public_id` on `stockMovements`. No table or index
  deletion is expected; stop per the runbook if the dry run shows anything
  destructive.
- Local validation for this working tree (26 August 2026): complete Vitest
  suite **142 files / 867 tests** passed; focused financial plus statement UI
  tests (6 files / 39 tests) passed; application and Convex TypeScript checks;
  full ESLint with secret-output audit; Next.js production build; and
  `git diff --check` — all clean.
- Value-free provider inspection: `pnpm convex:env:names -- --prod` resolved
  through the configured operator context (project `rivet`) and returned the
  Production variable names. **`RIVET_PUBLIC_REQUEST_PEPPER` is not among
  them.** `convex/publicAbuse.ts` requires a strong pepper in a production
  Convex runtime and otherwise fails closed with `CONFIGURATION_ERROR` on the
  public application/trial/entry-pass/check-in protection paths. This is a
  release stop-condition: the owner must set the variable in the Convex
  Production deployment dashboard (never through chat, CLI arguments, or
  logs). The 25 August pepper correction may have been applied to the Vercel
  environment only.
- No Convex Production deploy, no Vercel deployment verification, and no
  authenticated owner smoke are claimed for this tree. The release remains
  gated on the missing Convex variable above, exact-target confirmation
  (`descriptive-meerkat-589`), and explicit Production authorization per
  [HANDOFF_PLAN.md](HANDOFF_PLAN.md).

## Management Ledger accounting completeness — 26 August 2026 (working-tree update)

- The accounting source queue now persists a scoped refresh run, authoritative
  candidate digest, and per-source projection fingerprint. A statement reports
  queue coverage as proven only when a current complete scan represents every
  in-scope source; legacy posted/reversed rows receive a safe fingerprint
  backfill without changing journal amounts, policies, or status.
- Time-based membership sales remain deferred on posting (Dr 1200 / Cr 2200).
  After that sale or renewal is posted, earned monthly service can be posted
  through `membership-revenue-recognition.v1` (Dr 2200 / Cr 4100). Allocation
  uses exact integer minor units across persisted service days, excludes
  active/completed freeze dates, stops future earning at cancellation, and
  never recognizes more than the posted deferred amount. Future months,
  unposted sales, mismatched branch/currency, and schedules over 120 months stay
  explicitly unconfigured.
- Equipment acquisition must be posted before depreciation. Eligible active
  assets use `equipment-depreciation.v1`: straight-line monthly, installation
  date falling back to purchase date, zero residual, deterministic final-unit
  rounding, Dr 5600 / Cr 1550, and no cash-flow classification. Cost, date,
  organization currency, and a 1–600 month useful life are required. Retired or
  replaced assets remain unconfigured until an audited effective retirement/
  disposal workflow exists; the system does not invent that date.
- Statement warnings are now conditional and deduplicated. The UI renders one
  completeness panel rather than repeating the same membership/depreciation
  caveat. Missing inputs or unposted sources still produce a specific warning;
  an honestly complete projection removes the blanket warning.

## Management Ledger standalone reporting — 26 August 2026

- `/finance` is the canonical, read-focused Management Ledger hub. It contains
  three equal statement links—**Income statement**, **Balance sheet**, and
  **Cash flow statement**—and no payment, shift, report, or journal controls.
  The hub is intentionally a choice screen rather than another dense ledger
  view; it does not display fabricated preview figures.
- Each statement has its own focused route backed by the existing Convex/Mock
  report projections: `/finance/income-statement` calls the income-statement
  projection (including Net Income), `/finance/balance-sheet` calls the balance
  sheet projection, and `/finance/cash-flow` calls the cash-flow projection.
  These pages share one statement shell, so date and branch filters, loading,
  retry, warnings, and stale-data behavior are consistent without duplicating
  report logic.
- Statement scope is reflected in the URL (`from`, `to`, and `branchId`) and is
  preserved when opening a card or returning to the hub. Every hub and detail
  route enforces the `reporting` workspace entitlement plus
  `reports.financial.read`. The sidebar gives Management ledger its own section
  with a single **Statements** entry; it is no longer grouped under Finance,
  and the payment FinanceNav is not rendered on ledger pages.
- `/reports/statements` is retained only as a compatibility redirect to the
  `/finance` hub, preserving supported date/branch query parameters. Advanced
  accounting maintenance remains at `/finance/controls`—journal entries,
  source queue refresh/posting, periods, reversals, and close/reopen—and stays
  behind the `finance` module and its existing mutation permissions.
- Statement metadata keeps conditional completeness caveats visible. Reports
  use posted or reversed management-ledger entries only; incomplete source
  coverage and specific unconfigured facts remain visible, and background
  refresh failures identify when the last successful data is being shown.
  Opening balances remain an explicit operator responsibility. These are
  management reports, not statutory or tax statements.
- Financial mutations use centralized invalidation for both `finance` and
  `managementReports`, so posting, reversal, period, and source-queue changes
  refresh controls and statement projections together.
- Final validation passed: `pnpm --dir apps/web test` (**142 files / 867
  tests**), app and Convex TypeScript checks, the production build, full lint
  and secret-output audit, and `git diff --check`. No Playwright run was
  performed and no browser visual verification is claimed.

## Production-readiness implementation slices — 25 August 2026 (working-tree update)

The current local working tree includes the implemented P0/P1 slices from the
readiness plan:

- explicit tenant and branch scope for mutations, with **All branches** kept
  read-only;
- retail finance and accounting lifecycle hardening, including stock-cost,
  refund/void, cash-shift, and journal invariants;
- invitation acceptance, safe user projections, deterministic multi-org
  selection, and related identity/security boundaries;
- public media ownership/upload controls, abuse limits and idempotency, and
  production fail-closed configuration/security headers;
- provisioning retry and lease fencing that preserves authoritative tenant
  state;
- the real Clerk customer signup flow, including verification and safe return
  context;
- atomic branch-to-branch inventory transfers with valuation and audit parity;
- truthful deferred handling for Facilities and Automations, with no dead-end
  operator actions; and
- the focused Operations scope of Inventory, Checkout, and Machines.

The final independent security review also fixed required upload-intent and
storage ownership checks, member-photo branch authorization, authorization
before purchase-order and PT idempotent replay responses, and strict matching
of Clerk invitation, application, and workspace metadata. External edge/IP/
device rate limiting and provider-backed/Production verification remain open.

Credential-free local validation for this working tree passed: **136 Vitest
files / 828 tests**, **14 Node deployment-safety tests**, application and
Convex TypeScript checks, full lint plus the secret-output audit, the
production Next build, and `git diff --check`.

This is local working-tree evidence only. No Playwright run was performed; no
commit or push was made; and no Convex or Vercel Production deployment was
performed. Live provider-backed invitation/signup verification and the
Production smoke, rollback, capacity/headroom, and backup/recovery gates
remain outstanding.

## Deferred operational surfaces and truthful destinations — 25 August 2026 (working-tree update)

- The supervised Operations scope is explicitly **Inventory, Checkout, and Machines**. Facilities/cleaning tasks are not being restored to the operator workspace in this slice; their backend records and accounting history remain preserved for a later product decision.
- Automations remains deferred. Existing automation rules, executions, retries, notifications, and audit events remain intact, but deferred pages expose only a truthful paused state with links to automation audit history and RIVET Support. No rule creation, execution, or delivery controls are advertised.
- Failure notifications no longer send operators to the paused automation route. Terminal operational-email failures open the real **Settings → Operational email** controls, while automation attention and exhausted-retry notices open immutable automation audit history when no member or lead record is available.
- Navigation tests cover the absence of Facilities and Automations from the primary workspace, and Convex regressions cover the truthful notification destinations. This is a scope/dead-link cleanup; no provider activation, Production data mutation, or Convex deploy is implied.

## Operations branch comparison and equipment restoration — 25 August 2026 (working-tree update)

- The Operations workspace now treats inventory as branch-local data. A
  concrete branch shows only that branch's available quantity, low-stock
  state, checkout, and stock-management actions; the **All branches** view is
  an explicit read-only comparison that totals availability and labels each
  branch's quantity and alert state. It never silently substitutes the first
  branch for an all-branches selection.
- Checkout follows the same branch context as Inventory. Its branch selector
  is synchronized with the global gym branch selector, valid deep links update
  the shared selection, and a failed branch change is surfaced instead of
  leaving the sale on an unselected branch. Mutating inventory and retail
  checkout remain disabled until a concrete, visible branch is selected.
- Inventory, Checkout, and Machines are now same-page tabs in one Operations
  workspace. The branch comparison, compact low-stock summary, centered
  dialogs, and simplified actions keep the primary operator flow focused on
  what is available, what can be sold, and what needs attention.
- The Machines tab restores the equipment register and its persisted repair
  workflow: machine status, safety issues, issue resolution, work orders,
  repair-versus-replace guidance, and historical activity. Equipment actions
  remain branch-scoped and permission-gated. An out-of-service issue moves an
  active machine into maintenance; resolving it requires an explicit
  safe-to-operate confirmation and only returns it to active when no unsafe
  unresolved issue remains. Work orders follow draft → approved → in progress
  → completed (or cancellation) transitions, and terminal/retired machines
  cannot receive new issues.
- Convex and MockGymOSApi implement the same branch filtering, equipment
  lifecycle, safety, assignee-scope, recommendation, and work-order rules.
  Validation for this working tree passed: full Vitest coverage (**136 files /
  828 tests**), app and Convex TypeScript checks, full ESLint and
  secret-output audit, the production Next build, 14 Node deployment-safety
  tests,
  and `git diff --check`. A mock-mode in-app browser visual pass (not
  Playwright) verified the All branches comparison, independent Sweifieh stock
  with global branch synchronization, Abdoun machine issue/work-order UI, the
  centered Add machine dialog, and no app console errors. Commit/push and
  Convex Production deployment remain pending; this section makes no
  production success claim.

## Operations simplification and product-master deletion — 24 August 2026

- The gym Operations surface is being reduced to two beginner-friendly,
  same-page tabs: **Inventory** and **Checkout**. Inventory prioritizes what is
  available now, with add-item, centered supplier and purchase-order dialogs,
  and a simple low-stock alert when available stock is at or below its
  threshold. The tutorial and the separate facilities/equipment
  command-center presentation are removed from this primary flow; their
  historical records remain intact in the backend.
- The product editor has one canonical set of fields: SKU, name, unit,
  current availability for the selected branch, low-stock threshold, and
  selling price. Saving availability is an audited stock adjustment, not a
  silent balance overwrite. Refill targets, delivery/lead-time forecasting,
  and product default supplier cost are no longer part of the operator model.
- A purchase order may use a saved supplier or the explicit
  **Private / bought elsewhere** source. Actual unit cost on a purchase-order
  line remains the recorded purchase cost; no WhatsApp or other supplier
  provider is integrated, so the gym can keep procurement communication
  outside RIVET until it supplies its own provider configuration.
- Checkout remains the atomic retail-sale path for a member or guest: it
  validates branch stock and payment details, creates the sale/receipt and
  stock movement together, and supports Cash, CliQ, and Visa/card. Cash does
  not require an external reference; CliQ/card do. Mock refund/void behavior
  follows the same stock-restoration rules as the live path.
- Product-master deletion is now a distinct, audited permanent action. It
  removes the mutable product identity so a replacement can reuse the SKU,
  while tombstone and snapshot evidence keeps stock movements, retail receipts,
  purchase history, refunds/voids, and audit records understandable. Open
  purchase-order or otherwise unsafe references remain guarded rather than
  creating dangling operational records.
- “Archive” remains the truthful action for gyms and other records whose
  financial, audit, or operational history must remain intact. Archived zones
  and equipment can reuse identifiers where the active-record constraints allow
  it; historical issue and work-order evidence is retained.
- Validation is clean: 738 Vitest tests, app and Convex TypeScript checks, full
  ESLint, the secret-output audit, safe Convex CLI tests, and the Next production
  build all pass. No Playwright suite was run. GitHub static CI, credentialed
  Convex codegen, and Vercel Production passed for `3f6b787`.
- Convex Production `descriptive-meerkat-589` was explicitly selected for the
  matching `3f6b787` backend. The guarded dry run and deploy reported no index
  deletions and completed schema validation; the three product-tombstone
  history indexes were added. The read-only `health:check` returned `status:
  ok`. No seed, import, restore, or tenant-data workflow was run.

## Native Arabic and translation-service removal — 24 August 2026 (working-tree update)

- Removed the paid translation provider, compiler, release publisher, runtime
  provider boundary, environment variables, and provider-only tests/docs.
  Vercel Production now validates the Convex and Clerk configuration and runs
  the normal Next.js Webpack build without a translation-service dependency.
- Preserved the IBM Plex Sans Arabic font, native Arabic fields, document
  `dir`/`rtl-font` state, and the manual RTL layout switch. Manual direction
  changes keep the document language as English until native Arabic copy is
  intentionally added.
- Validation passed: app and Convex TypeScript checks, **725 unit tests**,
  zero-warning lint and secret-output audit, production environment validation,
  the 47-route production build, `git diff --check`, and a repository-wide
  search with no remaining translation-provider names or credentials.
- No Convex or Vercel deployment is claimed by this handoff; the application
  commit is being integrated and pushed through the normal GitHub path.

## Subscription and retail release, 24 August 2026

- The hourly platform-subscription reconciliation is now explicitly disabled
  unless the Convex deployment sets
  `RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED=1`. Missing values perform zero
  writes. The internal `subscriptionReconciliation.preview` query remains
  read-only and returns only aggregate invoice, past-due, suspension, and
  boundary counts so an operator can inspect Production impact before enabling
  the automation. Active subscriptions now prefer their paid-period boundary
  instead of a stale trial end.
- Retail receipts now support permission- and reason-gated item refunds and
  same-business-day voids. Refund quantities cannot exceed the sold/remaining
  quantity; both paths restore stock with durable return movements, update the
  original retail payment lifecycle, create the appropriate negative refund
  accounting fact, and append audit evidence. The receipt UI exposes remaining
  item quantities, totals, pending/error states, and the current lifecycle.
- The shell keeps native Arabic-ready direction state and manual RTL layout
  coverage without a remote translation provider. The local server port can be
  overridden with `PLAYWRIGHT_PORT` without reusing an unrelated process.
- Local evidence: frontend and Convex typechecks, zero-warning lint and
  secret-output audit, **128 test files / 725 tests**, and the 47-route
  Production build passed. The UI detector reported no findings.
- The previous release's backend commit `e7f8121337a30a02da56f61264c63bdc68efee5e`
  was deployed through the guarded wrapper to exact Convex Production
  `descriptive-meerkat-589`. The dry run and deploy validated the schema,
  deleted no indexes, and added only the retail-sale indexes. The reconciliation
  flag is absent. Production preview returned 5 processed subscriptions, 1
  eligible boundary, and zero invoices to create, invoices to mark past due, or
  organizations to suspend. The mutation returned `enabled: false` and zero
  writes; `health:check` returned `status: ok`.
- GitHub Actions [run 32744664588](https://github.com/hashemnusair/Rivet/actions/runs/32744664588)
  passed for `ca7831a`, and Vercel Production deployment
  [4z8ReyCXCZnEHhuLAymFV44NV974](https://vercel.com/nusairhashem04-gmailcoms-projects/rivet-web/4z8ReyCXCZnEHhuLAymFV44NV974)
  completed. The public, platform, and gym custom domains returned HTTP 200.
- The available Chrome sessions had expired. Platform billing and retail
  checkout both rendered the Production sign-in route without console errors,
  but authenticated acceptance was not claimed and no Production sale was
  created. Remaining launch holds are the Convex capacity warning, an active
  safe owner/admin acceptance session, credential-complete staging, and the
  recorded product-policy decisions. Measured performance and final Arabic
  work stay last.

## Retail checkout and Operations workflow, released 24 August 2026

- Operations now has a transactional retail checkout at
  `/operations/checkout`. A sale validates the branch, member or guest,
  product price, available stock, payment method, and idempotency key before
  atomically creating the sale, receipt, payment projection, stock movement,
  inventory decrement, and audit record. Member sales retain the member
  context and timeline link; guest sales ask only for a name and phone number.
- Checkout supports manually recorded Cash, CliQ, and Visa/card payments. A
  printable receipt shows the customer, items, totals, method, and reference;
  Cash uses the existing shift workflow and CliQ/card require an operator
  reference. The checkout and catalog are protected by Operations entitlement,
  workspace/module state, branch access, and the appropriate read/collect
  permissions.
- Retail sales now flow through transaction lists, cash shifts, daily
  reconciliation, dashboard revenue, and accounting with method-specific
  ledger accounts. Products expose a selling price, while purchase-order lines
  retain the actual recorded purchase cost. “Delete item” is an audited
  permanent product-master deletion with historical tombstone/snapshot
  evidence; immutable movements, receipts, and ledger facts remain intact.
- Operations terminology and layout now keep the useful primary jobs together:
  **Inventory** (available stock, low-stock alerts, suppliers, and purchase
  orders) and **Checkout** (retail sales). The product editor uses only SKU,
  name, unit, current availability, low-stock threshold, and selling price;
  alerts are based on available stock reaching the threshold, without a
  delivery-time projection.
- Validation passed: app and Convex TypeScript checks, **176 relevant tests**,
  targeted ESLint, `git diff --check`, and the production build. The checkout
  shipped in `40b9bc9`; refund/void recovery and its Production backend deploy
  shipped in `e7f8121`.

Known scope: payments are manual and no external provider is connected;
purchase orders record either a saved supplier or a private/elsewhere source;
and supplier communication, including WhatsApp, remains outside the product
until a gym configures an approved provider.

## Admin interaction, Brand Kit, and native Arabic layout, released 24 August 2026

- Platform gym archive and subscription updates now use a platform-scoped
  mutation boundary, so a stale selected gym workspace cannot make an admin
  archive fail with a tenant-membership error. Convex authorization coverage
  includes archiving a foreign gym without tenant membership.
- Selected gym dashboard creation workflows now open centered, accessible
  dialogs: Operations supplier, stock, movement, purchase-order, facility,
  equipment, and issue forms; CRM contact/trial workflows; member creation;
  and PT booking. Successful submissions close the dialog and preserve the
  underlying route context.
- Brand Kit save now persists the palette, derived tokens, logo asset, and
  alt text through the server and immediately updates the settings cache and
  authenticated gym shell. Logo lifecycle, owner authorization, and reload
  behavior are covered end to end.
- The inline `styled-jsx` loading animation that caused a reload crash after
  Brand Kit changes was moved to global CSS. Native Arabic fields, the IBM Plex
  Sans Arabic font, and the manual RTL layout switch remain available without a
  paid translation service.
- Validation: **710/710 unit tests**, frontend and Convex typechecks,
  zero-warning lint and secret-output audit, the 46-route Webpack build,
  focused Operations and suspended-gym E2E journeys, and Brand Kit
  save/reload browser verification passed.

These changes are now on `main`. Convex Production received the platform and
retail backend changes through the guarded `e7f8121` deploy. This follow-up
removes the paid translation integration from the application build while
retaining native Arabic fields and manual RTL layout. Final Arabic acceptance
remains separate. Secret values are intentionally not recorded here.

## Integrated admin operations, ledger, and provisioning pass — 23 August 2026

- Gym application provisioning now treats the durable application row as
  authoritative after external-provider work. Completion is idempotent,
  invitation bookkeeping is finalized with the workspace, and a delayed
  provider response cannot regress a completed gym into a false failure or
  leave an actionable failure alert behind.
- The admin Gyms directory defaults to Active gyms, keeps the remaining
  lifecycle filters to the right, and sorts the all-gyms view active-first.
  Operations now has working inventory, supplier, stock movement, purchase
  order, facility-task, equipment, issue-resolution, and retry flows, with a
  typed `updateEquipmentIssue` API across Convex and Mock adapters.
- Management Ledger fixes cover real calendar-date validation, tenant-local
  posting periods, local-timezone source filtering/period closure, accurate
  journal poster identity, and public account/branch identifiers.
- Validation: **703/703 unit tests**, app and Convex typechecks, lint, and the
  secret-output audit passed. The production webpack build had previously
  passed; the final rebuild was blocked only by sandbox DNS resolution for
  `fonts.googleapis.com`. The full final Playwright rerun was blocked before
  launch by desktop execution allowance; focused Operations and suspended-gym
  E2E journeys passed.

## Four-tier Production release and unavailable-owner recovery — 23 August 2026

- Application commit `7e6ae92b9861892efa06f6d0d780d025fba3746d`
  is deployed on Vercel Production (`H3DKcGPaGmr8Nzn28qJ7P6TZW1YD`) and
  passed GitHub Actions run `32639554231`. This release carries Elias's
  four-tier subscription and live-entitlement work from `6c43147` together
  with the owner-login recovery below.
- The guarded dry run and deploy targeted exact Convex Production deployment
  `descriptive-meerkat-589`. Schema validation completed, no indexes were
  deleted, and the post-deploy `health:check` returned `status: ok`. Convex
  again warned that the project is above the Free-plan limits.
- Root cause of the failed owner sign-in was an active gym membership whose
  organization is suspended or cancelled. The identity projection correctly
  hid that organization from routable workspaces, but the client mistook the
  empty routable list for a consumer account and called the member-registration
  mutation. The server rejected that mutation because the account still has a
  gym membership.
- Identity projection now distinguishes unavailable gym access from a true
  member-only identity. It neither initializes member APIs nor exposes the
  suspended workspace. The login page explains that the gym is inactive and
  provides a real Clerk sign-out action instead of linking back to the same
  route.
- Production browser verification on the affected owner session showed
  **Your gym workspace is unavailable** and **Sign out and use another
  account**, with no page or console errors. The account is valid; restoring
  its gym subscription is a separate reasoned platform-admin mutation and was
  not performed by this release.
- Local gates passed: frontend and Convex typechecks, zero-warning lint and
  secret-output audit, **122 test files / 660 tests**, the 46-route Production
  build, and Playwright (**30 passed / 14 credential-gated staging tests
  skipped / 0 failed**). `FRONTEND_HANDOFF.md` remains frozen and Arabic plus
  measured performance work remain deferred to the final pass.

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

## Admin platform overhaul — 23 August 2026 (working-tree update)

- Platform Overview is now an operational surface rather than a placeholder:
  live snapshot data feeds the KPIs, invoice/support/trial queues are scoped to
  provisioned tenants, suspended/cancelled tenants cannot inflate active usage,
  stale entitlement plans cannot override the authoritative organization plan
  for MRR, and unlinked cleanup fixtures fail closed. The fake Marketplace
  Views, payment-provider placeholder, and unrelated marketing migration panel
  were removed; the former Overview operator-queue panel was also removed in
  favor of concise KPI counts and direct gym, application, and billing links.
- The admin gym directory is leaner and active-first. Provisioned gyms appear
  before trial, past-due, suspended, and cancelled rows; unprovisioned/archived
  cleanup records remain available only for audited operator cleanup and do not
  appear in the active tenant preview.
- Subscription catalog and landing pricing stay canonical across Starter,
  Growth, Pro, and Enterprise. Upgrade requests are support-only; a gym cannot
  self-upgrade from the dashboard. Monthly and annual cadence remain aligned
  with the landing page and drive the subscription lifecycle.
- Trial and renewal lifecycle is server-derived: onboarding starts a one-month
  calendar trial with a fixed end date; an invoice is created automatically at
  T-3 days and is due at period end; a two-day grace window follows the end
  date, then unpaid access is suspended and the public listing is hidden.
  Recording a verified payment reactivates the gym and restores its period;
  subscription dates are not manually selectable in the admin controls.
- The subscriptions surface is simplified around the gym directory and billing
  ledger. Duplicate management controls and current-subscription summaries are
  removed from the standalone subscriptions view; gym detail remains the place
  to manage a tenant, while billing exposes invoice state, due dates, and
  payment/reconciliation actions.
- Billing remains intentionally manual: there is no external payment provider,
  card auto-charge, or automatic card verification. Payment confirmation uses a
  bank-transfer/reference entry or another operator-verified manual record;
  email delivery for invoices and lifecycle notices depends on a configured
  external provider and is not claimed when that provider is unavailable.

This is a local working-tree update only. No Convex/Vercel Production deploy or
Production product-data mutation is claimed here.

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
- Reports do not invent opening balances, historical snapshots, unsupported source postings, cancellation proceeds, or retirement dates. Revenue recognition and depreciation post only from their validated, dependency-backed schedules. Cashflow remains unproven while source-queue coverage is incomplete.
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
