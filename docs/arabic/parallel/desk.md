# Reception and dashboard Arabic completion

Implemented in `/Users/eliashreish/.codex/worktrees/complete-arabic-support/Rivet2` against the approved Arabic revision 607. Only the reception/dashboard surfaces and the registered `deskCompletion` catalogs were changed for this packet.

## Owned files

- `apps/web/src/app/(app)/reception/page.tsx`
- `apps/web/src/app/(app)/reception/reception.test.tsx`
- `apps/web/src/features/reception/checkin-copy.ts`
- `apps/web/src/features/reception/checkin-copy.test.ts`
- `apps/web/src/features/reception/reason-codes.ts`
- `apps/web/src/features/reception/reception-dialogs.tsx`
- `apps/web/src/features/dashboard/charts.tsx`
- `apps/web/src/features/dashboard/dashboard-scope.ts`
- `apps/web/src/features/dashboard/dashboard-scope.test.ts`
- `apps/web/src/features/dashboard/manager-dashboard.tsx`
- `apps/web/src/features/dashboard/owner-dashboard.tsx`
- `apps/web/src/features/dashboard/reception-dashboard.tsx`
- `apps/web/src/features/dashboard/sales-dashboard.tsx`
- `apps/web/src/features/dashboard/today-queue-copy.ts`
- `apps/web/src/features/dashboard/today-queue-copy.test.ts`
- `apps/web/src/features/dashboard/today-queue.tsx`
- `apps/web/src/features/dashboard/today-queue.test.tsx`
- `apps/web/src/lib/i18n/messages/en/deskCompletion.ts`
- `apps/web/src/lib/i18n/messages/ar/deskCompletion.ts`

## Decision and key mapping

- `dashboard` and `reception` decisions: dashboard titles, daily work, desk access, branch selection, manager/reception/sales measures and actions use `deskCompletion.dashboard.*` and `deskCompletion.reception.*`.
- `check-in`, `already-inside`, `allow-entry`, `entry-blocked`, `no-valid-membership`, `wrong-branch`, `no-visits`, and `qr-code`: reception lookup prompts, verdicts, duplicate scans, reasons, generated outcomes, override copy, and scan/access guidance use `deskCompletion.reception.lookup.*`, `.verdict.*`, `.message.*`, `.reason.*`, and `.override.*`. `REASON_CODE_KEYS` types canonical backend reason codes against the translated labels; stored reason codes and admission decisions are unchanged.
- `plural`: reception visit/match/expiry counts and dashboard outstanding-member/trial/queue counts use typed plural entries with all six Arabic categories (`zero`, `one`, `two`, `few`, `many`, `other`). Dynamic counts stay Latin digits.
- Formatting contract `digits`, `calendar`, `months`, `money-format`, and `time-format`: dashboard chart/queue/metric values and reception money, dates, timestamps and counts use the shared locale formatter with the organization timezone, Gregorian Jordanian month names, Arabic 12-hour time, and Latin digits. Chart labels also expose translated accessible names.
- Cash wording follows the contextual decisions for `cash-method`, `counted-cash`, and `cash-variance`; the UI continues to use the existing cash-shift and permission rules.
- Queue presentation only translates known generated status/checklist/shift/facility/equipment strings. Arbitrary task titles, notes, member names and historical free text remain authored. Reception status localization likewise requires an exact known generated message; unmatched server/authored text remains untouched. Search comparison, QR/scanner values, drafts, retry values, query parameters, canonical reason keys, permissions, and stored history remain unchanged.

The English catalog no longer narrows every leaf to an exact English string, so the Arabic catalog can satisfy its structural message type while providing translated values.

## Validation

Run from `apps/web`:

```sh
pnpm exec vitest run 'src/app/(app)/reception/reception.test.tsx' 'src/features/reception/checkin-copy.test.ts' src/features/dashboard/today-queue.test.tsx src/features/dashboard/today-queue-copy.test.ts src/features/dashboard/dashboard-scope.test.ts 'src/app/(app)/dashboard/page.test.tsx' src/lib/i18n/dictionary.test.ts
```

Result: 7 files passed, 59 tests passed. Coverage includes Arabic scans preserving the exact scanned value across a locale switch, a successful Arabic member-number scan with the translated welcome copy, override drafts preserved verbatim through locale changes, reason presentation, known versus unknown generated messages, queue Arabic presentation with authored text and destinations intact, Latin count digits, and the Amman date boundary. The normal welcome projection requires the sole canonical `OK` reason, the `allowed` decision and the exact generated English message.

Focused ESLint over all 19 owned implementation/catalog/test files passed.

`pnpm exec vitest run src/lib/i18n/messages.test.ts` was also run as a broader catalog check. The desk catalog’s approved-decision checks passed, but the suite has six failures in other concurrently edited namespaces: plural/placeholder/raw-English checks for `publicCompletion`, an empty string in `platformConsole`, raw-English hits in `crmCompletion`, `platformFinance`, and `publicCompletion`, plus Arabic text in the English `publicCompletion` catalog. These failures are outside this packet.

`pnpm exec tsc --noEmit --incremental false` was run. It reports errors only in concurrently edited platform/CRM/shared catalog files (`platform/gyms/[gymId]/gym-admin-detail.tsx`, `features/crm/whatsapp-handoff.tsx`, and `lib/i18n/messages/ar/index.ts`); it reported no errors in the owned reception/dashboard code or `deskCompletion` catalogs.

## Shared surfaces and limitations

`TimelineFeed` remains with the primary/Claude descriptor packet; this work did not change its shared rendering. There is no notification-center component or notification backend under the reception/dashboard ownership boundary, so those surfaces were not included here. The shared notification and timeline presentation wiring is a separate primary-assigned integration packet. Reused shared status chips retain their component ownership.
