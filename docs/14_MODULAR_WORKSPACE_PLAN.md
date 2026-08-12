# 14 — Modular workspace and owner preference plan

Status: **Product plan only — not implemented**
Owner steering required before schema, UI, or entitlement work begins.

## Goal

Let each gym owner shape RIVET into a simpler workspace by choosing which product pages appear for their gym. The first owner sees a short Discord-style setup survey after their first authenticated entry into the provisioned gym workspace. They can change the selection later from a permanent **Workspace preferences** control.

This is initially a workspace-composition feature, not a new authorization or billing system. Hiding a page must not grant access, delete historical data, or silently claim a premium entitlement.

## Recommended product rules

1. Preferences are organization-wide. Every staff member in that gym sees the same chosen workspace, further reduced by their existing role and branch permissions.
2. Dashboard, RIVET support, notifications, account controls, and Settings remain available so a gym cannot lock itself out of recovery or configuration.
3. Existing tenant data is preserved when a page is hidden. Restoring a page restores access to its existing data.
4. A hidden page is removed from desktop navigation, mobile navigation, command search, quick actions, and internal links. Direct URLs show a clear **Not included in this workspace** state rather than briefly rendering the page.
5. Module preferences are not a substitute for server authorization. Convex still enforces role, branch, tenant, ownership, and money-action permissions.
6. Premium previews are disabled cards labelled **Premium · coming soon**. They have no route, price, tier assignment, purchase action, or fake unlock behavior until the commercial tiers are approved.
7. Routine preference changes are audited but do not require a reason.

## Initial page catalog

### Always available

- Dashboard
- Notifications
- RIVET support
- Account and sign-out controls
- Settings and Workspace preferences for owners

### Owner-selectable pages

| Page group | Selection | Includes |
| --- | --- | --- |
| Daily operations | Front desk | Reception search, entry verdicts, QR check-in |
| Daily operations | Members | Member list, profiles, notes, history |
| Daily operations | Memberships | Sales, renewals, freezes, transfers, cancellations |
| Daily operations | Membership plans | Plan catalog, pricing and included benefits |
| Daily operations | Personal training | Trainers, packages, credits, calendars and bookings |
| Growth | Follow-ups | Leads, trials, tasks, offers and follow-up queues |
| Money | Payments | Charges, collections, receipts, refunds and voids |
| Money | Reports | Revenue, membership and staff reporting |
| Control | Automations | Rules, executions and delivery monitoring |
| Control | Audit log | Immutable sensitive-action history |

### Premium placeholders

Use neutral placeholders until tier mapping is approved:

- Advanced forecasting
- Branded member app
- Smart retention recommendations

Do not mark existing operational features as premium retroactively. The tier exercise must first define limits, grandfathering, trial behavior, downgrade behavior, and what happens to stored data.

## Dependency policy

The survey should explain and resolve dependencies before saving:

- Front desk depends on Members and Memberships.
- Memberships depends on Members and Membership plans.
- Personal training depends on Members.
- Payments depends on Members.
- Follow-up conversion depends on Members, Memberships, and Membership plans.
- Reports may remain visible with any selected operational source, but must show truthful empty states.
- Hiding Automations does not silently stop active rules. Stopping rules is a separate explicit operational action.

Recommended v1 behavior: selecting a dependent page automatically selects its required pages and explains why. Deselecting a required page offers either **Keep required pages** or **Remove dependent pages too** before saving.

## First-owner onboarding experience

Trigger only after all of these are true:

- Clerk identity is hydrated.
- Convex resolves an active gym organization membership.
- The role is `owner`.
- The organization has no completed workspace-preference onboarding record.

Do not place this survey in public gym application submission or Clerk signup. A gym application is not yet a tenant, and an invited owner may be an existing Clerk user.

### Suggested flow

1. **Welcome to your workspace** — explain that the selection changes navigation, not stored data.
2. **Run the gym** — select Front desk, Members, Memberships, Plans, and Personal training.
3. **Grow and collect** — select Follow-ups, Payments, and Reports.
4. **Control and supervise** — select Automations and Audit log.
5. **Premium preview** — show disabled coming-soon cards without collecting an entitlement choice.
6. **Review** — show the final navigation and dependency additions before one atomic save.

For existing organizations, default every currently available page to selected so deployment cannot unexpectedly remove functionality. Whether existing owners must complete the survey or only receive a dismissible prompt is a steering decision.

## Ongoing preference control

- Add an owner-only **Customize workspace** button in the desktop sidebar and mobile menu.
- Add a **Workspace** tab in Settings.
- Show selected page count, dependency explanations, last updated time, and updating owner.
- Provide **Save changes**, **Discard**, and navigation protection for unsaved changes.
- After save, update desktop navigation, mobile navigation, command palette, quick actions, and disabled-route handling without a full refresh.
- Staff who open a disabled deep link see the disabled state and are told to ask a gym owner. Owners also receive a direct link back to Workspace preferences.

## Data and contracts

Recommended additive contract:

```ts
type WorkspaceModuleKey =
  | "reception"
  | "members"
  | "memberships"
  | "plans"
  | "personal_training"
  | "follow_ups"
  | "payments"
  | "reports"
  | "automations"
  | "audit";

interface WorkspacePreferences {
  organizationId: UUID;
  enabledModules: WorkspaceModuleKey[];
  onboardingCompletedAt?: ISODateTime;
  version: number;
  updatedAt: ISODateTime;
  updatedByUserId: UUID;
}
```

Store a versioned organization-level record in Convex. Validate module keys and dependencies server-side. Write an immutable audit event containing before/after module sets and correlation ID. Never store the authoritative preference only in local storage.

The module catalog itself should remain code-owned in v1 so a typo or arbitrary database row cannot expose an unreviewed route. A future platform-controlled catalog can be introduced only when premium tier entitlements are designed.

## Delivery slices

### Slice A — Voluntary page preferences

- Add the persisted contract, Convex read/update operations, mock parity, and audit.
- Add the Settings editor and owner-only Customize workspace button.
- Filter every navigation/search/quick-action source from one shared catalog.
- Block direct access to hidden routes with a truthful recovery state.
- Default all current pages on for every tenant.

This slice provides value without interrupting an existing owner's next login.

### Slice B — New-owner survey

- Add the first-owner onboarding trigger and multi-step survey.
- Add dependency resolution, atomic save, loading/error recovery, and accessibility.
- Apply it automatically only to organizations provisioned after a chosen release timestamp.
- Keep an operator-controlled rollout flag for existing organizations.

### Slice C — Configurable dashboard blocks

- Decide which dashboard cards are required versus optional.
- Let owners reorder or hide approved dashboard blocks.
- Keep role-specific dashboards and data permissions intact.
- Do not allow arbitrary drag-and-drop page builders in the pilot.

Page selection should stabilize before block-level layout customization begins.

### Slice D — Premium entitlement mapping

- Approve Starter/Growth/Pro capability and limit matrix.
- Define upgrades, downgrades, trials, grandfathering, and stored-data behavior.
- Add server-owned entitlements separate from owner preferences.
- Render premium pages only when both entitled and owner-selected.
- Replace placeholder cards with truthful plan labels and a real contact/upgrade path.

## Verification plan

### Contract and Convex

- Default existing tenant receives every current selectable page.
- Only an owner can update organization workspace preferences.
- Managers and staff cannot mutate preferences directly.
- Unknown module keys and invalid dependency sets are rejected.
- Cross-tenant reads and writes are denied.
- Repeated saves are idempotent and audit before/after state accurately.
- Hiding and restoring pages never deletes domain records.

### UI and accessibility

- First owner sees the survey once; other roles do not.
- Existing invited-user and fresh invited-owner flows both reach onboarding correctly.
- Desktop, mobile, command palette, quick actions, and deep links agree immediately.
- Unsaved survey/settings choices are protected during internal and browser navigation.
- Keyboard, focus order/return, screen-reader names, 200% text, 320-pixel layout, English LTR, and Arabic RTL pass.
- Premium previews cannot be clicked or announced as purchased/unlocked.

### Browser journeys

- New owner selects a minimal workspace, reloads, signs out/in, and retains it.
- Owner changes preferences later and a second staff browser updates without refresh.
- Staff deep-links to a hidden page and receives the correct non-authorizing state.
- Re-enable a page and verify its historical records are unchanged.
- Change roles/branch scope and prove permissions still narrow the selected workspace.

Run the complete repository quality gate before release. Production verification must use one named disposable tenant and must not alter a real gym's preferences without explicit approval.

## Steering decisions required before Slice A

1. Are preferences organization-wide only, or should an owner also create different presets by staff role?
2. Which pages, beyond Settings/support/account, must never be hidden?
3. Should disabling a page only hide its UI, or also pause background behavior such as automations?
4. Should existing owners receive a mandatory survey, a dismissible survey, or only the Settings button?
5. Should the initial survey select all pages by default, a recommended simple set, or nothing beyond the essentials?
6. Should dependencies be added automatically or require explicit confirmation?
7. Are premium placeholders limited to a preview section, or should disabled premium items also appear in navigation?
8. Is block-level dashboard customization wanted for the pilot, or only after page-level preferences are proven?

## Explicit non-goals for the first slice

- No arbitrary page builder.
- No per-user custom navigation.
- No premium billing or checkout.
- No automatic downgrade or data deletion.
- No preference-based bypass of Convex authorization.
- No invented tier matrix.
