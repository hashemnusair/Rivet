# 05 — Domain Model

This is the conceptual model. Agents may normalize or split tables, but must preserve the meanings and invariants.

## Identity and tenancy

### Organization

A gym company/tenant.

Key fields:

- `id`
- `name`
- `slug`
- `default_currency`
- `timezone`
- `locale`
- `status`
- receipt/tax configuration
- created/updated timestamps

### Branch

A physical gym location owned by an organization.

- `id`
- `organization_id`
- `name`
- `code`
- address/contact/timezone override
- occupancy configuration
- status

### User

A staff login identity.

### GymApplication

A public request from a gym owner who wants to join RIVET. It is platform-level
data, not tenant data: submitting one never creates a Clerk account,
organization, branch, or membership. RIVET reviews the application and
provisions access separately.

- gym name
- owner name
- email and contact number
- selected platform plan
- status (`pending`, `under_review`, `approved`, `rejected`)
- notification delivery status and timestamps

### OrganizationMembership

Connects a user to an organization and defines role, status, and branch scope.

### Role / Permission

Roles are configurable permission bundles. Preserve system roles as defaults, not hardcoded authorization shortcuts.

## People and CRM

### Person / Member

A member is tenant-specific. Do not expose or merge people across tenants in the MVP.

- identity/contact fields
- member number
- photo reference
- preferred language
- emergency contact
- tags
- status
- source
- assigned salesperson
- privacy/communication preferences

### Lead

A sales opportunity that may or may not be linked to an existing member.

- stage
- source
- owner
- branch
- expected value
- next follow-up
- lost reason
- converted member ID

### Activity

Append-only timeline item.

Examples:

- call attempted/completed
- note
- message queued/sent/failed
- trial booked/completed
- offer created
- task completed
- membership sold/frozen/renewed
- payment collected/refunded
- check-in

### Task

Action assigned to staff.

- type
- owner
- due time
- priority
- status
- related entity
- outcome

### Offer

Commercial offer presented to a lead/member, optionally linked to a plan and expiration time.

## Memberships

### MembershipPlan

Template sold by the gym.

- name/code
- duration or visit allowance
- base price
- branch access policy
- freeze allowance/rules
- status
- tax behavior

### Membership

A purchased membership term.

- organization/member/plan
- home branch
- start/end dates
- status state
- total visits and remaining visits if applicable
- sale price and discount
- payment status
- source/owner
- parent/previous membership for renewal lineage

### MembershipAdjustment

Append-only operation affecting a membership.

Types:

- freeze
- unfreeze
- extension
- cancellation
- visit adjustment
- branch-access change
- date correction

Includes reason, actor, before/after, approval state, and timestamps.

### FreezePeriod

Explicit start/end and status, rather than an unstructured date edit.

## Access and attendance

### CheckIn

- member
- branch
- membership used
- decision: allowed/warning/blocked/overridden
- reason codes
- actor/device/source
- timestamp
- override reason and actor if applicable

### AccessCredential

QR/NFC/external-device identifier. Do not store raw biometric templates.

## Finance

### Charge / Sale

Commercial obligation produced by a membership or other sellable item.

- subtotal
- discount
- tax
- total
- paid amount
- outstanding amount
- currency

### Payment

Money received.

- amount/currency
- method
- branch
- staff actor
- external reference
- idempotency key
- receipt number
- status

### PaymentAllocation

Maps a payment to one or more charges.

### Refund

Separate negative transaction linked to an original payment/allocation.

### Receipt

Printable representation of payment facts. It must not become the source of truth itself.

### DiscountApproval

Request/decision record when a discount exceeds the actor's limit.

### CashShift

Reception cash session.

- branch/register/user
- opening amount
- opened/closed timestamps
- expected amount
- counted amount
- variance
- explanation
- approval state

### CashAdjustment

Explicit non-payment cash movement with reason and permission.

## Automations and communications

### AutomationRule

- trigger type
- conditions
- actions
- enabled state
- schedule/timezone behavior
- deduplication window

### AutomationExecution

- rule
- subject entity
- deduplication key
- status
- attempts
- result/error

### MessageTemplate

- channel
- language
- variables
- body
- approval/provider status where applicable

### MessageDelivery

- recipient
- rendered content reference
- provider
- status/timestamps/error

## Governance

### AuditEvent

Append-only record of sensitive or administrative actions.

### ApprovalRequest

Generic approval workflow for discount, refund, date override, freeze exception, or cash variance.

### ImportJob / ImportRow

Track CSV mapping, validation, execution, row result, and summary.

## Important relationships

```text
Organization 1 ── * Branch
Organization 1 ── * OrganizationMembership * ── 1 User
Organization 1 ── * Member
Member 1 ── * Membership * ── 1 MembershipPlan
Member 1 ── * Activity
Lead 0..1 ── 0..1 Member
Membership 1 ── * MembershipAdjustment
Member 1 ── * CheckIn
Charge * ── * Payment through PaymentAllocation
CashShift 1 ── * Payment
AutomationRule 1 ── * AutomationExecution
```

## Derived status guidance

Avoid storing several contradictory status fields.

Examples:

- Membership effective status is derived from cancellation state, freeze period, start/end dates, visit balance, and explicit administrative state.
- Payment status is derived from charge total and valid allocations/refunds.
- Lead overdue state is derived from open status and next-follow-up timestamp.

Where a denormalized status is stored for query performance, define one authoritative transition service and test it.
