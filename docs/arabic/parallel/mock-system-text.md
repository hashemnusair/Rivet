# Mock system-text descriptors

## Scope

The mock adapter now attaches optional `titleMessage` and `bodyMessage` descriptors to its operational notification and timeline producers where an existing `communicationCompletion` key precisely represents the system-authored text. Stored English titles and bodies, names, plan/class/trainer/branch labels, reasons, custom notes, and audit payloads remain unchanged.

Files changed for this packet:

- `apps/web/src/lib/mock/MockGymOSApi.ts` — descriptor import and narrowly selected mock event producers. This shared file also contains parallel edits by the export and CRM packets; do not attribute those edits to this packet. The export methods around lines 9612–9800 and CRM regions around lines 4047–4060, 4390–4402, and 7480–7510 were left untouched here.
- `apps/web/src/lib/mock/MockGymOSApi.system-messages.test.ts` — ten focused presentation tests.
- `docs/arabic/parallel/mock-system-text.md` — this handoff.

## Descriptor coverage

Existing keys from `apps/web/src/lib/i18n/system-messages.ts` and the registered `communicationCompletion` catalogs are used for:

- Membership creation, sale, renewal, plan change, term dates, freeze/unfreeze, extension, cancellation, and transfer.
- Imported opening balance, historical payment evidence, and membership-history notes; amounts, dates, plan names, and references use typed/verbatim parameters.
- Payment collection, retail sale, refund, and void; amount/currency and payment method remain typed parameters.
- PT booking, rescheduling, cancellation, completion/no-show, package request, and package cancellation; trainer/package names remain verbatim parameters.
- Included PT-credit grant and unused package-credit refund counts; the refund reason remains the stored authored body.
- Class booking/waitlisting, cancellation, gym cancellation, and waitlist promotion, including a typed class date.
- Member and lead contact outcomes use the finite `contactOutcome` enum. The exact `whatsapp_opened` outcome keeps its dedicated handoff descriptor; unknown enum values fall back to the stored title.
- Task creation/follow-on and completion titles; contact-driven task completion has a finite outcome descriptor, while manual completion outcomes remain authored.
- Retention snooze dates, lead capture/conversion/contact updates, trial scheduling date/time, offer responses/delivery channel/reference, check-in, WhatsApp handoff, marketing preference changes, and notes.
- Seeded PT booking/reschedule notifications and the support-reply notification. The support subject remains authored content.

No catalog keys or translations were added in this packet. Descriptor parameters are sourced from the corresponding typed mock records or operation inputs; the adapter does not parse arbitrary authored strings to reconstruct parameters. English presentation keeps the original stored text. Arabic presentation localizes only when the descriptor validates; authored reasons and notes continue to render as written.

Some records intentionally have no descriptor: custom reasons and notes, support subjects, manual task outcomes, PT activation/revocation/introductory-grant events with no corresponding mock timeline row, the PT refund body (the mock stores the reason only, unlike Convex's amount-plus-reason body), and retail-refund text whose meaning is not the generic payment-refund key. Mock bulk tag add/remove and duplicate-merge operations create no timeline rows, so none were introduced. The trial timeline stores date/time but not the booking's authored goal; its descriptor therefore leaves the goal out. Lead conversion currently creates a title-only timeline record, so no conversion body descriptor is attached. Seeded renewal/risk and platform notifications were not inferred from their English bodies. The descriptor presenters retain the existing exact-match legacy fallback for older records.

## Validation

Run from `apps/web`:

- `pnpm exec vitest run --configLoader runner src/lib/mock/MockGymOSApi.system-messages.test.ts` — passed, 10 tests.
- `pnpm exec vitest run --configLoader runner src/lib/i18n/system-messages.test.ts src/lib/mock/MockGymOSApi.test.ts src/lib/mock/MockGymOSApi.system-messages.test.ts` — passed, 211 tests.
- `pnpm exec eslint src/lib/mock/MockGymOSApi.ts src/lib/mock/MockGymOSApi.system-messages.test.ts` — passed.
- `git diff --check -- apps/web/src/lib/mock/MockGymOSApi.ts apps/web/src/lib/mock/MockGymOSApi.system-messages.test.ts` — passed.

The primary agent will run the final web/Convex typecheck on stabilized shared source; a duplicate local full-web typecheck was stopped at the primary's request to reduce concurrent compiler load.

The focused tests assert Arabic payment/membership/PT/class rendering, retain the English original for those events, and keep authored membership reasons and support subjects unchanged. The class waitlist test checks localized date formatting.

## Limits

These are mock-adapter records only. They add no persistence migration and do not change notification routing, communication language selection, authorization, payment behavior, or the public export APIs. This packet was not committed and made no production calls.
