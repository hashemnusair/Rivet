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
unsubstantiated popularity claim. The website offer is **the first 3 gyms**. No
remaining-slot count or automatic website fulfillment is implied. The prior
five-gym offer was not present in this checkout, so the three-gym statement is
added to the existing pricing section. No other promotion was changed.

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

## Optional Basic add-ons — sales proposal, not activated

The user floated optional add-ons. This table records a concrete recommendation;
it does **not** create per-tenant purchases, billing lines or entitlement grants.
The landing only says “Need a little more room on Basic? Talk to us.” Do not use
the global plan editor to sell an add-on to one gym: it changes every gym on that
plan. Until per-tenant add-on billing exists, sell the base plans or move to Pro.

| Proposed monthly add-on | JOD | Maximum / dependency |
| --- | ---: | --- |
| Second branch | 39 | Once; **2 branches total** |
| 100 active members + 300 operational emails | 10 | Three packs; **600 members / 1,800 emails total** |
| 2 owner/staff accounts | 5 | Three packs; **11 accounts total** |
| Daily operations | 5 | Once |
| Financial OS | 10 | Requires daily operations |
| Management reporting | 10 | Requires Financial OS |

Examples: Basic plus a second branch costs **88/month**; adding 100 members to
that costs **98/month**. Every proposed add-on at its maximum costs **158/month**,
41 below Pro, but still stops at 2 branches, 600 members and 11 accounts.
A third branch or capacity beyond those ceilings requires Pro. No repeated branch
packs, unlimited packs or independent branch quotas. All capacities aggregate
across the organization's branches. Onboarding review should keep one gym
organization in one tenant; software caps alone cannot detect businesses using
unrelated identities to create separate tenants.

Before selling these add-ons, implement tenant-scoped quantities, server-derived
price and dependency validation, immutable audit events, effective dates,
recurring invoice lines, agreement disclosure, cancellation/downgrade capacity
checks and owner-visible purchased allowances. This is intentionally separate
from changing the global base catalogue; no speculative paid feature was enabled.

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
signup form may still submit a retired tier after the backend changes. There is
no deployment or production-data mutation in this local implementation.

Read next: `CURRENT_STATE.md`, `docs/12_SYSTEM_MAPS_AND_RELEASE_RUNBOOK.md`,
`apps/web/convex/planCatalogue.ts`, `apps/web/convex/planCapacity.ts` and
`apps/web/convex/twoPlanPricing.test.ts`.
