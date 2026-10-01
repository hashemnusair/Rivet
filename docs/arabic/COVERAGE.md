# Route and integration checklist

Observed main `45c504b778a136f25f979d0260ed9cea8e641bd2`; Arabic `f98e324de34d8925619ec0c3250f42ec879abe9a`. **76 page entry files** and **40 files changed on both sides**. These are historical baselines; refresh after integration. No row is certified fully translated.

## Page entries

For each entry inspect its layouts, imported client components, dialogs, toasts, validation, accessible text, loading/error/not-found states and server-generated content. Mark redirects separately and test their targets. Record catalog keys, decision IDs, tests and any remaining gap in the execution coverage ledger.

| Page file | Initial audit state |
| --- | --- |
| `apps/web/src/app/(app)/audit/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/automations/[ruleId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/automations/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/checklists/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/checkout/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/classes/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/crm/leads/[leadId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/crm/pipeline/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/crm/queues/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/dashboard/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/exports/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/finance/balance-sheet/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/finance/cash-flow/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/finance/controls/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/finance/income-statement/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/finance/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/getting-started/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/maintenance/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/members/[memberId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/members/duplicates/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/members/import/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/members/new/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/members/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/memberships/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/onboarding/agreement/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/operations/checkout/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/operations/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/operations/payables/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/operations/payables/payments/[paymentId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/payments/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/payments/receipts/[receiptId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/payments/receipts/view/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/payments/shifts/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/plans/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/pt/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/reception/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/reports/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/reports/statements/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/settings/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/(app)/support/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/arabic-room/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/discover/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/finance/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/getting-started/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/gyms/[gymId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/login/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/my-gyms/[membershipId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/my-gyms/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/profile/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/receipts/[receiptId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/customer/signup/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/dev/design-system/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/accept-invitation/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/admin/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/gym/create/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/gym/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/member/create/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/member/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/login/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/offers/[token]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/offline/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/onboarding/gym/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/agreements/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/applications/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/arabic-room/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/billing/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/email-log/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/gyms/[gymId]/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/gyms/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/subscriptions/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/platform/support/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/privacy/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/signup/page.tsx` | Pending integrated-source audit |
| `apps/web/src/app/terms/page.tsx` | Pending integrated-source audit |

## Files changed on both branches

These overlaps are review candidates, not a claim that Git will report 40 conflicts. Preserve main’s current behavior and Elias’s locale/RTL intent at each overlap.

- `apps/web/src/app/(app)/crm/leads/[leadId]/lead-detail.client.tsx`
- `apps/web/src/app/(app)/crm/pipeline/page.tsx`
- `apps/web/src/app/(app)/crm/queues/page.tsx`
- `apps/web/src/app/(app)/members/new/page.tsx`
- `apps/web/src/app/(app)/members/page.tsx`
- `apps/web/src/app/(app)/payments/page.tsx`
- `apps/web/src/app/(app)/payments/receipts/[receiptId]/receipt.client.tsx`
- `apps/web/src/app/(app)/payments/shifts/page.tsx`
- `apps/web/src/app/(app)/reception/page.tsx`
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/marketing/hero-devices.tsx`
- `apps/web/src/components/marketing/vocabulary-marquee.tsx`
- `apps/web/src/components/public/public-shell.tsx`
- `apps/web/src/components/shared/chrome.tsx`
- `apps/web/src/components/shared/data-display.tsx`
- `apps/web/src/components/shared/status-chip.tsx`
- `apps/web/src/components/shell/command-palette.tsx`
- `apps/web/src/components/shell/mobile-nav.tsx`
- `apps/web/src/components/shell/nav-config.test.ts`
- `apps/web/src/components/shell/nav-config.ts`
- `apps/web/src/components/shell/sidebar.tsx`
- `apps/web/src/components/shell/topbar.tsx`
- `apps/web/src/components/ui/states.tsx`
- `apps/web/src/features/crm/contact-work-panel.tsx`
- `apps/web/src/features/crm/new-lead-dialog.tsx`
- `apps/web/src/features/dashboard/charts.tsx`
- `apps/web/src/features/dashboard/dashboard-scope.test.ts`
- `apps/web/src/features/dashboard/dashboard-scope.ts`
- `apps/web/src/features/dashboard/manager-dashboard.tsx`
- `apps/web/src/features/dashboard/owner-dashboard.tsx`
- `apps/web/src/features/dashboard/reception-dashboard.tsx`
- `apps/web/src/features/dashboard/sales-dashboard.tsx`
- `apps/web/src/features/dashboard/trainer-dashboard.tsx`
- `apps/web/src/features/members/member-header.tsx`
- `apps/web/src/features/members/member-tabs.tsx`
- `apps/web/src/features/membership-actions/payment-dialog.tsx`
- `apps/web/src/features/membership-actions/sale-dialog.tsx`
- `apps/web/src/lib/providers/app-providers.tsx`
- `apps/web/src/lib/utils/money.ts`

## Source inventory

After integrating main, regenerate `docs/arabic/source-inventory.json` with the existing `apps/web/scripts/inventory-arabic-copy.mjs` (inspect its invocation first). The main baseline has 414 files and 13,179 candidate strings. It includes false positives and cannot prove that all user-visible text is covered. Add server-only messages, PDF/email builders, accessibility labels, assets and runtime-generated content explicitly.
