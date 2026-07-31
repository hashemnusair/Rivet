# Frontend Handoff

## 2026-07-31 public, customer, and platform-admin expansion

The product owner explicitly expanded the frontend scope beyond the original B2B MVP boundary. The frontend now demonstrates the complete acquisition loop around the existing gym operations app:

- `/` — new public RIVET landing page, adapted from the supplied reference and extended with product, network, customer-portal, and pricing sections.
- `/signup` — four-step gym-owner onboarding and trial-plan selection.
- `/customer/discover` — searchable directory of gyms subscribed to RIVET.
- `/customer/gyms/[gymId]` — gym profile, branch/slot selection, and a validated free-trial request form.
- `/customer/my-gyms` — the member dashboard: renewal countdown, visits, balance, membership cards, entry pass, and trial requests.
- `/customer/my-gyms/[membershipId]` — membership details, balance, visits, activity, and an entry QR pass.
- `/platform` — RIVET owner overview across all gym tenants.
- `/platform/gyms` and `/platform/gyms/[gymId]` — tenant directory, subscription health, branches, usage, owner, and account timeline.
- `/platform/subscriptions` — plan catalog, limits, trials, and current subscriptions.
- `/platform/billing` — SaaS invoice ledger and an interactive failed-payment recovery state.
- `/platform/support` — tenant support inbox, conversation view, reply, assignment/SLA, and resolution state.

### One sign-in portal

`/login` is the only sign-in surface. It carries three audiences:

- **Gym staff** (default) — the four role personas; signing in lands on `/dashboard`, or `/reception` for the receptionist.
- **Gym member** — the customer personas; lands on `/customer/my-gyms` or `/customer/discover`.
- **Platform administrator** — deliberately quiet, at the bottom of the page behind a small lock link; lands on `/platform`.

Deep links open the portal on the right tab via a URL hash (`/login#member`, `/login#admin`); a hash is used rather than a search param because `output: export` would otherwise force a Suspense boundary around the page. `/customer/login` is kept only as a client redirect to `/login#member` for old bookmarks. `/platform` now redirects to `/login#admin` unless the admin session exists — member and admin sessions survive a reload through `sessionStorage`, mirroring the staff persona.

### Connected preview behavior

- Booking a free trial at Forge Fitness calls the existing `GymOSApi` boundary, creates a lead, and moves it to `trial_booked`; gym staff can see it in `/crm/pipeline` and `/crm/queues` without a separate fake backend.
- Customer identities, memberships, marketplace gyms, and platform subscriptions live in `src/lib/public/experience-data.ts`; interactive session state is isolated in `src/lib/providers/experience-provider.tsx`.
- The QR pass encodes a demo identity. Production must replace it with a short-lived, signed, server-validated token; the UI labels this compromise explicitly.
- The public/customer/platform expansion is frontend-only and in-memory. Real customer and platform authentication, tenant provisioning, subscription billing, persisted trial bookings, marketplace moderation, and notification delivery remain backend work.

### Scope decision

`AGENTS.md` and the original README say not to build the future consumer marketplace in the MVP. This expansion is intentional because the product owner directly requested those surfaces on 2026-07-31. It remains an extension around the approved B2B operating core; it does not introduce an independent trainer marketplace.

### Latest verification

- `pnpm --filter web typecheck` — pass.
- `pnpm --filter web lint` — pass with zero warnings.
- `pnpm --filter web test` — 162 tests passed across 7 files.
- `pnpm --filter web build` — pass; 341 static pages generated, including the new customer and platform routes.
- `qrcode.react` was added for the membership entry pass.
- `public/brand/rivet-social-preview.png` is a generated, project-local social preview asset used by Open Graph and Twitter metadata.

## Status

- Completion date: 2026-07-31
- Frontend commit: working tree on `main` (see git log). Static-export / GitHub-connected Pages changes are uncommitted until you choose to commit.
- Mock mode command: `pnpm install && pnpm dev` from the repository root (starts `apps/web` on <http://localhost:3000>)
- Build command: `pnpm build`
- Test command: `pnpm test` (unit + component), `pnpm test:e2e` (Playwright)

Product name in the UI is **RIVET** (working title GymOS), derived from the logo in the repository root.

## Implemented routes

| Route | Purpose | Primary roles | Status |
|---|---|---|---|
| `/login` | Auth preview: four demo personas, any password | all | Done |
| `/` | Public marketing landing page and entry point for gym owners and customers | public | Done |
| `/dashboard` | Owner/manager revenue + exceptions dashboard; sales variant for salespeople | owner, manager, sales | Done |
| `/reception` | Full-height dark check-in console: lookup/scan, verdict, occupancy, shift gate | reception, manager | Done |
| `/members` | Searchable/filterable member table | all except trainer-only views | Done |
| `/members/new` | Create member with duplicate warning | sales, reception, manager | Done |
| `/members/[memberId]` | Member 360: overview, timeline, memberships, payments, check-ins, notes, tasks | all | Done |
| `/memberships` | Subscription list with status/payment filters | manager, owner | Done |
| `/plans` | Plan catalogue + create/edit plan | owner, manager | Done |
| `/crm/pipeline` | Stage board with drag-and-drop + accessible move menu, lost-reason report | sales, manager | Done |
| `/crm/queues` | Split-view daily work queues (overdue, due today, unassigned, trials, expiring, expired, my tasks) | sales, manager | Done |
| `/crm/leads/[leadId]` | Full lead record; contact logging, follow-up, conversion | sales, manager | Done |
| `/payments` | Branch transaction ledger with refund/void actions | manager, owner, auditor | Done |
| `/payments/receipts/[receiptId]` | Receipt detail with a real print layout | manager, owner, reception | Done |
| `/payments/shifts` | Current shift, daily reconciliation, shift history, variance approval | reception, manager, owner | Done |
| `/automations` | Rules list with enable/pause, EN/AR template previews, execution log | owner, manager | Done |
| `/automations/[ruleId]` | Rule editor: trigger + parameters, actions, dedupe window | owner, manager | Done |
| `/audit` | Filterable append-only audit log; rows expand to a before/after diff | owner, manager, auditor | Done |
| `/settings` | Organization, branches, staff access, roles/permissions, payment methods, notifications | owner | Done |
| `/_not-found` | Global 404 | all | Done |

Permission-gated areas render `ForbiddenState` when reached by URL — the nav only hides the link as a usability nicety.

## Architecture

- **App structure**: Next.js App Router. One authenticated route group `src/app/(app)/` sharing `Sidebar` + `Topbar`; `/login` sits outside it. Page files stay thin — workflow surfaces live in `src/features/<domain>/`.
- **Design system**: hand-built on Radix primitives in `src/components/ui/` (no shadcn CLI). Tokens in `src/app/globals.css` via Tailwind v4 `@theme`. Warm paper/ink palette, one signal red, a "night" palette reserved for the sidebar, login brand panel and reception console. Restrained radii, a single shadow scale used only on floating layers. Custom utilities: `panel`, `panel-inset`, `eyebrow`, `eyebrow-night`, `tabular`.
- **Typography**: **Manrope** (variable, `next/font/google`) for both display and body — hierarchy comes from size, weight and tracking, not a second family. **IBM Plex Mono** is reserved for *system records*: member numbers, receipt numbers, correlation IDs, branch/plan codes, template variables, keyboard hints, and the uppercase eyebrow/table-header labels. **Money and every other quantity use Manrope with `font-variant-numeric: tabular-nums`** (the `tabular` utility) — measured at 86.8px per digit versus 54.6–86.9px proportional, so columns align exactly without borrowing mono. IBM Plex Sans Arabic is swapped in under the RTL preview. The printed receipt (`#receipt-print`) is the one deliberate full-mono surface, since it mimics a POS slip.
- **Colour scheme**: the app declares `color-scheme: light` on `html` (it has no dark theme), with `.night-surface, [data-console] { color-scheme: dark }` so the dark surfaces keep legible native scrollbars and carets. Without this, a viewer whose OS is in dark mode gets dark-themed date pickers and select popups on light panels.
- **State strategy**: TanStack Query for all server state; React state for local UI. No global store. `useInvalidate()` invalidates a documented prefix list (`src/lib/api/keys.ts` → `INVALIDATE_ALL`) after any money- or membership-affecting mutation, which is why a payment shows up on the timeline, the ledger, the shift totals and the dashboard at once.
- **Form strategy**: React Hook Form + Zod resolvers for every significant form. Simple single-field reason dialogs use controlled state plus an explicit disabled-until-valid button.
- **Data-fetching/client boundary**: components never call `fetch` and never import seed data. Everything goes through `useApiQuery` / `useApiMutation`, which resolve the active client from `getApi()`.
- **Mock persistence behavior**: the mock database lives in memory for the lifetime of a browser page. Client-side navigation preserves mutations; a **full page reload re-seeds the tenant**. The demo persona, branch and RTL flag persist in `sessionStorage`, and sidebar collapse in `localStorage`. This is allowed by `docs/06` ("optional local storage persistence is acceptable") — see *Known gaps* for the implication.
- **Role/permission simulation**: `switchDemoRole(role)` swaps the acting user and recomputes the permission set from `defaultRoleDefinitions()`. The mock re-checks permissions on **every** method via a private `require()` guard, so the UI cannot fake authorization.
- **RTL strategy**: `dir` is set on `<html>` by a topbar toggle, plus an `.rtl-font` class that swaps in IBM Plex Sans Arabic. Layout uses logical properties throughout (`ms-*`, `pe-*`, `start-*`, `end-*`). Directional icons are mirrored once in `globals.css` by lucide class name. Numeric ratios and ranges are wrapped in `dir="ltr"` so bidi cannot reverse them.
- **Responsive strategy**: desktop-first (the product is used at a desk), but every surface stays usable down to phones. Below `lg` (1024px) the fixed sidebar is hidden and the content column takes the full width; primary navigation moves to a `MobileNav` drawer (`src/components/shell/mobile-nav.tsx`, Radix Dialog primitives — focus trap, Escape, scroll lock) opened from a topbar hamburger, closing on route change, with the branch picker duplicated in its footer below `md` (the topbar one is hidden there). The desktop collapse toggle and `localStorage` persistence are unchanged and only apply `lg` and up. Data tables scroll horizontally inside their panels (the `Table` component wraps in `overflow-auto`; the two raw tables — dashboard leaderboard, pipeline list — got explicit wrappers); phone/date/money cells carry `whitespace-nowrap` so rows stay one line tall inside the scroller. Multi-column form grids inside dialogs collapse to one column below `sm`. The pipeline board defaults to its list view on coarse-pointer devices under 1024px (drag-and-drop has no touch fallback), and the queues work panel scrolls into view on selection below `xl`. The reception console keeps its full-bleed layout at all sizes — its negative margins track the `main` padding in `(app)/layout.tsx` exactly (`px-4 sm:px-6 lg:px-8`).

## Data client

- Interface location: `apps/web/src/lib/api/GymOSApi.ts` — 74 methods plus all query-input types.
- Mock implementation location: `apps/web/src/lib/mock/MockGymOSApi.ts` (seed in `seed.ts`, constants in `seed-constants.ts`, store in `store.ts`).
- Factory/provider location: `apps/web/src/lib/api/client.ts` (`getApi()`, plus `setApiForTests()`), consumed by hooks in `src/lib/hooks/use-api.ts`.
- **How to add `HttpGymOSApi`**: implement the `GymOSApi` interface against `/api/v1`, then switch inside `getApi()` on an env flag, e.g.

  ```ts
  export function getApi(): GymOSApi {
    if (process.env.NEXT_PUBLIC_API_MODE === "http") return httpSingleton ??= new HttpGymOSApi();
    return mockSingleton ??= new MockGymOSApi();
  }
  ```

  No page or component changes are required. `setBehavior()` is mock-only; give `HttpGymOSApi` a no-op implementation.
- How errors are represented: every failure is an `ApiError` (`src/lib/api/errors.ts`) carrying `code`, `message`, `requestId`, optional `details` and `fieldErrors`. UI branches on the stable `code`, never on message text. Stable codes are enumerated in `ERR`. `QueryErrorState` maps `FORBIDDEN` / `NOT_FOUND` to the right surface; the query client does not retry those codes.
- Pagination/filter conventions: every list takes `ListQuery` (`page`, `pageSize`, `search`, `sort` with `-field` for descending) plus domain filters, and returns `Page<T>` (`items`, `page`, `pageSize`, `totalItems`, `totalPages`).

## Domain types

- Type/schema locations: `apps/web/src/lib/domain/types.ts` (all domain shapes), `permissions.ts` (permission catalogue, role defaults, discount limits), `status.ts` (membership status derivation + the pure check-in decision engine).
- Differences from `docs/06_API_AND_MOCK_CONTRACT.md`:
  - `createMember` returns `CreateMemberResult { member, duplicates }` rather than a bare `MemberDetail`, so the duplicate warning is part of the contract.
  - `createPayment`, `refundPayment` and `voidPayment` all return `ReceiptDetail` (the doc says `PaymentReceipt`) — the UI needs the branch, member, charge and linked transactions to render and print a receipt.
  - Added beyond the doc sketch: `switchDemoRole`, `setActiveBranch`, `checkMemberDuplicates`, `getMembership`, `unfreezeMembership`, `getCurrentShiftTotals`, `listCashShifts`, `reviewVariance`, `listMessageTemplates`, `listPendingApprovals`, `reviewApproval`, `upsertBranch`, `updatePaymentMethods`, `updateNotificationSettings`, `updateRolePermissions`, `resetDemo`, `setBehavior`.
  - `previewCheckIn` takes `{ branchId, query }` (matching `CheckInLookupInput`) and returns `CheckInPreview` with `found: false` for a miss instead of throwing — the desk must not see an error dialog for a typo.
- **Decisions the backend must preserve**:
  - Money is always `{ amount: integer minor units, currency }`. JOD has **three** decimal places; formatting is driven by an exponent table, never hardcoded to 2.
  - Membership effective status is **derived** (`deriveMembershipStatus`), with this precedence: cancelled → frozen → scheduled → expired → depleted → expiring (≤14 days) → active. The final day of a term is `expiring`, not `expired`.
  - The check-in decision engine's ordering matters: duplicate scan → member inactive → no membership → expired/scheduled/cancelled → frozen → visits depleted → wrong branch → warnings (expiring ≤7 days, outstanding balance) → allowed. A hard block never degrades into a warning.
  - `void` and `refund` are different operations: a **void** says the payment never cleared, so the charge returns to unpaid and the member owes again; a **refund** reverses the sale, so the charge is marked `refunded` and nothing is re-owed. Void is same-business-day only (Amman day, not UTC); refunds are always available. Both are additive — the original receipt is never edited.
  - Receipt numbers are allocated in sequence from the organization counter and never reused.
  - "Today" and all day boundaries are the tenant's local day (`Asia/Amman`), not UTC.
  - Reasons are mandatory and enforced server-side (not just in dialogs) for: freeze, unfreeze, extend, cancel, archive member, refund, void, check-in override, and shift close with a variance.

## Seed data

- Seed location: `apps/web/src/lib/mock/seed.ts` (deterministic — IDs and member numbers are stable across reloads, which the tests rely on).
- Reset command/action: **Demo controls** in the topbar → *Reset demo data*, or `api.resetDemo()`. A full page reload also re-seeds.
- Scenario coverage (asserted by tests in `MockGymOSApi.test.ts`): 2 branches; 80+ members; 25+ leads covering all 8 stages; active / expiring / expired / frozen / cancelled / visit-based memberships; cash, card, CliQ and bank-transfer payments with partial and outstanding balances; 30 days of check-ins plus a live "today" window; 2 cash discrepancies (a JOD 7.000 shortage pending approval and a JOD 3.500 surplus already approved); approved and unapproved discounts and refunds; automation executions including suppressed duplicates and failures; audit events across every category.
- Known inconsistencies: historical **closed** shifts compute expected cash from that day's cash payments, but only *today's* payments are linked to a shift via `shiftId`. On seeded days with no cash takings, a closed shift therefore shows `expected = opening float`. It is internally consistent, just sparse. The backend should link every payment to its shift.

## Authentication preview

- Demo credentials / role-switch mechanism: `/login` offers four personas (Omar Al-Khatib — owner, Layla Haddad — manager, Sara Abuhamdan — sales, Hala Qasem — reception). The email prefills; **any password is accepted**. Roles can also be switched live from the topbar account menu, and the branch from the topbar branch selector. Trainer and auditor roles exist in the permission matrix but have no login persona.
- Route guards currently simulated: `(app)/layout.tsx` redirects to `/login` when there is no session. Page-level permission checks render `ForbiddenState`. The mock API independently enforces permissions, so a hand-typed URL is refused by the client boundary, not just hidden.
- What the backend must replace: real credential authentication, HTTP-only session cookies, CSRF protection, rate limiting on sign-in, session revocation, and denial for deactivated users. Remove `switchDemoRole` from the production client (or leave it behind a non-production flag) and delete the persona list in `src/app/login/page.tsx`.

## Critical workflows demonstrated

1. **Member creation** — `/members/new`: validated form, live duplicate check by phone/email, warning panel listing existing matches, `member_created` timeline event, branch-prefixed member number.
2. **Membership sale / renewal** — `MembershipSaleDialog`: plan picker, price override, discount with reason and an approval warning past the role's limit, start date, payment split, and a full money summary before commit. Renewal keeps the prior term readable and links `previousMembershipId`.
3. **Check-in** — `/reception`: debounced lookup or scan, allowed / warning / blocked / overridden verdicts with plain-language reason codes, Enter to commit, Esc for the next member, occupancy and recent-check-in feed updating live, visit decrement on visit passes, duplicate-scan suppression.
4. **Payment / receipt** — `CollectPaymentDialog` shows the balance before and after; payment is idempotent by key; the receipt is numbered, printable (`@media print` isolates `#receipt-print`), and linked from the member timeline.
5. **CRM follow-up** — `LogContactDialog`: the outcome drives the stage change *and* the next follow-up date in one decision; lost outcomes require a reason and feed the lost-reason report; leads convert to members without retyping contact details and open follow-up tasks close automatically.
6. **Shift reconciliation** — open a shift with a counted float, cash collection gated on an open drawer, close with expected vs counted and a mandatory variance explanation, manager approval of the variance from either `/payments/shifts` or the audit log.
7. **Sensitive-action audit** — refund, void, freeze, extend, cancel, override, discount, and shift variance all write append-only audit events with actor, role, reason, before/after and a correlation ID, viewable with a before→after diff table.

## Tests run

- Type-check: `pnpm typecheck` — **pass**, no errors.
- Lint: `pnpm lint` (`eslint . --max-warnings 0`) — **pass**, zero errors and zero warnings.
- Unit/component tests: `pnpm test` — **162 passed** across 7 files (money, dates, permissions, membership status + check-in engine, mock API integration, the collect-payment form, the reception console's verdict states).
- Browser tests: `pnpm test:e2e` — **10 passed**, verified stable across consecutive runs (renewal → timeline, payment → receipt, check-in, unknown scan, role restrictions by nav *and* by URL, override → audit trail, RTL toggle, demo reset). Specs select by role and visible text rather than by `data-testid` wherever practical, so they survive markup churn.
- Build: `pnpm build` — **pass**, 19 routes, no warnings.

Note: `eslint-plugin-react-hooks` is pinned to `^5` because that is what `eslint-config-next@15` is written against. Version 7 enables React-Compiler-era rules that reject the standard "reset a form when its dialog opens" effect used throughout this codebase.

## Known gaps

- **Functional gaps**: CSV import/export is not built (P0 item 10 in `docs/01`, no UI was specified in `docs/02`). Trainer and auditor roles exist in the permission matrix and are selectable in settings, but have no dedicated screens or login persona. Automation rules are configured and their executions are logged, but nothing evaluates them on a timer — executions are seeded. Offers are displayed on leads and are seeded, but there is no create-offer form. Approval *requests* are surfaced and can be approved or rejected; there is no separate approvals inbox route.
- **Responsive/accessibility gaps**: the sidebar does not auto-collapse on tablet — it can be collapsed manually. Below roughly 640px the app is usable but wide tables scroll horizontally rather than reflowing into cards. The pipeline board relies on horizontal scrolling. Drag-and-drop on the pipeline is pointer-only by design; the equivalent keyboard path is the per-row **Move to** menu, which is what assistive-technology users get. Contrast, focus rings, dialog focus management, table semantics, form error wiring and `prefers-reduced-motion` are all handled.
- **Visual decisions awaiting approval**: the product name "RIVET" and the derived warm-paper palette; the dark treatment for reception (chosen so a glanceable verdict reads across a counter); using a monogram instead of member photos (the domain model has `photo reference` but the mock has no image storage).
- **Mock-only behavior**: a hard page reload re-seeds the tenant, so demonstrations of multi-step state should navigate within the app. Latency, forced failures and forced-empty lists come from `setBehavior()` via topbar **Demo controls** and must not exist in the HTTP client. Payment idempotency is simulated by an in-memory key map. Message delivery is sandbox-only — nothing is ever sent.
- **RTL caveat**: interface copy is English. Under the RTL preview, English sentences that begin with a digit are re-ordered by the bidi algorithm (for example "25 things need action today"). This is correct bidi behavior, not a layout fault, and resolves once the copy is Arabic. Numeric ratios and ranges are already isolated with `dir="ltr"`.

## Hosting on Cloudflare Pages (GitHub-connected)

The app builds to **fully static output** — no adapter, no CLI, no runtime. Connect the GitHub repo in the Cloudflare Pages dashboard and it deploys on every push, with preview deployments per branch.

| Pages setting | Value |
|---|---|
| Framework preset | Next.js (Static HTML Export) — or *None* |
| Build command | `pnpm install && pnpm --filter web build` |
| Build output directory | `apps/web/out` |
| Root directory | *(leave empty — repository root)* |
| Node version | `20` (set `NODE_VERSION=20` if Pages defaults lower) |

No environment variables and no secrets: the app runs entirely on its in-browser mock.

### Why this needed a small change

`output: "export"` requires `generateStaticParams()` on every dynamic segment, and the four detail routes are `"use client"` files, which may not export it. Each is now a two-file pair:

- `page.tsx` — a tiny server shell holding `generateStaticParams()`
- `*.client.tsx` — the original client component, unchanged in behaviour

The ids come from `src/lib/mock/prerender-ids.ts`, the single module permitted to read seed data outside the mock client. This is sound in mock mode because **the demo tenant is rebuilt from the same deterministic seed on every cold load**, so the seeded ids are exactly the set that can resolve on a fresh request. The build prerenders 320 HTML files (105 members, 164 receipts, 30 leads, 6 rules, plus the static pages).

**Known limitation:** a record created during a session gets a client-side route that works while you navigate, but a hard refresh on its URL falls through to the 404 page. That is not a regression — the mock re-seeds on reload, so such a record does not survive a refresh under any rendering strategy.

### Verified

Built with `pnpm build`, then served `apps/web/out` through a bare static file server that mimics a static host (exact file → `.html` → `dir/index.html` → `404.html`):

- All 19 route families return 200; an unknown path returns the 404 page.
- A **cold deep link** to `/members/<seeded-id>` renders the full Member 360 — timeline, stats, details — with no server involved.
- Brand assets and the favicon resolve.

### Backend agent

When `HttpGymOSApi` lands, static export is no longer the right target. Delete `src/lib/mock/prerender-ids.ts`, drop the `generateStaticParams()` shells (collapsing each pair back into one client page), and remove `output: "export"` from `next.config.mjs` in favour of a server deployment.

## File-layout history (read this if older notes disagree)

Two agents implemented parts of this frontend in the same working tree on 2026-07-30, which briefly left **two parallel implementations** of several areas. That has been reconciled: the surviving implementation is whatever `src/app/**` actually imports today, and nine superseded modules were deleted after verifying by import-graph analysis that nothing reached them.

Removed (all functionally replaced, no behaviour lost):

| Deleted | Superseded by |
|---|---|
| `features/settings/org-panels.tsx`, `people-panels.tsx`, `roles-panel.tsx` | `features/settings/settings-sections.tsx` |
| `features/automations/rule-dialog.tsx`, `triggers.ts` | `app/(app)/automations/[ruleId]/page.tsx` + `features/automations/labels.ts` |
| `features/crm/lead-drawer.tsx`, `lead-actions.tsx` | `features/crm/contact-work-panel.tsx` + `app/(app)/crm/leads/[leadId]/page.tsx` |
| `features/finance/refund-void-dialogs.tsx` | refund/void inlined in `app/(app)/payments/receipts/[receiptId]/page.tsx` |
| `components/ui/drawer.tsx` | no longer used — audit rows expand inline, queues use an inline work panel |

Two consequences worth knowing:

- **`ui/drawer.tsx` is gone.** There is no side-drawer primitive any more. If you need one, re-add it rather than assuming it exists.
- **`/payments` briefly lost its permission guard** during that overlap and was restored. Reception must get `ForbiddenState`, not a generic retry error — there is an e2e test pinning this.

Verified after cleanup: type-check, lint, 162 unit tests, 10 browser tests and a production build all pass, and an import-graph sweep reports zero unreachable modules.

## Backend integration order

1. `GET /session` plus real authentication and branch scoping — everything else depends on the acting user's permission set.
2. Reference data: `GET /settings`, `/branches`, `/membership-plans`, `/users`. These are read by nearly every dialog (payment methods, role discount limits, branch lists).
3. Members: list, get, create (with duplicate detection), update, archive, timeline, notes.
4. Memberships: list, get, sale, renewal, freeze, unfreeze, extension, cancellation — transactionally, with adjustments and audit events.
5. Finance: charges, payments (idempotent), refunds, voids, receipts. Get `void` vs `refund` semantics right before moving on.
6. Cash shifts and reconciliation, including expected cash computed from linked transaction facts.
7. Check-in: preview, create, override, recent, occupancy. Port `evaluateCheckIn` server-side and keep the ordering.
8. CRM: leads, contact attempts, tasks, conversion, renewal queue.
9. Automations (rule evaluation, deduplication, retries) and the audit log.
10. Dashboards last — they aggregate everything above.

## Files to read first

1. `apps/web/src/lib/api/GymOSApi.ts` — the contract you are implementing.
2. `apps/web/src/lib/domain/types.ts` — every shape crossing the boundary.
3. `apps/web/src/lib/domain/status.ts` — membership status derivation and the check-in decision engine, both of which must be reimplemented server-side.
4. `apps/web/src/lib/mock/MockGymOSApi.ts` — reference behavior for validation, permissions, audit writes and error codes.
5. `apps/web/src/lib/mock/MockGymOSApi.test.ts` — the behavioral contract as executable assertions; the HTTP implementation should satisfy the same expectations.
6. `apps/web/src/lib/api/client.ts` — the single place to switch implementations.
7. `apps/web/src/lib/domain/permissions.ts` — the permission catalogue to enforce server-side.

## Do not break

- **The client boundary.** No page or component may gain a `fetch` call or import seed data. Add capability to `GymOSApi`, not to pages.
- **The error envelope and its codes.** UI logic branches on `ApiError.code`; `fieldErrors` keys must match form field names for inline validation to keep working. `FORBIDDEN` and `NOT_FOUND` must stay distinguishable — they render different screens and are deliberately not retried.
- **Money as integer minor units with a currency code**, and JOD's three decimal places.
- **Derived membership status and the check-in decision ordering**, including "final day is expiring" and "a hard block never becomes a warning".
- **Void vs refund semantics**, the same-day void window measured in tenant-local time, and additive-only financial records.
- **Mandatory reasons** on every sensitive action, enforced server-side.
- **Idempotency** of `createPayment` keyed on the caller-supplied key.
- **Route paths and `data-testid` attributes** — the Playwright suite and the component tests both depend on them (`reception-search`, `checkin-verdict` with its `data-decision`, `confirm-checkin`, `override-reason`, `confirm-override`, `member-row`, `renewal-row`, `renew-button`, `confirm-payment`, `audit-row`, `queue-*`, `transaction-row`, `shift-row`).
- **Permission-gated pages render a forbidden state rather than 404 or a blank screen**, and the nav hides links purely as a nicety.
- **The reception console's keyboard contract**: autofocus on the lane, Enter commits a check-in, Escape resets for the next member.
- **`resetDemo()` and `setBehavior()`** should remain available in mock mode so the demo scenarios stay reviewable, even after the HTTP client exists.
