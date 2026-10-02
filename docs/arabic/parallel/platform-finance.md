# Platform finance Arabic support

## Scope and files

This packet localizes platform pricing and entitlements, billing and invoice workflows, subscription administration, the gym directory, and gym administration details.

- `apps/web/src/app/platform/billing/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/billing/bill-gym-wizard.tsx` and `bill-gym-wizard.test.tsx`
- `apps/web/src/app/platform/billing/gym-subscriptions.tsx` and `gym-subscriptions.test.tsx`
- `apps/web/src/app/platform/subscriptions/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/gyms/page.tsx` and `page.test.tsx`
- `apps/web/src/app/platform/gyms/[gymId]/gym-admin-detail.tsx` and `gym-admin-detail.test.tsx`
- `apps/web/src/lib/platform/subscription-billing.ts` and `subscription-billing.test.ts`
- `apps/web/src/lib/i18n/messages/en/platformFinance.ts`
- `apps/web/src/lib/i18n/messages/ar/platformFinance.ts`

## Approved terminology and behavior

The finance catalog is registered under `platformFinance` and includes `plans`, `billing`, `wizard`, `subscriptions`, `gyms`, `detail`, and `validation`, with typed English and Arabic entries. It uses the approved membership-plan wording (`plans.title`: **أنواع الاشتراكات**) and change-plan wording (`wizard.planChange`: **تغيير نوع الاشتراك**), while preserving plan keys, limits, entitlements, and prices. Arabic plural objects provide all six plural categories.

Amounts are rendered through the locale-aware money formatter from exact integer minor units. Price and invoice inputs use the shared Arabic/Persian digit normalization and money parser before validation; plan limits normalize digits and still require safe whole numbers. Currency precision and the existing billing calculations are retained. Dates use the configured formatting time zone and approved Gregorian/Jordanian formatting.

The bill-gym wizard uses `subscriptionBillingLineDescriptors()` to localize the existing preview lines for subtotal, remaining-term credit, and amount due. It delegates all dates, proration, credit, and arithmetic to the original `projectSubscriptionBilling()` result. The original English `subscriptionBillingLines()` and the financial projection are unchanged. Transaction and retry identity, plan/cadence keys, authorization, payment confirmation behavior, and provisioning remain unchanged.

Human-facing labels, validation messages, empty/error states, actions, accessibility text, toasts, and status labels are localized. Stable API values, invoice IDs, plan keys, authored gym/plan names, historical activity and audit text, and exact-name destructive confirmations stay unchanged. The ledger export localizes its introductory presentation while retaining its CSV header and row-value contract. Gym and plan names and Latin identifiers are isolated for bidirectional display. The shared `SubscriptionStatusBadge` supplies localized known status labels; unknown/raw values remain intact.

Locale-switch regression cases verify that subscription price/limits/reason, invoice amount/date/action reason, wizard reason and retry identity, and gym archive confirmation/reason remain intact through language changes. Tests assert exact minor-unit/API values and that plan keys and IDs are preserved.

## Validation

- Focused platform-finance Vitest command:
  `pnpm exec vitest run --configLoader runner --reporter=json --outputFile.json=/private/tmp/platform-finance-tests-final.json 'src/app/platform/gyms/[gymId]/gym-admin-detail.test.tsx' src/app/platform/gyms/page.test.tsx src/app/platform/subscriptions/page.test.tsx src/app/platform/billing/page.test.tsx src/app/platform/billing/bill-gym-wizard.test.tsx src/app/platform/billing/gym-subscriptions.test.tsx src/lib/platform/subscription-billing.test.ts`
  Result: 7 files passed, 51 tests passed, 0 failed.
- Catalog consistency command:
  `pnpm exec vitest run --configLoader runner --reporter=json --outputFile.json=/private/tmp/platform-finance-messages-final.json src/lib/i18n/messages.test.ts`
  Result: 10 tests passed, 0 failed.
- Focused ESLint over the listed finance implementation, test and catalog files with `--max-warnings=0`: passed.
- `python3 docs/arabic/verify-lock.py`: passed, revision 607, 247 exact agreements, both approvals, 8 custom decisions, 1 note, checksum and registry match.
- `pnpm exec tsc --noEmit --incremental false --pretty false`: no errors in this packet. The concurrent whole-web check still reports errors outside this packet: nullable value passed to a string parameter in `apps/web/src/app/(app)/audit/page.tsx`, missing `isolateLtr` in `apps/web/src/features/crm/whatsapp-handoff.tsx`, and an Arabic `audit.description` literal mismatch in `apps/web/src/lib/i18n/messages/ar/index.ts`.

## Remaining limits

The existing renderer already localizes Unicode invoices and signed agreements. This packet does not alter those renderers or previously signed documents. The whole-web typecheck should be repeated after other parallel packets resolve their outstanding errors. No production send, deployment, or billing transaction was performed.
