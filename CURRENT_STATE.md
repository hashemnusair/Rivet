# GymOS / RIVET current implementation state

Updated 2026-08-12 after the functionality-first correctness and operational-email implementation pass. This is the living implementation and release-status handoff. The historical frontend-only pass is preserved separately in `FRONTEND_HANDOFF.md`.

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
- The staging release harness now includes an isolated owner-settings body that changes and restores one branch trial time with cleanup evidence. Membership lifecycle, owner settings, and the separate realtime smoke have executable bodies; nine registered product journey bodies remain credential-gated release work.
- Local verification: both TypeScript checks, Convex codegen, zero-warning lint, 77 Vitest/Convex files / 427 tests, the 41-route Production build, 24 preview Playwright journeys with 5 credential-gated journeys skipped, and `git diff --check` pass.
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
- Platform subscription state and SaaS plan limits can be updated through platform-admin mutations. Updates synchronize the public directory/tenant record when available and append immutable platform audit events. Owner/manager reports compose persisted dashboard and transaction contracts and support CSV export; automation rules can be created from the existing UI with deduplicated task/message actions.
- Platform gym detail is a typed `platform.gym.detail` projection. It resolves the selected directory record to its target organization, owner membership, branches, scoped usage aggregates, and platform audit events; provider-backed billing and storage fields remain explicit `Not configured` states rather than preview values. The unapproved health-score field is no longer part of the projection or UI.
- Provisioned gyms publish a member-facing directory listing by default; platform administrators can hide or republish a listing from the gym controls. Existing production applications still require the normal approve → provision workflow before a real gym appears in discovery.
- CRM offers preserve their historical plan/price as drafts, expose a separate manual-delivery confirmation path with channel/reference/actor facts, and advance the lead to `offer_sent` only after that confirmation. Provider-backed delivery, retries, and branded offer documents remain intentionally deferred.
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
- `pnpm test` — 340 tests passed across 51 files, including the persisted branch-transfer/discount-approval matrix and sale-dialog reason-gate coverage.
- `pnpm test:e2e` — 23 preview journeys passed; 4 credentialed staging journeys were intentionally skipped locally because the repository does not hold their trusted session state. The staging-only realtime/offline specs require the documented explicit switches and never target Production.
- `pnpm build` — passed on Next.js 16.2.12 across all App Router routes.
- `pnpm convex:codegen` — passed; no generated binding drift was produced.
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

The owner-selected modular workspace is currently a product plan, not shipped behavior. `docs/14_MODULAR_WORKSPACE_PLAN.md` defines a staged page-preference system, first-owner onboarding survey, future dashboard-block controls, and non-interactive premium placeholders. Product steering is required before implementation, especially around always-visible pages, existing-tenant rollout, dependency behavior, background automations, and future plan entitlements.

The Production Clerk instance, custom-domain DNS, Vercel environment split, Production Convex environment/deployment, Resend application mail, first platform administrator, invited-owner identity/workspace handoff, and supervised single-cash-path operating loop have been verified. TODO-006's code-shaped money/staff matrix is complete at integrated code `1f29af3`, carried by the aligned `main`/branch handoff at `d200ba5`; realistic-volume/concurrency reconciliation evidence remains under TODO-007 and must be demonstrated in staging later, not fabricated from Production. The dedicated invited-owner route and platform tenant-directory visibility fix are implemented locally; before onboarding a real gym, run the two credentialed Production invitation cases and the hidden/suspended/cancelled directory check, then complete the remaining workflow/provider coverage in the canonical backlog. The platform gym detail now shows only authorized target-scoped facts; external SaaS billing and storage remain explicit `Not configured` capabilities until their providers are integrated, and no health score is exposed without an approved model. Google sign-in is intentionally deferred and is not required for email/password accounts. This repository deploys to Vercel only from `main`, so verify the production deployment after each configuration change. Email-template polish/deliverability and live WhatsApp/SMS delivery remain provider-bound follow-ups. No unapproved marketplace, mobile, inventory, accounting, biometric, or billing surface was added.

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
