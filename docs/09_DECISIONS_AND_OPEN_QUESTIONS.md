# 09 — Decisions and Open Questions

## Decisions already made

- Working title is GymOS.
- B2B gym operations are the product core.
- Frontend is implemented and reviewed separately before backend integration.
- Frontend must run entirely in mock mode.
- The backend later connects through a typed client boundary.
- Initial region is Jordan/MENA.
- Arabic/RTL readiness is required.
- Multi-tenant and multi-branch are foundational.
- The MVP prioritizes members, memberships, CRM, reception, payments, reconciliation, automations, dashboards, and audit.
- Public consumer and trainer marketplaces are future phases.
- Raw biometric storage is out of scope.

## Approved architecture override — 2026-07-31

The product owner selected **Next.js + Convex + Clerk + Vercel** for the active implementation. This is the approved alternative allowed by `AGENTS.md` and supersedes the earlier FastAPI/PostgreSQL/Redis default in `docs/04` for new backend work.

- Convex owns persistence, server functions, realtime queries, file storage where needed, and scheduled/durable application work.
- Clerk owns authentication and organization identity; Convex remains authoritative for tenant data, branch scope, operational roles, permissions, and audit events.
- Vercel provides the Next.js server runtime required by Clerk's request proxy.
- The documented domain invariants, API boundary, multi-tenant isolation, money representation, audit requirements, and acceptance tests remain binding even where the implementation mechanism changes.
- The existing mock adapter remains available only as a preview/testing mode while each workflow is migrated vertically to Convex.

## Domain topology — 2026-08-04

The product owner selected one Vercel project with hostname-specific entry points for the first release:

- `rivetjo.com` redirects to `www.rivetjo.com`.
- `www.rivetjo.com` is the public landing and marketing surface.
- `app.rivetjo.com` is the member portal and future PWA surface.
- `dashboard.rivetjo.com` is the gym workspace for owners, managers, reception, and sales.
- `platform.rivetjo.com` is the canonical RIVET platform-owner console.
- `admin.rivetjo.com` is a compatibility alias that redirects to `platform.rivetjo.com`.

All of these domains currently attach to the `rivet-web` Vercel project. The Next.js request proxy maps each hostname's entry points to the existing `/customer`, gym workspace, and `/platform` route trees. Hostnames are navigation and canonical-URL boundaries only; Clerk and Convex authorization remain the security boundary.

## Deferred — Clerk production instance (2026-08-01)

The deployment at `rivet2-web.vercel.app` deliberately runs Clerk's **development** instance (`welcomed-oriole-41.clerk.accounts.dev`). This remains a conscious hold: the product domain now exists and is attached to Vercel, but a Clerk production instance still needs its own DNS setup and production credentials. A `*.vercel.app` subdomain cannot host them.

Consequences while this stands:

- A "Development mode" badge is visible on the sign-in and sign-up forms to every visitor.
- Development instances carry a user cap and rate limits, so this cannot support a real pilot.
- The first request of a cold browser session logs `Refreshing the session token resulted in an infinite redirect loop`. This is the cross-domain handshake development instances use because their cookies come from `clerk.accounts.dev` rather than the application's own domain. It retries, settles, and later navigations make no handshake requests at all. The message names key mismatch as the usual cause; the keys are correct.

To lift the hold once a domain exists, in order: point the domain at Vercel → create the Clerk production instance and add its DNS records → supply your own Google OAuth credentials, because development instances borrow Clerk's shared ones and the sign-in form offers Google → move `pk_live_`/`sk_live_`, `CLERK_FRONTEND_API_URL` and `NEXT_PUBLIC_SITE_URL` into Vercel → run `convex deploy` and set `CLERK_FRONTEND_API_URL` on the **Convex** deployment as well, since `convex/auth.config.ts` reads it there to verify Clerk JWTs and setting it only on Vercel leaves every Convex query unauthenticated.

Users do not transfer between Clerk instances; accounts created against the development instance are discarded by the switch.

## Implementation decisions agents may make

### Convex completion decisions — 2026-08-04

- `ConvexGymOSApi` is the sole production adapter. `MockGymOSApi` remains available only for explicit non-production preview/test mode; production forces Convex and fails closed when its URL or authenticated session is missing.
- Convex stores the operational model in a normalized `domainRecords` fact table plus explicit foundation, audit, idempotency, sequence, and entry-pass tables. The adapter maps those records into the existing typed `GymOSApi` contract and preserves UUID public IDs.
- Clerk subject resolution, organization membership, role permissions, branch scope, platform-admin checks, stable errors, and append-only audits are server concerns. Browser gates are usability only.
- Staff invitations use a server-only Convex action calling Clerk's invitation API. `CLERK_SECRET_KEY` is a Convex/Vercel server secret and is never sent to browser code. Invitation failures remain visible and audited.
- Customer entry passes use a 15-minute HMAC-signed token, are stored/consumed in Convex, are branch-bound, and are not the prior demo QR value. `ENTRY_PASS_SIGNING_SECRET` is Convex-only.
- Member CSV imports use a server-persisted preview followed by resumable chunks of at most 100 rows. Each chunk has an idempotency key; invalid and duplicate rows are reviewable/skipped, and preview/commit events are audited.
- Automation evaluation runs from a Convex scheduled function every 15 minutes. The default delivery mode is sandbox/log, quiet hours suppress delivery, and execution/attempt records carry daily deduplication keys and retry metadata.
- Platform billing collection and outbound messaging remain provider adapters. The MVP persists platform ledger/support records and exposes no fabricated external success.
- The final real-data release sequence is credential-gated: Clerk production/custom-domain setup and access to the selected Convex/Vercel deployments are external steps, documented in the README and handoff rather than simulated in code.

Agents may choose and document:

- Exact visual identity and navigation pattern.
- Authentication provider or local-auth implementation.
- Redis-backed worker library.
- ORM repository conventions.
- Test frameworks.
- Hosting providers.
- Shared-contract generation approach.
- Object storage provider.

Do not let these choices change the product model or acceptance criteria.

## Questions for real customer discovery

These should not block the initial build, but should be answered before a paid rollout:

1. Which access-control devices are common among target gyms?
2. Are memberships predominantly prepaid, installment-based, recurring-card, or manual-renewal?
3. Which local payment methods and receipt/tax requirements are mandatory?
4. How are freezes, discounts, and refunds currently approved?
5. What are common trainer commission models?
6. Do owners need Arabic, English, or both for staff interfaces and receipts?
7. What customer communication channels are actually used: WhatsApp, SMS, calls, email?
8. How should old member spreadsheets and fingerprint-system identifiers be imported?
9. Which reports are requested daily by gym owners?
10. What would make a gym refuse a shared consumer identity/app?

## Pilot decisions to capture later

- Pilot gym profile and branches.
- Existing plans and pricing rules.
- Required custom fields.
- Receipt numbering and tax configuration.
- Approval thresholds.
- Renewal cadence.
- Inactivity thresholds.
- Message templates and languages.
- Data-retention requirements.
- Hardware/integration requirements.

Record product decisions in this file or a dedicated ADR directory rather than burying them in code comments.

## Interim approval semantics for the MVP

Until pilot-specific thresholds are configured, the reference workflow treats a refund above JOD 25.000 as a completed, immutable financial transaction that requires post-action manager review. The review records approval or rejection for accountability; rejection never deletes or rewrites the refund. The actor must already hold `payments.refund` to issue or review it. Discounts above the actor's configured limit and cash-shift variances remain reviewable through their own permissions. Every review is an append-only record, and audit queries derive the displayed decision from that record rather than mutating the original event.

The JOD 25.000 refund-review threshold is an explicit MVP assumption, not a final policy. Replace it with a tenant setting after pilot discovery establishes the required thresholds and whether any gym needs pre-authorization instead of post-action review.
