# 16 — Five-Pillar Gym Operating System Expansion Plan

Status: **All five implementation slices are locally validated on `main` at `1e01163`; the renewal opt-in Production deploy, count-only audit, signed-in Production checks, and credentialed staging journey remain open**
Last reviewed: **2026-08-20**

## Purpose

RIVET is expanding from a CRM and collection workflow into the operating
system for a gym. The approved expansion is deliberately limited to five
connected pillars:

1. Shared platform foundation: organization branding, tier entitlements,
   branches and zones, consent, and typed operational events.
2. Revenue protection: membership renewal messages at 14, 7, and 3 days
   remaining, followed by a staff call task one day before expiry.
3. Daily operations: inventory and supplier workflows, cleaning/facilities,
   and equipment/work orders.
4. Accounting foundation: an immutable management-accounting ledger for
   purchasing, expenses, inventory, and assets.
5. Management reporting: trustworthy balance sheet, income statement, and
   cashflow statement, with analysis that can be traced to source records.

This file is the current expansion plan. It does not replace the historical
frontend handoff, does not claim that any unimplemented feature is complete,
and does not replace `CURRENT_STATE.md`, which remains the evidence and release
status handoff. Existing documents such as the domain model, API contract,
security guide, workspace-preference plan, and release runbook remain binding
where this plan does not explicitly extend them.

## Current release evidence — 20 August 2026

- The Five Pillars application/release commit `1e01163d25cc6f9123001329877a45e33e5670ea` is on `main` and `origin/main`; this plan refresh is a subsequent direct-main documentation commit. It includes the five-pillar implementation, renewal safety change, and release evidence; `FRONTEND_HANDOFF.md` is unchanged and `arabic-localisation` remains unmerged.
- GitHub Actions run `32391568593` passed for the exact commit. Vercel Production is `READY` for the matching application deployment (`ER5WksGThgB9BiBupZNZAxUsig85`). The 46-route build includes `/operations`, `/finance`, and `/reports/statements`.
- The intended Convex Production target is `descriptive-meerkat-589`. The available local deployment context targets Development `fleet-otter-621`; its required guarded dry run passed schema validation with no deleted indexes. Because the target was Development, no Production deploy was run and the renewal safety gate is not yet confirmed in Production.
- Renewal recovery is off by default, treats missing legacy values as false, and does not create delivery/events/timeline/staff-task facts while disabled. An authorized settings user can explicitly enable the journey; external WhatsApp/SMS remains sandboxed.
- The internal `renewalJobs.releaseAudit` query is aggregate-only and locally tested. It is intended for authenticated read-only release auditing after the Production deploy; it has not been deployed or run against Production in this pass.
- No authenticated Production GymOS or Convex dashboard session was available. Production route/settings/report visual checks, Production renewal counts, and the isolated staging accounting journey therefore remain unverified.

This plan records implementation status and release evidence; it does not close the unresolved commercial, provider, accounting-policy, Arabic, performance, or future-feature decisions below.

## Product thesis

Every operational signal should produce an accountable action and, when money
is involved, an auditable financial consequence:

```text
Operational event → context/rule → recommendation or task → responsible action
                  → member/branch timeline + audit → source transaction/ledger
                  → management report
```

The five pillars share one organization/branch model and one event vocabulary.
They must not become disconnected modules with competing member, supplier,
asset, or financial histories.

Traffic is an operational signal in this plan. Existing check-ins and
privacy-safe aggregate occupancy may adjust cleaning priority, stock alerts, or
maintenance urgency. Traffic is not permission to infer a person's age,
health, identity, or other sensitive trait, and it is not a commitment to build
music or advertising features.

## Repository and architecture constraints

The repository has an approved architecture override. New work follows these
constraints rather than the earlier FastAPI/PostgreSQL/Redis direction:

- **Runtime:** Next.js App Router, TypeScript, Convex, Clerk, and Vercel.
  Clerk authenticates the person. Convex owns tenant data, branch scope,
  operational roles, permissions, business rules, persistence, realtime
  queries, scheduled/durable application work, and audit facts.
- **Typed boundary:** All page-facing reads and writes go through
  `GymOSApi`. `ConvexGymOSApi` is the production adapter and
  `MockGymOSApi` is an explicit preview/test adapter. Product pages do not
  import Convex operations as a shortcut.
- **Contract conventions:** Use UUID strings, ISO 8601 UTC timestamps,
  `camelCase` at the client boundary, the documented error envelope, and
  integer minor-unit money plus an ISO currency code. JOD and other currencies
  must use their configured currency exponent; no floating-point money math.
- **Domain modeling:** Use a dedicated typed Convex table when a record has
  stable fields, lifecycle, authorization, indexes, or financial meaning.
  `domainRecords` may carry genuinely generic, append-only operational or
  timeline events where its existing contract is appropriate; it must not be a
  shortcut for zones, inventory, products, stock movements, suppliers,
  facilities, equipment, work orders, accounting journals/lines, fixed assets,
  or report periods. Those domains need typed tables and typed API methods.
- **Server authorization:** Resolve organization context from the authenticated
  Clerk/Convex identity and active membership. Scope every query and mutation
  to the organization and independently to the actor's branch scope. UI
  hiding, subscription tier, or workspace preference never authorizes an
  action. Foreign-tenant and out-of-scope identifiers must not disclose record
  existence.
- **Audit and idempotency:** Sensitive changes and all money-changing or
  externally retried operations require an immutable audit event, actor,
  organization, branch where applicable, reason where required, before/after
  summary, request/correlation ID, and an idempotency key or deduplication key.
  Replaying a request must not create a second payment, message, stock
  movement, journal posting, task, or notification.
- **Mock parity:** Every production-facing `GymOSApi` capability added here
  must have the same meaningful result and error behavior in the mock adapter.
  Mock mode may use deterministic fixtures, but it may not invent a contract
  that Convex cannot provide.
- **Additive releases:** Add optional fields, new typed tables, indexes,
  versioned contracts, and feature gates before switching reads or writes.
  Preserve existing membership, payment, receipt, refund, void, shift, and
  audit facts. Archive or disable records through audited operations; do not
  rewrite history to fit a new projection.
- **Provider safety:** This plan names provider boundaries, not credentials.
  No provider key, live delivery switch, payment credential, supplier account,
  or statutory filing integration is assumed. Provider-backed work remains
  sandboxed or disabled until separately approved and verified.
- **Accounting disclaimer:** The first accounting release is a management
  accounting and operational-control system. It is not a claim of statutory,
  tax, audit, e-invoicing, or country-specific compliance. Local accounting
  policy, chart of accounts, tax treatment, period closing, and any filing
  obligations require explicit owner/accountant decisions before they are
  presented as compliant.

## Entitlements, workspace preferences, and permissions

These are three different controls and must remain separate:

| Control | Owner | Question answered | Can it authorize a write? |
| --- | --- | --- | --- |
| Tier entitlement | RIVET platform/subscription contract | Is this capability or limit included in the subscribed tier? | No, not by itself |
| Workspace preference | Gym owner organization setting | Should an included page/module appear in this workspace? | No |
| Role and branch permission | Convex organization membership and access policy | May this actor perform this action for this branch? | Yes, when the server grants it |

The effective product surface is the intersection of entitlement, owner-selected
workspace, and server-enforced role/branch permission. A locked feature may be
hidden or shown as a truthful premium state, but a hidden button is never an
authorization boundary. Downgrading a tier must preserve historical data;
module records may become read-only or unavailable while the subscription is
not entitled.

### Provisional server-owned capability default

The server-owned catalog now encodes the following provisional capability
default for implementation and authorization wiring:

| Tier | Included capability default |
| --- | --- |
| Starter | Foundation and revenue-protection capabilities |
| Growth | Starter plus daily operations (inventory/suppliers, cleaning/facilities, and equipment/work orders) |
| Pro | Growth plus the accounting ledger and management financial reporting |

This is a capability default for the current implementation, not a pricing
table, usage-limit definition, trial/downgrade policy, or final commercial
approval. The final tier matrix still requires product and owner steering.

Existing Payments and basic Reports are foundation routes and must remain
available according to their existing role/branch permissions; they are not
retroactively premium-locked. Only the new `/finance` and
`/reports/statements` surfaces are premium-gated by the Pro capability in this
expansion. Premium gating still cannot bypass server authorization, and a
workspace preference cannot unlock an unentitled surface.

## Pillar 1 — Shared platform foundation

### Scope

Build the primitives that the other four pillars can safely share:

- Organization-level Brand Kit for the authenticated gym workspace: approved
  logo reference, curated palette or validated primary color, derived semantic
  tokens, version, and update metadata. Staff-shell branding is separate from
  the public gym-profile accent and media.
- Multi-branch physical-space model with a dedicated typed `zones` table. A
  zone belongs to one branch and organization and has an immutable public ID,
  normalized unique-within-branch code, name (and optional Arabic name),
  code-owned kind, optional capacity, active/archive status, and timestamps.
  Branch capacity remains an aggregate fallback until usage workflows consume
  zones.
- Server-owned tier entitlement primitives and capability/limit checks. The
  provisional capability default is allowed in this slice, but pricing,
  commercial limits, checkout, and final tier approval remain out of scope.
- Consent and communication-preference history for marketing versus service
  purposes and email/SMS/WhatsApp channels. An opt-out must suppress the
  applicable marketing action at the shared outbound boundary. A system
  default is not evidence that a member actively gave consent.
- A typed operational-event envelope that can feed member/branch timelines,
  automation, audit, and later ledger posting without forcing every event into
  a generic table. Include event type/version, organization and optional
  branch, actor/source, occurred time, entity reference, correlation ID,
  idempotency/deduplication key where relevant, and a concise payload or
  before/after summary according to the event's sensitivity.

### Foundation invariants

- A brand asset, zone, consent record, or event cannot cross an organization;
  a branch-scoped record cannot cross its branch scope.
- Brand colors are server-validated and mapped to a small semantic token set
  with contrast checks. Do not store CSS, arbitrary Tailwind class names,
  gradients, or style text in tenant data.
- Zones are soft-archived, not deleted when operational history references
  them. Duplicate active codes within a branch are rejected.
- Consent history is append-only or versioned. Current status is easy to read,
  but withdrawal and provenance remain auditable.
- Entitlement checks, workspace preferences, and permissions are independently
  testable and independently enforced.
- Event replay is safe. A repeated idempotency key returns the original result
  or a stable duplicate response.

### Delivery shape

Add typed schema and `GymOSApi` contracts first, then Convex authorization and
audits, then the mock adapter, then settings/onboarding UI and staff-shell
theme application. Existing tenants receive a neutral/default brand without
manufactured media. A default `Main` zone may be provisioned only if the
product accepts the operational meaning; otherwise the absence of a zone must
be explicit rather than fabricated.

## Pillar 2 — Revenue protection and renewal recovery

### Approved member journey

For an active membership with an end date, evaluate the configured local-time
renewal schedule:

1. **14 days remaining:** queue the first approved WhatsApp or SMS reminder
   when the member's channel and purpose preferences allow it.
2. **7 days remaining:** queue the next reminder only if the membership is
   still unresolved and the prior threshold has not already produced an
   equivalent action.
3. **3 days remaining:** queue the final automated reminder, with an approved
   offer only when a gym policy and staff permission allow that offer.
4. **1 day remaining:** create a salesperson/staff call task. This is a task
   for a human call, not an invented automated call provider.

The journey stops or changes state when the membership renews, is cancelled or
frozen under an applicable policy, the member opts out of the relevant channel,
the member responds or requests no contact, a manager suppresses the journey,
or a prior action is already resolved. Quiet hours, language, frequency caps,
channel fallback, and offer limits must be tenant-configurable within safe
server bounds.

### Required records and behavior

- A typed renewal schedule/action record links organization, branch, member,
  membership term, threshold, channel/action, template version, consent
  decision, status, attempt timestamps, and responsible staff task where
  applicable.
- A call task has an owner or queue, due time, reason, branch, status, contact
  outcome, and follow-up action. Completing it creates a member timeline event.
- Every attempt is deduplicated by membership term, threshold, action/channel,
  and template/policy version. Retries do not send duplicates.
- The renewal queue is truthful about `queued`, `sandboxed`, `sent`,
  `failed`, `suppressed`, `cancelled`, and `completed`; absent provider
  configuration is not shown as sent.
- Renewal, suppression, opt-out, response, task completion, and offer changes
  are visible in the member timeline and sensitive actions are audited.

The existing typed automations and marketing-preference boundary should be
extended vertically. Do not create a second messaging or consent system for
renewals.

## Pillar 3 — Daily operations

Daily operations has three connected workstreams. They share branches, zones,
staff permissions, traffic context, audit, and source transactions, but each
gets typed records and a focused queue.

### Inventory and suppliers

In scope:

- Product/SKU records, branch stock, units, reorder point, target level,
  supplier lead time, optional batch/expiry data, and active/archive state.
- Immutable stock movements for receiving, sale/consumption, adjustment,
  return, transfer, and waste; every adjustment has a reason and actor.
- Supplier directory records with contacts, preferred products, terms/lead
  time, and branch relationship.
- Low-stock and projected-stock alerts based on stock on hand, committed stock,
  recent velocity, and lead time. A manager can review, dismiss, or create a
  purchase request/order.
- Purchase request, approval, order, receiving, supplier invoice reference,
  and discrepancy workflow. Product sales and purchases must be available to
  the accounting posting layer.

Automatic supplier notification is an opt-in action through an approved
provider boundary and remains auditable. The committed scope includes a gym's
own supplier records and notification workflow; it does not include a
supplier marketplace, supplier discovery network, supplier self-service
portal, or cross-gym catalog.

### Cleaning and facilities

In scope:

- Branch zones and facility checklist templates for bathrooms, locker rooms,
  reception, studios, weights, cardio, and other owner-configured areas.
- Scheduled inspections, cleaner tasks, incident reports, severity, photos or
  notes subject to the existing media/privacy rules, response SLA, resolution,
  and manager escalation.
- Aggregate occupancy/check-in context may increase inspection frequency or
  task priority. It must not be used to infer demographic identity.
- Supplies used, vendor expenses, and cleaning/repair work can link to source
  transactions and the accounting ledger. A task cannot silently create a
  financial entry without a documented source and posting state.

The first release should work on a phone with a keyboard-accessible checklist,
clear empty/error/offline states, and explicit branch/zone scope. Sensor,
camera, smart-lock, or hardware integrations are not prerequisites.

### Equipment and work orders

In scope:

- A typed equipment/asset record with a gym code or QR label, branch and zone,
  manufacturer/model/serial where known, purchase and installation dates,
  purchase cost/currency, warranty, status, and expected service interval.
- Issue reports, maintenance history, work orders, parts/labor cost, downtime,
  severity, assignee/vendor, resolution, and issue count.
- A transparent fix-versus-replace recommendation using recorded repair cost,
  downtime, safety status, age/useful-life assumption, and replacement
  estimate. The recommendation is decision support, not an autonomous
  purchase.
- Approval and audit for repair commitments, replacement decisions, and asset
  status changes. Approved acquisition, repair, depreciation policy, and cash
  movement link to accounting source records.

No recommendation may imply safety certification or a guaranteed economic
return. Missing cost, usage, or warranty data must be shown as unavailable,
not estimated from unrelated records.

## Pillar 4 — Immutable management-accounting ledger

### Goal and boundary

Create a durable, append-only accounting foundation that can explain where
money came from, where it went, and how inventory and assets changed. This is a
management-accounting control plane for the gym; it is not a claim of statutory
or tax compliance.

The ledger should be introduced after the operational source records are
typed, but it must preserve the existing payment, receipt, refund, void, cash
shift, and reconciliation contracts rather than replacing them with an
unverified projection.

### Initial capabilities

- Organization/branch chart of accounts and account types, with a code-owned
  minimum catalog until tenant accounting policy is approved.
- Append-only journal entries and journal lines with integer minor-unit debit
  and credit amounts, ISO currency, source record, posting date, period,
  branch, actor/source, correlation ID, and status.
- Balanced journal validation: total debits equal total credits per entry;
  zero-value and unsupported-currency postings are rejected.
- Purchasing and supplier invoice obligations, operating expenses, inventory
  receipts and cost of goods sold, stock adjustments, equipment acquisition,
  repair expense, and fixed-asset records with policy-driven depreciation
  support.
- Cash/bank movement and reconciliation links to the existing payment and
  cash-shift facts. A payment is not duplicated because a journal projection is
  created.
- Corrections through reversing or adjusting entries that reference the
  original. Posted journal lines and source financial facts are never edited or
  deleted through the application.
- Idempotent posting commands and a posting status that distinguishes pending,
  posted, failed, reversed, and intentionally excluded records.

Do not invent historical transactions to make a report balance. Historical
records may be imported or backfilled only from a documented source with an
explicit opening-balance or migration decision. Unknown values remain
unposted and visible as a completeness warning.

### Accounting invariants

- Every posted entry balances and is scoped to one organization; branch
  attribution is explicit or intentionally consolidated according to policy.
- A source transaction has at most one successful posting for a given posting
  policy/version and idempotency key.
- Posted entries are immutable. Reversal and adjustment entries preserve the
  original amount, reason, actor, and linkage.
- Inventory valuation, COGS, asset capitalization, depreciation, repair
  expense, and cash classification use declared policies. The system must show
  the policy/version used by a report.
- A failed posting is never represented as posted revenue, expense, asset, or
  cash. Retry behavior is explicit and safe.
- Accounting access is role/branch protected, with stronger permission for
  posting, period close, adjustments, and report configuration than for
  read-only viewing.

## Pillar 5 — Trustworthy management reporting

### Statements and analysis

The management workspace should provide, by date range and branch or
consolidated organization view:

- **Income statement:** revenue, discounts/returns where applicable, cost of
  goods sold, operating expenses, depreciation according to the approved
  policy, and net income for the period.
- **Balance sheet:** cash/bank, receivables, inventory, fixed assets net of
  accumulated depreciation, liabilities represented by recorded source
  obligations, and equity/opening balances according to the approved chart of
  accounts.
- **Cashflow statement:** operating, investing, and financing movements based
  on posted cash classifications, with an explicit reconciliation to opening
  and closing cash where the data supports it.
- **General-manager analysis:** revenue and renewal recovery, collection and
  outstanding balances, branch comparison, stockout/slow-stock signals,
  supplier commitments, cleaning cost, equipment downtime/repair cost, and
  cash variance. Every metric drills to source records or shows `Not
  configured`, `Not available`, or a completeness warning.

### Reporting invariants

- Reports read posted, authorized ledger projections and documented operational
  aggregates. They do not calculate financial truth from UI cards or mock
  fixtures in production.
- Debit/credit totals, statement subtotals, closing cash, inventory balances,
  and source-to-ledger counts have reconciliation checks.
- A report displays period, timezone, currency, branch scope, generated-at time,
  posting-policy version, and whether pending/failed/unposted records exist.
- Branch consolidation never silently double-counts shared or transferred
  records. A member, supplier, asset, payment, and journal line has one
  authoritative owner and explicit branch semantics.
- Historical report output is reproducible for a closed period from immutable
  entries and policy/version metadata. Corrections appear in the period and
  audit trail chosen by the approved accounting policy.
- Report consumers see the management-accounting disclaimer until local review
  approves any stronger claim.

## Vertical delivery slices

Each slice is complete only when its Convex schema/domain logic, typed
`GymOSApi` methods, `ConvexGymOSApi`, `MockGymOSApi`, authorization/audit tests,
loading/error/empty UI states, and release notes are aligned. A slice may be
feature-gated for selected disposable tenants while the underlying additive
schema is deployed.

### Slice A — Foundation contracts and tenant safety

- Add versioned organization Brand Kit, zone, entitlement, consent, and event
  contracts with non-destructive optional fields/tables and indexes.
- Add server-owned read/write boundaries, tenant/branch/role checks, audits,
  idempotency behavior, and mock parity.
- Add owner Brand Kit settings and zone management with English/Arabic and LTR/
  RTL accessibility coverage.
- Add one shared capability resolver that distinguishes entitlement,
  workspace preference, and permission; keep the provisional catalog separate
  from pricing, commercial limits, checkout, and final tier approval.

Exit evidence: owner success, manager/staff denial, cross-tenant and
cross-branch denial, duplicate zone rejection, valid/invalid brand tokens,
consent opt-out behavior, audit before/after facts, and repeated-save
idempotency all pass in Convex and mock mode.

### Slice B — Renewal recovery

- Add threshold evaluation at 14/7/3 days and a one-day call task.
- Add channel/purpose consent, quiet-hour/language/template policy,
  deduplication, suppression, delivery-state projection, and timeline/audit.
- Add renewal queue/call-task UI and owner/manager policy controls without
  exposing provider credentials.

Exit evidence: a disposable membership produces each threshold once, renewal
suppresses later actions, opt-out suppresses the applicable channel, retries do
not duplicate, and absent/sandbox providers are represented truthfully.

### Slice C — Inventory and supplier operations

- Add typed products, suppliers, stock, movements, reorder rules, purchase
  requests/orders, receiving, and discrepancy handling.
- Add branch inventory views, low-stock recommendations, and audited approval.
- Add an optional notification adapter for the gym's configured supplier
  contact; keep marketplace/portal routes absent.

Exit evidence: stock movement totals are deterministic, duplicate receiving is
rejected or replay-safe, low-stock alerts deduplicate, branch scope holds, and
the mock and Convex adapters agree on results and errors.

### Slice D — Cleaning and facilities

- Add zone checklists, incidents, cleaner tasks, severity/SLA/escalation,
  occupancy-aware prioritization, supplies, and resolution history.
- Add a mobile-first task surface with retry/offline-safe behavior where
  supported by the existing realtime seam.
- Link approved supplies/vendor expenses to a source transaction without
  posting accounting entries before the ledger slice is available.

Exit evidence: high occupancy can change priority without demographic data,
severe incidents escalate, branch/zone permissions hold, and task completion
is visible in timeline/audit with no fabricated expense.

### Slice E — Equipment and work orders

- Add coded equipment/assets, issue reports, maintenance/work orders, vendor or
  staff assignment, cost/downtime history, and fix/replace decision records.
- Add transparent recommendation inputs and manager approval. Preserve asset
  and work-order history when equipment is archived or replaced.

Exit evidence: equipment code is unique in its organization or branch policy,
issue count/cost/downtime trace to records, unauthorized replacement/price
changes fail, and missing inputs produce an explicit unavailable state.

### Slice F — Accounting ledger and source postings

- Add typed chart of accounts, journals/lines, posting policies, periods,
  source links, reversals/adjustments, idempotency, and reconciliation checks.
- Post new approved purchasing, expenses, inventory movements, equipment
  acquisition/repair, and existing payment/shift facts according to declared
  policies.
- Add accounting roles, branch scope, manager approval, and period safeguards.

Exit evidence: every posted entry balances, replay is safe, source-to-ledger
links are complete for the enabled transaction classes, reversals preserve
history, and unconfigured policy data is not silently posted.

### Slice G — Statements and management analysis

- Add balance sheet, income statement, and cashflow projections with branch and
  consolidated scopes, report metadata, drill-down, warnings, and disclaimer.
- Add GM operational analysis only for metrics with authoritative sources.
- Add export/read-only views only after reconciliation and permission tests
  pass; do not present estimates as financial facts.

Exit evidence: statement equation and cash reconciliation checks pass for
fixture and isolated staging data; report scopes are authorized; every displayed
amount drills to a source or an explicit unavailable/completeness state.

## Cross-cutting invariants and acceptance rules

1. **Tenant isolation:** no operation reads or mutates a foreign organization;
   branch scope is checked separately from organization membership.
2. **Least privilege:** role, branch, and action permissions are enforced in
   Convex for reads and writes. Owner-only settings, manager approvals, and
   accounting posting/close actions cannot be reached by URL or forged input.
3. **Immutable history:** member timeline facts, sensitive audit events,
   payment/receipt/refund/void/shift facts, stock movements, work-order history,
   and posted journal entries are append-only or safely archived.
4. **Money safety:** all amounts are integer minor units with currency; no
   floating-point arithmetic, hidden conversion, invented proration, or
   implicit tax treatment.
5. **Idempotent retries:** duplicate requests, scheduler ticks, webhooks,
   delivery retries, receiving retries, and journal retries cannot duplicate
   business effects.
6. **Consent safety:** explicit channel/purpose opt-out suppresses matching
   marketing actions; service notifications remain separately classified and
   are not silently represented as marketing consent.
7. **Honest state:** missing provider configuration, missing accounting policy,
   unavailable historical data, pending postings, and failed actions are shown
   as such. No seed/demo value is used as a production fact.
8. **Traceability:** an action can be followed from source event to responsible
   task, timeline/audit record, source transaction, ledger posting, and report
   amount when applicable.
9. **RTL and accessibility:** use logical layout properties, localized names
   and alt text, keyboard/focus support, contrast-safe semantic tokens, and
   `dir="rtl"` tests. Color is never the only status cue.
10. **Data lifecycle:** archiving a zone, supplier, product, facility, or asset
    does not erase records required to explain past operations or statements.

## Test matrix

| Area | Unit/domain coverage | Convex authorization and persistence | Adapter/UI/release coverage |
| --- | --- | --- | --- |
| Foundation | Brand token/contrast, zone validation, entitlement resolver, consent state machine, event envelope, idempotency helpers | Owner/manager/staff permissions; asset reference ownership; org/branch isolation; immutable audit; provisioning defaults | `GymOSApi`/Convex/mock contract parity; Brand Kit/zones settings; LTR/RTL, keyboard, focus, mobile; additive migration rehearsal |
| Renewals | Exact 14/7/3/1 thresholds, date/timezone boundaries, dedupe, suppression, retry/quiet hours, language/template choice | Membership ownership, branch scope, opt-out enforcement, task assignment, audit/timeline, renewal-stop race | Renewal queue and call task browser journey; sandbox/absent-provider states; two-browser or realtime update where applicable |
| Inventory/suppliers | Stock arithmetic, reorder formula, movements, receiving idempotency, batch/expiry rules, notification dedupe | Product/supplier/stock branch isolation; approval and adjustment reasons; no marketplace access | Inventory and purchase request UI; mock parity; disposable staging low-stock/reorder/receiving cleanup |
| Cleaning/facilities | Checklist completion, severity/SLA/escalation, occupancy priority, offline/retry behavior | Zone/branch assignment, cleaner versus manager actions, incident media ownership, audit | Mobile checklist, empty/error/retry, RTL; staging incident → task → resolution path |
| Equipment/work orders | Code uniqueness, issue/cost/downtime totals, recommendation explainability, archive behavior | Asset/work-order branch scope, approval/price/repair permissions, immutable history | Equipment detail/work-order UI; recommendation missing-data state; staging repair/replace path |
| Ledger | Balanced entries, account validation, currency exponent, posting policies, reversal/adjustment, reconciliation, idempotent post | Posting/close/adjustment permissions; source ownership; period safeguards; audit | Convex/mock financial contract tests; source-to-ledger browser journey; migration backfill fixture with no invented facts |
| Statements | P&L, balance equation, cashflow classification, branch consolidation, drill-down, report reproducibility | Report scope and restricted account visibility; pending/failed data warnings | Report UI/export read path; fixture and isolated staging tie-outs; no fabricated values in production-shaped test |
| Release/security | Schema compatibility, feature gates, rollback/read-only behavior, no secret leakage | Production target classification, deployment authorization, no cross-tenant leakage | `pnpm` quality gate, `git diff --check`, exact-target Convex dry run/deploy, supervised read-only observation before writes |

Every new handler needs at least an allow case, insufficient-permission case,
out-of-scope branch case, cross-tenant case where meaningful, malformed-input
case, and idempotent replay case. Money-changing handlers additionally need
partial/duplicate/concurrent/reversal coverage as applicable.

## Migration and release order

The release sequence is additive and reversible at the feature-surface level:

1. **Baseline and contract freeze:** verify the current `main` baseline,
   inspect `CURRENT_STATE.md`, run the existing quality gate, and version the
   new API/domain contracts. Do not mix expansion work with unrelated visual
   redesign.
2. **Schema-first foundation:** add optional Brand Kit fields or a typed
   organization-brand projection, zones, entitlement primitives, consent
   history, and event indexes. Deploy with reads/writes gated off for existing
   tenants.
3. **Neutral backfill:** give existing organizations a neutral/default brand,
   preserve existing public-profile accent/media, and backfill only facts that
   can be proven from source records. Do not manufacture logos, zones,
   inventory, expenses, assets, opening balances, or journal entries.
4. **Foundation activation:** enable Brand Kit, zones, consent, event, and
   entitlement checks for one disposable or pilot tenant; verify owner setup,
   role denial, branch isolation, mock parity, and audit/replay behavior.
5. **Revenue release:** enable renewal actions for an explicitly selected
   cohort. Start with sandbox/provider-disabled delivery, then separately
   approve real channels, templates, quiet hours, and provider configuration.
   Verify renewal suppression before any live delivery.
6. **Operations releases:** activate inventory/supplier, cleaning/facilities,
   and equipment/work-order slices in dependency order. Keep recommendations
   and purchase requests manager-approved while data quality and cost policy
   are observed.
7. **Ledger activation:** deploy chart/accounts, journals, posting policies,
   and reconciliation checks. Post new supported source events first. Add
   historical openings only after an explicit source and accounting-policy
   decision; never silently infer history.
8. **Reporting activation:** expose statements only for supported posted data,
   with branch scope, completeness warnings, drill-down, policy metadata, and
   the management-accounting disclaimer. Compare report totals to controlled
   fixtures and isolated staging before a real-gym pilot.
9. **Expansion of cohort:** after release evidence is recorded, widen the
   feature gate. Keep a kill switch for outbound delivery and an operational
   read-only mode for new writes; never use a rollback that deletes records.

Use the repository's approved `pnpm convex:deploy` workflow for Convex deploys
and the existing release runbook for target verification. Do not print secret
values, use raw secret-bearing diagnostics, seed a Production tenant, or run a
destructive schema operation to force a migration through.

## Open decisions

These decisions must be recorded before the affected slice is treated as
production-ready:

1. The server catalog currently uses the provisional Starter foundation/revenue,
   Growth operations, and Pro finance/reporting default described above. What
   final capabilities, limits, trials, grandfathering, downgrade behavior, and
   read-only behavior should replace or confirm it? Which limits are enforced
   by count, branch, volume, or role, while keeping existing Payments/basic
   Reports foundation routes unlocked and only gating the new premium surfaces?
2. Is Brand Kit limited to approved palette presets and one logo, or may an
   owner supply a validated primary color? What are the authorized asset types,
   white-label rules, and public-profile/staff-shell boundaries?
3. Is a default `Main` zone provisioned for every branch, and which zone kinds,
   Arabic fields, capacities, and archive rules are needed for the pilot?
4. Which WhatsApp/SMS providers, templates, sender identity, quiet hours,
   language fallback, delivery retries, and consent/retention policy are
   approved? Who can create or approve a retention offer, and how is a call
   task assigned when a salesperson is absent?
5. Should low-stock notifications be manager-approved every time, or can a
   gym opt into automatic supplier contact after a purchase policy is approved?
   What supplier lead-time, minimum-order, tax, currency, and receiving rules
   are required?
6. Which cleaning zones, occupancy thresholds, SLAs, escalation roles, supply
   costs, and offline expectations are appropriate for different gym sizes?
7. What equipment replacement policy is acceptable: useful-life assumptions,
   repair-cost threshold, downtime weight, safety review, warranty handling,
   approval limit, and capital-versus-expense treatment?
8. What chart of accounts, inventory valuation method, depreciation method,
   account-period/close behavior, opening-balance policy, branch consolidation,
   foreign-currency treatment, and tax/accounting review are approved by the
   gym owner or accountant?
9. Which historical payments, purchases, expenses, stock, and assets can be
   evidenced for backfill, and which remain outside the first report period?
10. Which report filters, export formats, refresh cadence, materiality warnings,
    and read-only/auditor access are required for the first management pilot?
11. Which provider integrations are worth implementing after the core slices,
    and what is the success threshold for enabling them? Credentials and live
    delivery are never assumed by this plan.

## Explicit exclusions from the committed scope

The following are intentionally not part of the five-pillar commitment:

- Adaptive gym music or playlists based on time, traffic, age, or vibe.
- Digital advertising, personalized TV signage, advertiser campaigns, or
  proof-of-play billing.
- Demographic targeting or age inference from check-ins, cameras, or traffic.
- A supplier marketplace, cross-gym supplier discovery network, supplier
  self-service portal, or supplier account marketplace.
- Autonomous purchasing, autonomous equipment replacement, or financial
  postings without an approved source, policy, and accountable actor.
- Statutory accounting, tax filing, country-specific e-invoicing, audit
  certification, or a claim that management statements satisfy local law.
- Provider credentials, live WhatsApp/SMS delivery, payment credentials, or
  hardware/sensor integrations without a separate approval and release plan.
- Arbitrary tenant CSS, unsupported white-label behavior, or a workspace
  preference that bypasses server authorization.

These exclusions can be reconsidered later as separate product decisions. They
must not be smuggled into the five pillars as “small” implementation details.

## Definition of done for this expansion

The five-pillar expansion is ready for a real-gym pilot only when:

- Foundation, renewal, operations, ledger, and reporting slices each pass the
  applicable test matrix with Convex and mock parity.
- Every enabled action has server-side tenant/branch/role enforcement,
  immutable audit where sensitive, and replay-safe idempotency where retried.
- Renewal actions are consent-aware, deduplicated, stoppable after renewal, and
  honest about provider state.
- Inventory, cleaning/facilities, and equipment records can be traced to their
  responsible branch/zone and source actions without fabricated measurements.
- Posted accounting entries balance and are immutable; supported source
  transactions reconcile to the ledger according to documented policies.
- Balance sheet, income statement, and cashflow views expose scope, period,
  currency, policy, completeness, and drill-down metadata and retain the
  management-accounting disclaimer.
- Additive migration, feature gating, rollback/read-only behavior, and exact
  target verification are documented in the release evidence; no Production
  seed or secret-bearing diagnostic was used.
