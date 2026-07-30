# 02 — Frontend Agent Task

## Your responsibility

Build the complete MVP frontend as a polished, locally previewable product using realistic mock data. Another agent will later implement the backend and connect it through the documented data-access boundary.

Do not implement a production backend. Do not leave the product as disconnected static screenshots.

## Required stack

- Next.js App Router with TypeScript.
- Tailwind CSS.
- shadcn/ui using Radix-compatible primitives.
- Lucide icons.
- React Hook Form plus Zod for form behavior and validation.
- Recharts for charts.
- `pnpm`.

Use current stable compatible releases and commit the lockfile.

## Application location

Create the frontend under:

```text
apps/web
```

A root `pnpm-workspace.yaml` may be created. Keep future `apps/api` and `packages/contracts` paths available.

## Required architectural boundary

All page-level data must flow through one typed interface, conceptually:

```ts
export interface GymOSApi {
  getSession(): Promise<Session>;
  getDashboard(query: DashboardQuery): Promise<DashboardData>;
  listMembers(query: MemberListQuery): Promise<Page<MemberSummary>>;
  getMember(id: string): Promise<MemberDetail>;
  createMember(input: CreateMemberInput): Promise<MemberDetail>;
  updateMember(id: string, input: UpdateMemberInput): Promise<MemberDetail>;
  listLeads(query: LeadListQuery): Promise<Page<Lead>>;
  getLead(id: string): Promise<LeadDetail>;
  listMemberships(query: MembershipListQuery): Promise<Page<Membership>>;
  checkIn(input: CheckInInput): Promise<CheckInResult>;
  createPayment(input: CreatePaymentInput): Promise<PaymentReceipt>;
  // Continue for every implemented workflow.
}
```

Implement:

- `MockGymOSApi` for the frontend pass.
- A provider/factory that exposes the active client.
- Mock latency and selected error/empty-state controls.
- No component may import seed data directly.

The backend agent should later add `HttpGymOSApi` and change configuration rather than rewrite pages.

## Required routes/screens

Use sensible route groups and nested layouts. Exact paths may vary, but the following product areas must exist.

### Authentication preview

- Sign-in page.
- Demo role switcher for owner, manager, salesperson, and receptionist.
- Branch selector where applicable.

### Owner dashboard

Show realistic, internally consistent data:

- Revenue today/month.
- New sales and renewals.
- Expiring and expired members requiring action.
- Lead conversion funnel.
- Revenue by branch.
- Salesperson leaderboard.
- Cash variance/sensitive-action alerts.
- Recent activity.

### Members

- Searchable/filterable table.
- Status chips and branch/plan filters.
- Add member form.
- Member detail with overview and chronological timeline.
- Memberships, payments, check-ins, notes, tasks, and communication tabs/sections.
- Actions: sell/renew membership, freeze, extend, collect payment, create task, add note.

### Memberships and plans

- Plan catalogue.
- Create/edit plan UI.
- Subscription list.
- Sale/renewal flow with price, discount, dates, branch access, payment split, and summary.
- Freeze/extension/cancellation dialogs that require reason.

### CRM and renewals

- Kanban or grouped pipeline view.
- Dense list/queue view for actual daily work.
- Lead detail drawer/page.
- Log call outcome and schedule next follow-up.
- Expiring members queue.
- Overdue tasks queue.
- Conversion and lost-reason reporting.

### Reception

This should feel like a dedicated operational mode, not another generic table.

- Large search/scan input with immediate focus.
- Recent check-ins.
- Current occupancy.
- Check-in result states: allowed, warning, blocked.
- Member photo, plan, expiry, balance, visits, notes.
- Quick collect payment and quick renewal actions.
- Manual override dialog with reason.

### Payments and reconciliation

- Transactions table.
- Receipt detail/print view.
- Collect-payment flow.
- Refund/void flow.
- Shift opening and closing interface.
- Expected vs counted cash and variance explanation.
- Daily reconciliation summary.

### Automations

- Rules list.
- Rule detail/editor for the initial triggers/actions.
- Message template preview in English and Arabic.
- Execution/activity log.
- Campaign outcome summary mock.

### Audit and settings

- Audit log with filters and before/after detail.
- Organization, branches, users, roles, permissions, payment methods, tax/receipt, and notification settings.

## UX requirements

- Desktop-first administrative interface with excellent tablet behavior.
- Dedicated compact reception layout.
- English initial copy, but components must survive Arabic text and RTL.
- Clear loading, skeleton, empty, error, forbidden, and not-found states.
- Destructive and money-changing actions need confirmation and reason where required.
- Avoid excessive card grids; use tables, queues, timelines, drawers, and split views where operational density matters.
- Charts must answer an operational question, not decorate the page.
- Use realistic Jordan/MENA sample names, JOD values, phone formats, branches, and workflows.

## Seed-data requirements

Provide enough connected data to demonstrate:

- Two gym branches.
- At least 80 members with varied statuses.
- At least 25 leads across all stages.
- Multiple salespeople and receptionists.
- Active, expiring, expired, frozen, cancelled, and visit-based memberships.
- Payments using cash/card/bank transfer and a few partial/outstanding cases.
- Check-ins across at least 30 days.
- At least two cash discrepancies.
- Approved and unapproved discounts/refunds.
- Automation executions and audit events.

All related totals must be coherent. A payment shown on a member timeline should appear in transactions and affect dashboard totals.

## Local preview requirements

The finished frontend must run with documented commands, preferably:

```bash
pnpm install
pnpm dev
```

or a root command that starts `apps/web`.

Also provide:

- `pnpm build` passing.
- Lint/type-check scripts.
- A clear demo login or role switcher.
- No required external service or secret for mock mode.

## Testing requirements

At minimum:

- Unit tests for important formatting/permission/pure business-display logic.
- Component tests for critical forms or check-in result states.
- One browser-level happy path covering member lookup → renewal/payment → updated timeline using mocks.

## Frontend completion criteria

You are finished only when:

- Every P0 area has a usable UI.
- Workflows mutate mock state so the preview behaves like an application.
- All data access uses the client boundary.
- The application can be reviewed locally without a backend.
- Build, type-check, and tests pass.
- `FRONTEND_HANDOFF.md` is completed using the template.

## Do not do

- Do not add a database.
- Do not add Next.js route handlers as a hidden mock backend unless strictly needed for browser-test mechanics.
- Do not put fetch calls directly in components.
- Do not make arbitrary API shapes that contradict `06_API_AND_MOCK_CONTRACT.md`.
- Do not start P2 marketplaces.
