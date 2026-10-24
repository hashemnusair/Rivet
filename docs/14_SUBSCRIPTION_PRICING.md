# Basic and Pro — commercial contract, 21 October 2026

Implementation follows Hashem's 21 October request. Only Basic and Pro are sold
through public pricing and signup. The existing annual option remains: twelve
months paid in advance at 5% off the recurring price. All amounts below are JOD;
storage uses integer fils (1 JOD = 1,000 minor units). Applicable tax is excluded.

| Included | Basic | Pro |
| --- | --- | --- |
| Monthly subscription | 49 | 199 |
| One-time onboarding | 75 | 150 |
| Branches | 1 | Unlimited |
| Active members, organization-wide | 300 | Unlimited |
| Owner and staff accounts combined | 5 | Unlimited |
| Operational emails per month | 900 | 10,000 |
| Gym foundation, revenue protection, member app, permissions and audit history | Included | Included |
| Daily operations, Financial OS and management reporting | Not in the base plan | Included |
| First monthly payment, including onboarding | 124 | 349 |
| Annual recurring payment | 558.600 | 2,268.600 |
| First annual payment, including onboarding | 633.600 | 2,418.600 |

The landing section is labelled **Pricing**; the operator invoice/payment area
remains **Billing**. Pro is highlighted with “Every feature included”, without an
unsubstantiated popularity claim. The website offer is **the first 3 gyms**.
The existing live reservation/count mechanism is preserved: an eligible first
invoice holds a free website place, voiding it releases that place, and subsequent
requests pay the configured website fee. Existing issued offers are honored.
Website fulfillment itself remains an operator task.

## Recorded product assumptions

- **300 members** is a deliberate allowance for a small gym, not an assertion
  about the typical membership of Jordanian gyms. It gives more room than 150
  while preserving a meaningful growth boundary. Basic emails are exactly 3×
  the member allowance.
- **10,000 Pro operational emails/month** is an implementation assumption. The
  user specified unlimited branches, members and staff, not unlimited email.
  Email remains metered and clearly disclosed; bulk marketing is not included.
- Basic retains the previous Starter feature set; Pro includes every existing
  workspace module. Future products are not implicitly promised.
- Current/frozen memberships count; expired memberships and leads do not.
  Existing capacity enforcement also reserves future simultaneous memberships,
  merges overlapping terms per member, and excludes archived members. Pending
  active staff invitations consume seats.
- No existing organization is silently renamed from Starter, Growth or
  Enterprise. These identifiers remain for historical subscriptions, invoices,
  agreements and renewals. New signup and plan changes offer Basic/Pro; a legacy
  tenant can retain its current legacy tier while its status/cadence is managed.

## Paid Basic add-ons — implemented

Manage purchases in **Platform → Billing → Gyms → More actions → Change plan**.
Choose Basic, select quantities, review the recurring price and invoice preview,
and record the owner's approval in the required audit reason. Only platform
administrators can activate purchases. The landing keeps the small “Need a little
more room on Basic? Talk to us.” prompt; no public add-on matrix or self-service
purchase controls are added. Never change the global base plan to sell one gym
an add-on.

| Monthly add-on | JOD | Maximum / dependency |
| --- | ---: | --- |
| Second branch | 39 | Once; **2 branches total** |
| 100 active members + 300 operational emails | 10 | Three packs; **600 members / 1,800 emails total** |
| 2 owner/staff accounts | 5 | Three packs; **11 accounts total** |
| Daily operations | 5 | Once |
| Financial OS | 10 | Requires daily operations |
| Management reporting | 10 | Requires Financial OS |

Examples: Basic plus a second branch costs **88/month**; adding 100 members to
that costs **98/month**. Every add-on at its maximum costs **158/month**,
41 below Pro, but still stops at 2 branches, 600 members and 11 accounts.
A third branch or capacity beyond those ceilings requires Pro. No repeated branch
packs, unlimited packs or independent branch quotas. All capacities aggregate
across the organization's branches. Onboarding review should keep one gym
organization in one tenant; software caps alone cannot detect businesses using
unrelated identities to create separate tenants.

Quantities, prices, dependencies, limits, effective dates and revision checks are
server-owned. A stale operator form is rejected. Activation, invoice creation and
entitlement changes are atomic and audited; saving unchanged quantities creates
no duplicate term. Removing capacity is refused if current branches, active staff
(including invitations), or peak simultaneous memberships would exceed the new
allowance. Module cancellation removes access through the server guards.

For a **pending first payment**, changing add-ons voids and replaces the first
invoice, preserving the setup fee/promo/website rules. The gym stays locked until
payment is confirmed. A submitted transfer claim must be confirmed or returned
before the invoice can be changed. For an **active gym**, a change starts a new
term immediately, invoices the base and each purchased add-on, and credits unused
funded time. Unpaid replaced cycles are voided; they never earn new credit.
Renewals carry the same quantities and itemized charges. Annual add-ons receive
the existing 5% discount: the maximum package is JD 1,801.200/year, or
JD 1,876.200 for the first year including Basic onboarding. Onboarding is charged
once, not on every add-on change.

Owners can see purchased allowances in Settings → Subscription and line items in
checkout/PDF invoices. New subscription agreements disclose the package and total;
previously signed agreements stay immutable. A paid self-service upgrade to Pro
clears the old purchases; it never bills Pro plus redundant Basic add-ons.

Basic's base allowances are fixed in the global editor and backend. Only its
bounded per-gym packs can expand them. Global base prices/capability definitions
remain audited operator settings, not tenant-controlled purchase parameters.

## Owner upgrade quotes and delayed confirmation — correction, 24 October 2026

The old plan remains usable until confirmation. Upgrade credit is therefore an
estimate of unused funded time, not a permanent discount that can fund a full
term months later. Quotes show their validity deadline. An expired or repriced
unsubmitted quote must be refreshed and reviewed before transferring/submitting;
refresh voids the old quote and issues a new invoice, preserving history. Returned
claims follow the same rule. Submitted claims cannot be repriced, overwritten,
voided or replaced until the operator confirms or returns them.

Confirmation starts new service then; operator review never backdates it. Cash
paid, excluding any one-time onboarding fee, buys its full proportional share of
one new calendar term from that instant. The still-unused value of the outgoing
paid term funds the remaining share, capped by the quoted credit. Old-plan time
used while the quote/payment waits cannot also fund later service. If all that
credit has elapsed, only the transfer-funded share starts at confirmation; if
none was consumed, the complete term starts then. This preserves paid value
without silently collecting more money or granting duplicate funded time.

For example, a new monthly Basic package worth JD158 requesting Pro immediately
has a JD41 transfer quote. If Basic remains usable through its entire old term
before confirmation, JD41 buys 41/199 of the new Pro calendar term, starting at
confirmation; the JD158 already bought Basic service. No days purchased by that
JD41 are lost to review delay. If the gym waits until Basic expires before paying,
it refreshes the quote to JD199 and gets a full Pro term from confirmation.
Annual prices use the same existing 5% saving. Onboarding and website fees never
become time credit. Source invoice dates and funded amounts are stored with new
quotes; activation prorates remaining source value by exact elapsed milliseconds,
rounds money to minor units and duration up to a millisecond. Original invoice
amount/credit stay intact beside an auditable activation calculation. Later term
changes credit that actual funded service value. No refunds, new commercial
policy, or rewrites of historical signed agreements are introduced.

## Enforcement and compatibility

`apps/web/convex/planCatalogue.ts` is canonical; its public mirror is held to it by
a contract test. Unlimited is the explicit JSON-safe `-1` sentinel for the three
capacity fields. Server checks bypass those limits; UI renders “Unlimited”, never
-1. Pro's editor cannot introduce finite capacity or remove included modules.

A plan downgrade is refused before invoices or audits are created if current
branch/staff usage or future peak simultaneous memberships exceed the target.
Ordinary tenant users cannot edit platform plans. Existing tenant/branch
authorization and module guards remain in force.

Current commercial version is `2026-10-21`. Unversioned or older Basic/Pro catalog
rows cannot resurrect retired prices, fees, quotas or feature selections. Current
operator edits are stamped with the new version and audited. Legacy tier rows
remain readable; stored invoices, onboarding obligations and signed agreements
are not rewritten. Review any intentionally customized old Pro catalog row before
release: reapply an intended price through the audited editor, while unlimited
capacity and all-feature inclusion remain fixed.

Release must be **backend first**, then frontend: the old public submit validator
does not accept Basic. A coordinated cutover is required because an old open
signup form may still submit a retired tier after the backend changes. See CURRENT_STATE.md for the exact release evidence.

Read next: `CURRENT_STATE.md`, `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`,
`apps/web/convex/planCatalogue.ts`, `apps/web/convex/planCapacity.ts` and
`apps/web/convex/twoPlanPricing.test.ts`.
