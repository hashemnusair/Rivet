# Frontend Handoff

## 2026-07-31 public, customer, and platform-admin expansion

The product owner explicitly expanded the frontend scope beyond the original B2B MVP boundary. The frontend now demonstrates the complete acquisition loop around the existing gym operations app:

- `/` — new public RIVET landing page, adapted from the supplied reference and extended with product, network, customer-portal, and pricing sections.
- `/signup` — four-step gym-owner onboarding and trial-plan selection.
- `/customer/signup` — free member account creation (name, email, mobile, password), validated with Zod and signed in on submit.
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

`/login` is the only sign-in surface. It preserves the approved split-screen RIVET design while Clerk owns the real email/password and Google identity flow. After Clerk authentication, the same page exposes a clearly labeled seeded-workspace chooser for three preview audiences:

- **Gym staff** (default) — the four role personas; signing in lands on `/dashboard`, or `/reception` for the receptionist.
- **Gym member** — the customer personas; lands on `/customer/my-gyms` or `/customer/discover`.
- **Platform administrator** — deliberately quiet, at the bottom of the page behind a small lock link; lands on `/platform`.

`/login` is the only sign-in surface, and it does not authenticate anyone itself — it chooses a portal. Each portal is a real route with its own accounts, so gym staff, members and platform administrators are never listed together:

| Route | Portal | Accounts | Lands on |
| --- | --- | --- | --- |
| `/login` | Chooser | — | one of the three below |
| `/login/gym` · `/login/gym/create` | Gym team | Owner, manager, sales, reception | `/dashboard`, or `/reception` |
| `/login/member` · `/login/member/create` | Gym member | Member accounts | `/customer/my-gyms` or `/customer/discover` |
| `/login/admin` | Platform administration | Single console entry, linked quietly from `/login` | `/platform` |

Sign-up sits beside sign-in in each portal (`…/create`, rendering Clerk's `<SignUp>`), because previously no route created a Clerk user at all — Clerk's own "Sign up" link pointed at marketing pages, so a new visitor hit a dead end. Platform administration has no self-service sign-up by design. `/customer/signup` keeps its local preview form only under `NEXT_PUBLIC_RIVET_DEMO_AUTH=1`; with a real Clerk instance it redirects to `/login/member/create` so members are never offered two different sign-up buttons.

Once Clerk reports a session, each portal shows the account actually in use with a sign-out control before offering preview accounts — otherwise there is no way to tell which identity you hold, or to switch. `ConvexClientProvider` already upserts that identity into the Convex `users` table via `users.ensureCurrent`.

Each portal renders Clerk's `<SignIn>` scoped to itself (`forceRedirectUrl` back to that portal, `signUpUrl` for that audience), then shows only that portal's accounts once identity is established. `routing="hash"` is safe now that portals own routes rather than fragments. Legacy `/login#member` and `/login#admin` links are resolved client-side by `/login`, and `/customer/login` still redirects to `/login/member`.

There is no second sign-in surface: the marketing header links to `/login` instead of opening Clerk's modal, so one page decides which portal a visitor lands in.

Route guards are consistent across all three areas. `/dashboard` and `/reception` send a signed-out visitor to `/login/gym` rather than the chooser, so the portal they were already heading for is not thrown away; `/platform` sends them to `/login/admin`; and a member's own pages (`/customer/my-gyms`, `/customer/my-gyms/[membershipId]`) now require an identity through `useMemberGate` instead of rendering an in-page prompt. The marketplace — `/customer/discover` and gym profiles — stays open to visitors, since booking a trial has to work before anyone has an account.

Playwright sets `NEXT_PUBLIC_RIVET_DEMO_AUTH=1` so browser tests exercise deterministic personas without creating external Clerk users. That flag now also short-circuits `src/proxy.ts`; leaving `clerkMiddleware()` active with no Clerk session made every request attempt a handshake it could never complete, which surfaced as `Refreshing the session token resulted in an infinite redirect loop` and stalled client-side navigation.

Because that one variable disables every identity check in the product, it is resolved through `src/lib/auth/demo-auth.ts` rather than read in six places, and it is refused when `NODE_ENV === "production"`. Verified by building with the flag set and confirming `/dashboard`, `/platform` and `/customer/my-gyms` still redirect to their portals.

A separate, harmless log line remains in local development: Clerk **development** instances serve cookies from `clerk.accounts.dev` while the app runs on `localhost`, so the first request of a cold browser session goes through a cross-domain handshake. It retries three times and Clerk's loop detector logs `Refreshing the session token resulted in an infinite redirect loop` once, then settles — subsequent navigations make zero handshake requests. The message names key mismatch as the usual cause, but the keys are fine; a production Clerk instance serves cookies from the application's own domain and does not do this.

Accounts created at `/customer/signup` are still preview-only records appended to the member chooser alongside seeded personas. Member preview sessions, created accounts, and trial bookings persist in `sessionStorage`, so a reload does not orphan the preview. Passwords entered into Clerk are handled by Clerk and are never stored by the preview. Converting the existing custom gym/member signup forms into Clerk onboarding plus Convex profile creation remains backend work.

### Connected preview behavior

- Booking a free trial at Forge Fitness calls the existing `GymOSApi` boundary, creates a lead, and moves it to `trial_booked`; gym staff can see it in `/crm/pipeline` and `/crm/queues` without a separate fake backend.
- Customer identities, memberships, marketplace gyms, and platform subscriptions live in `src/lib/public/experience-data.ts`; interactive session state is isolated in `src/lib/providers/experience-provider.tsx`.
- The QR pass encodes a demo identity. Production must replace it with a short-lived, signed, server-validated token; the UI labels this compromise explicitly.
- The public/customer/platform expansion is frontend-only. Member sessions, accounts, and trial bookings persist for the browser session; the gym operating tenant remains in memory. Real authentication, durable persistence, tenant provisioning, subscription billing, marketplace moderation, and notification delivery remain backend work.
- Backend integration has started: Convex is linked with a tenant-foundation schema, Clerk wraps the App Router, and the public header exposes Clerk sign-in/sign-up controls. The existing preview personas remain available until Clerk identities and Convex roles replace them end to end.

### Scope decision

`AGENTS.md` and the original README say not to build the future consumer marketplace in the MVP. This expansion is intentional because the product owner directly requested those surfaces on 2026-07-31. It remains an extension around the approved B2B operating core; it does not introduce an independent trainer marketplace.

### Latest verification

- `pnpm --filter web typecheck` — pass.
- `pnpm --filter web lint` — pass with zero warnings.
- `pnpm --filter web test` — 162 tests passed across 7 files.
- `pnpm --filter web test:e2e` — 13 browser journeys passed with the Clerk provider and development instance enabled.
- `pnpm --filter web build` — pass on Next.js 16; 342 routes prerendered and the Clerk request proxy detected.
- `qrcode.react` was added for the membership entry pass.
- `public/brand/rivet-social-preview.png` is a generated, project-local social preview asset used by Open Graph and Twitter metadata.

## Status

- Completion date: 2026-07-31
- Frontend branch: `main` (see git log for the latest handoff commit).
- Full development command: `pnpm install && pnpm dev:full` from the repository root (syncs Convex and starts `apps/web` on <http://localhost:3000>)
- Build command: `pnpm build`
- Test command: `pnpm test` (unit + component), `pnpm test:e2e` (Playwright)

Product name in the UI is **RIVET** (working title GymOS), derived from the logo in the repository root.

## Implemented routes

| Route | Purpose | Primary roles | Status |
|---|---|---|---|
| `/login` | Branded Clerk sign-in, followed by a clearly labeled seeded workspace chooser | all | Integration in progress |
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

## Authentication transition

- Clerk is the sole real credential/session layer. `/login` embeds Clerk inside the approved RIVET login shell; a user does not enter a second password.
- After authentication, the temporary chooser offers four seeded staff personas (Omar Al-Khatib — owner, Layla Haddad — manager, Sara Abuhamdan — sales, Hala Qasem — reception), seeded members, and a platform preview. These cards select mock data only and explicitly do not grant a Clerk account a real role. Roles can still be switched from the demo topbar.
- `(app)/layout.tsx` and the platform shell require the Clerk session in addition to the preview session. Page-level permission checks and the mock API continue to enforce the selected preview role so hand-typed URLs are refused, not merely hidden in navigation.
- Next backend step: replace the chooser with a Convex query for the authenticated user's platform role and organization memberships, then automatically route platform admins, gym staff, and customers. Remove `switchDemoRole` from production after those vertical workflows use persisted data.

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
- Browser tests: `pnpm test:e2e` — **13 passed** (renewal → timeline, runtime payment → printable receipt, check-in, unknown scan, role restrictions by nav *and* by URL, override → audit trail, RTL toggle, demo reset, member registration persistence, customer trial → gym CRM, and platform-admin guarding). Specs select by role and visible text rather than by `data-testid` wherever practical, so they survive markup churn.
- Build: `pnpm build` — **pass** on Next.js 16, 342 prerendered routes plus the Clerk request proxy.

Note: Next.js 16 enables React Compiler advisory lint rules. Rivet is not enabling the compiler during authentication integration, so compiler-only advisories are disabled while the established React 19 behavior remains covered by tests.

## Known gaps

- **Accepted frontend deferrals**: CSV import/export, a create-offer form, a dedicated approvals inbox, and dedicated trainer/auditor workspaces are not part of the approved frontend handoff. The underlying permission roles and relevant records remain represented so these can be added without redesigning the operating core. Automation scheduling is backend work; the frontend already covers rule configuration and execution history.
- **Responsive/accessibility gaps**: the sidebar does not auto-collapse on tablet — it can be collapsed manually. Below roughly 640px the app is usable but wide tables scroll horizontally rather than reflowing into cards. The pipeline board relies on horizontal scrolling. Drag-and-drop on the pipeline is pointer-only by design; the equivalent keyboard path is the per-row **Move to** menu, which is what assistive-technology users get. Contrast, focus rings, dialog focus management, table semantics, form error wiring and `prefers-reduced-motion` are all handled.
- **Visual decisions awaiting approval**: the product name "RIVET" and the derived warm-paper palette; the dark treatment for reception (chosen so a glanceable verdict reads across a counter); using a monogram instead of member photos (the domain model has `photo reference` but the mock has no image storage).
- **Mock-only behavior**: a hard page reload re-seeds the gym tenant, so gym-side multi-step demonstrations should navigate within the app. Member sessions, registered accounts, and trial bookings survive reloads in `sessionStorage`. Clerk is mounted but has not yet replaced the three preview session providers. Runtime receipts use `/payments/receipts/view#<id>` and work during the active mock session; reloading a newly created receipt still loses its in-memory payment record. Latency, forced failures and forced-empty lists come from `setBehavior()` via topbar **Demo controls** and must not exist in the production client. Payment idempotency is simulated by an in-memory key map. Message delivery is sandbox-only — nothing is ever sent.
- **RTL caveat**: interface copy is English. Under the RTL preview, English sentences that begin with a digit are re-ordered by the bidi algorithm (for example "25 things need action today"). This is correct bidi behavior, not a layout fault, and resolves once the copy is Arabic. Numeric ratios and ranges are already isolated with `dir="ltr"`.

## Hosting with Clerk and Convex

Clerk's `src/proxy.ts` requires a Next.js server runtime, so `output: "export"` has been removed. The project should now deploy to Vercel or another Next.js 16 server host rather than the previous bare Cloudflare Pages static-output configuration.

Production will require `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOY_KEY`, and `NEXT_PUBLIC_SITE_URL`. Keep `apps/web/.env.example` value-free and store real values only in local/deployment environment settings.

The old `generateStaticParams()` shells and mock prerender IDs remain temporarily so the approved seeded deep links continue to build during the incremental data migration. Remove them as each detail route becomes backed by persisted Convex identifiers.

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
