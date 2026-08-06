# 06 — API and Mock Contract

## Purpose

The frontend and backend are implemented by different agents. This document defines the seam between them.

The frontend agent may refine names for ergonomics, but must document deviations in `FRONTEND_HANDOFF.md`. The backend agent should prefer adapting the API/client layer over rewriting approved UI.

## General conventions

- Base path: `/api/v1`
- JSON keys: `camelCase` at the frontend boundary.
- IDs: UUID strings.
- Timestamps: ISO 8601 UTC strings.
- Dates without time: `YYYY-MM-DD`.
- Money:

```ts
interface Money {
  amount: number;      // integer minor units, e.g. 12500 = JOD 125.000 if exponent is 3
  currency: string;    // ISO 4217
}
```

Do not assume every currency has two decimal digits. Formatting must use the currency's exponent/locale.

## Pagination

```ts
interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
```

List requests should support page, page size, search, sort, and domain-specific filters.

## Error contract

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
    fieldErrors?: Record<string, string[]>;
  };
}
```

## Session

```ts
interface Session {
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  };
  organization: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    locale: string;
  };
  branches: Array<{ id: string; name: string; code: string }>;
  activeBranchId?: string;
  roles: string[];
  permissions: string[];
}
```

## Core frontend client surface

The precise file names are implementation choices, but the client should expose domain-oriented methods similar to the following.

### Gym applications

```ts
submitGymApplication(input: {
  gymName: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: "Starter" | "Growth" | "Pro";
}): Promise<{
  applicationId: string;
  status: "pending" | "under_review" | "approved" | "rejected";
  notificationStatus: "pending" | "sent" | "failed" | "not_configured";
  submittedAt: string;
  duplicate: boolean;
}>
```

This public method writes only to the platform-level application queue. Gym
workspace creation and access issuance are protected review operations, not a
browser mutation available to applicants.

### Session and dashboard

```ts
getSession(): Promise<Session>
getDashboard(query: { branchId?: string; from: string; to: string }): Promise<DashboardData>
```

### Members

```ts
listMembers(query: MemberListQuery): Promise<Page<MemberSummary>>
getMember(memberId: string): Promise<MemberDetail>
createMember(input: CreateMemberInput): Promise<MemberDetail>
updateMember(memberId: string, input: UpdateMemberInput): Promise<MemberDetail>
archiveMember(memberId: string, input: { reason: string }): Promise<void>
listMemberTimeline(memberId: string, query?: TimelineQuery): Promise<Page<TimelineEvent>>
addMemberNote(memberId: string, input: AddNoteInput): Promise<TimelineEvent>
```

### Plans and memberships

```ts
listPlans(query: PlanListQuery): Promise<Page<MembershipPlan>>
createPlan(input: CreatePlanInput): Promise<MembershipPlan>
updatePlan(planId: string, input: UpdatePlanInput): Promise<MembershipPlan>
listMemberships(query: MembershipListQuery): Promise<Page<MembershipSummary>>
createMembershipSale(input: CreateMembershipSaleInput): Promise<MembershipSaleResult>
renewMembership(membershipId: string, input: RenewMembershipInput): Promise<MembershipSaleResult>
freezeMembership(membershipId: string, input: FreezeMembershipInput): Promise<MembershipDetail>
extendMembership(membershipId: string, input: ExtendMembershipInput): Promise<MembershipDetail>
cancelMembership(membershipId: string, input: CancelMembershipInput): Promise<MembershipDetail>
```

A sale result should include the membership, charge, optional payment/receipt, and timeline events created.

### CRM

```ts
listLeads(query: LeadListQuery): Promise<Page<LeadSummary>>
getLead(leadId: string): Promise<LeadDetail>
createLead(input: CreateLeadInput): Promise<LeadDetail>
updateLead(leadId: string, input: UpdateLeadInput): Promise<LeadDetail>
logContactAttempt(leadId: string, input: ContactAttemptInput): Promise<LeadDetail>
createFollowUp(input: CreateTaskInput): Promise<Task>
completeTask(taskId: string, input: CompleteTaskInput): Promise<Task>
convertLead(leadId: string, input: ConvertLeadInput): Promise<MemberDetail>
listRenewalQueue(query: RenewalQueueQuery): Promise<Page<RenewalQueueItem>>
```

### Check-in

```ts
previewCheckIn(input: CheckInLookupInput): Promise<CheckInPreview>
createCheckIn(input: CreateCheckInInput): Promise<CheckInResult>
overrideCheckIn(input: OverrideCheckInInput): Promise<CheckInResult>
listRecentCheckIns(query: RecentCheckInQuery): Promise<Page<CheckInSummary>>
getOccupancy(branchId: string): Promise<OccupancySnapshot>
```

Representative result:

```ts
interface CheckInResult {
  checkInId?: string;
  decision: "allowed" | "warning" | "blocked" | "overridden";
  reasonCodes: string[];
  member: MemberSummary;
  membership?: MembershipSummary;
  occurredAt?: string;
  message: string;
}
```

### Payments and shifts

```ts
listTransactions(query: TransactionListQuery): Promise<Page<TransactionSummary>>
createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<PaymentReceipt>
refundPayment(paymentId: string, input: RefundPaymentInput): Promise<PaymentReceipt>
voidPayment(paymentId: string, input: VoidPaymentInput): Promise<PaymentReceipt>
getReceipt(receiptId: string): Promise<ReceiptDetail>
openCashShift(input: OpenCashShiftInput): Promise<CashShift>
getCurrentCashShift(branchId: string): Promise<CashShift | null>
closeCashShift(shiftId: string, input: CloseCashShiftInput): Promise<CashShift>
getDailyReconciliation(query: ReconciliationQuery): Promise<ReconciliationReport>
```

### Automations, audit, and settings

```ts
listAutomationRules(): Promise<AutomationRule[]>
createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule>
updateAutomationRule(id: string, input: UpdateAutomationRuleInput): Promise<AutomationRule>
listAutomationExecutions(query: ExecutionQuery): Promise<Page<AutomationExecution>>
listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>>
getOrganizationSettings(): Promise<OrganizationSettings>
updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<OrganizationSettings>
listUsers(query: UserListQuery): Promise<Page<StaffUser>>
inviteUser(input: InviteUserInput): Promise<StaffUser>
updateUserAccess(userId: string, input: UpdateUserAccessInput): Promise<StaffUser>
```

## Suggested REST mapping

```text
GET    /session
GET    /dashboard

GET    /members
POST   /members
GET    /members/{id}
PATCH  /members/{id}
POST   /members/{id}/archive
GET    /members/{id}/timeline
POST   /members/{id}/notes

GET    /membership-plans
POST   /membership-plans
PATCH  /membership-plans/{id}
GET    /memberships
POST   /membership-sales
POST   /memberships/{id}/renewals
POST   /memberships/{id}/freezes
POST   /memberships/{id}/extensions
POST   /memberships/{id}/cancellations

GET    /leads
POST   /leads
GET    /leads/{id}
PATCH  /leads/{id}
POST   /leads/{id}/contact-attempts
POST   /leads/{id}/convert
GET    /tasks
POST   /tasks
POST   /tasks/{id}/complete
GET    /renewal-queue

POST   /check-ins/preview
POST   /check-ins
POST   /check-ins/override
GET    /check-ins
GET    /branches/{id}/occupancy

GET    /transactions
POST   /payments
POST   /payments/{id}/refunds
POST   /payments/{id}/void
GET    /receipts/{id}
POST   /cash-shifts
GET    /cash-shifts/current
POST   /cash-shifts/{id}/close
GET    /reconciliation/daily

GET    /automation-rules
POST   /automation-rules
PATCH  /automation-rules/{id}
GET    /automation-executions
GET    /audit-events
GET    /settings
PATCH  /settings
GET    /users
POST   /users/invitations
PATCH  /users/{id}/access
```

## Mock behavior requirements

The mock client must simulate more than reads.

- Create/update operations update in-memory state.
- State persists during navigation; optional local storage persistence is acceptable.
- A reset-demo action restores the canonical seed.
- Artificial latency should be configurable.
- Selected scenarios can force errors, empty states, forbidden states, and approval-required responses.
- Idempotent payment behavior should be simulated for browser tests.
- Timeline and dashboard totals should update after mutations.

## Contract ownership

- Frontend agent owns the initial TypeScript interface used by the UI.
- Backend agent owns the OpenAPI implementation.
- Integration should generate or map types so divergence becomes visible in CI.
- Any intentional divergence must be documented, not silently patched in components.
