# Communications and event descriptors — Claude packet

Branch `codex/arabic-comms-claude`, base `843824f4f3ff97d96bdb22901dbfa78f1eb8f512`. Commits are local only. Nothing was pushed or deployed, no provider secret was set, and no real email, SMS or WhatsApp message was sent. All evidence is mocks, fake providers and dry local renders.

Cherry-pick in this order:

1. `3563a87` Add recipient-language and system-message descriptor foundations. This commit stands alone: both typechecks and its tests pass at that commit.
2. `a89e9e3` Send outgoing messages in the recipient's language and attach event descriptors.
3. The commit that adds this document and `claude-communications-evidence/`.

## 1. What changed, by file

New shared pure modules (no React, no Convex):

- `apps/web/src/lib/i18n/communication.ts`: `resolveRecipientLanguage(preference, orgDefault)` returns `{ language, source }`. The order is the recipient's stored `en`/`ar`, then the gym's `defaultLanguage`, then English. `users.uiLocale` is never an input.
- `apps/web/src/lib/i18n/system-messages.ts`: `SystemMessage` descriptors, `systemMessage()`, `isRenderableSystemMessage`, `renderSystemMessage`, `presentSystemText`, `presentNotification`, `presentTimelineEvent`, `legacyNotificationMessages` and `legacyTimelineMessages`.
- `apps/web/src/lib/i18n/messages/{en,ar}/communicationCompletion.ts`: the paired namespace. The index files were not edited.

New Convex modules:

- `convex/systemMessages.ts`: the descriptor validator.
- `convex/gymApplicationEmail.ts`: the applicant's copies (received, approved, rejected).
- `convex/_generated/api.d.ts`: I added the two module entries by hand, in codegen's sorted format. **Codex: run `pnpm convex:codegen` to confirm.** I did not run it because it pushes to the dev deployment.

Schema and contract changes (all additive and optional):

- `operationalNotifications.titleMessage/bodyMessage`
- `operationalEmailDeliveries.languageSource/copyVersion`
- `renewalDeliveries.languageSource/catalogueVersion/renderedBody/renderedTemplateKey/renderedAt`
- `gymApplications.language`
- `GymOSApi.ts`: `OperationalNotification.titleMessage/bodyMessage` and `SubmitGymApplicationInput.language`
- `types.ts`: `TimelineEvent.titleMessage/bodyMessage`
- Automation `messageDelivery` data (an untyped record) gains `languageSource`, `catalogueVersion`, `renderedBody`, `renderedLanguage` and `renderedAt`.

Edited backend files:

- `emailTemplate.ts`: footer, legal links, the member "sent for" line and the attachment line now come from the catalogue. Mono value cells are `dir="ltr"`; other values are `dir="auto"`.
- `operationalEmail.ts`: copy comes from the catalogue. Added `operationalEmailContent`, typed receipt/invoice `facts` rows, a localized status chip, `OPERATIONAL_EMAIL_COPY_VERSION`, and language-source recording. Failure notifications carry descriptors.
- `messagingTemplates.ts`: catalogue 1.1 with the Arabic 1.0 bodies archived. Added `catalogueTemplateAt` and `MESSAGE_TEMPLATE_VERSION`. The current marketing footer asks recipients to contact the gym directly; it does not claim that STOP is handled automatically.
- `messagingWorker.ts`: queued language and body snapshot (see §2). Date variables are formatted per recipient. Outcome timeline rows and failure notifications carry descriptors.
- `automations.ts`, `renewalJobs.ts`: language and catalogue version are captured at queue time. Renewal timeline rows carry descriptors.
- `followupAssist.ts`: falls back to the gym default for the member's language. Reminder dates are localized. Added `followUpHandoffDraft`.
- `gymApplications.ts`: stores the applicant's language and sends Arabic applicant copies. The internal team copy stays English.
- `membershipJobs.ts`, `ptJobs.ts`: resolve the recipient's language. Notifications store English plus a descriptor. Previously the PT reminder stored an Arabic body formatted with ICU `ar-JO`.

Callsites edited outside the initial files, each only to resolve language or attach descriptors:

- `domain.ts`: every email caller, payment receipt facts, invoice facts with a shared notice/PDF language, all notification creators, and about 40 timeline creators.
- `classes.ts`
- `operations.ts`
- `invitations.ts`
- `legalAgreement.ts`: notification only.
- `platformProvisioning.ts`: notification titles only.

Tests (new or edited):

- New: `src/lib/i18n/system-messages.test.ts`, `convex/communicationLanguage.test.ts`, `convex/gymApplicationEmail.test.ts`.
- Edited: `gymApplications.email-queue.test.ts` (a new Arabic applicant case), `emailTemplate.test.ts`, `operationalEmail.test.ts`, `followupAssist.test.ts`.

## 2. Inventory, language selection, version and retry behaviour

| Path | Recipient language | What is frozen for retries |
| --- | --- | --- |
| Operational email (`enqueueOperationalEmail`): receipts, renewal/expiry, PT ×5, trial ×2, support ×3, platform invoice ×4, subscription ×2 | Member/consumer record's language, then gym default. Gym-addressed mail (support, platform billing) uses the gym default. The source is recorded as `explicit`/`recipient`/`organization`/`default`. | Subject, HTML, text and attachments are rendered once and stored. Retries resend the stored bytes. Stored fields: `templateVersion`, `language`, `copyVersion`. |
| Platform invoice email + PDF | Gym default, resolved once and passed to both the email and the existing Unicode PDF renderer (`pdfDocument`/`platformInvoicePdf`) | The stored attachment bytes. The filename stays ASCII (`RIVET-invoice-<number>.pdf`). |
| Agreement copies (`legalAgreementEmail.ts`) | Unchanged: the agreement packet's language. RIVET's own copy stays English. | Already stored. Signed versions, hashes and bytes are untouched. |
| Gym application (applicant) | `language` sent by the public form. Absent means English. Older rows are English. | Stored bytes. Template versions bumped to `-v2`. |
| Gym application (RIVET team), agreement RIVET copy | English (internal) | — |
| WhatsApp automation `messageDelivery` | Captured at queue time (`language`, `languageSource`, `catalogueVersion`). A legacy row without a language uses the recipient's current preference. An explicit `en` now stays `en`. | On first lease, `renderedBody` and `renderedLanguage` are captured; every retry reuses them. A legacy row without `catalogueVersion` renders catalogue 1.0. |
| WhatsApp renewal `renewalDeliveries` | Captured at creation, with the gym fallback | First lease captures `renderedBody`. Retries reuse it. |
| Staff WhatsApp handoff | `followUpHandoffDraft(recipient, gym, orgDefault)` and `renderReminderForMember` use the member's language | It is a draft. Opening it logs `whatsapp_opened` only and never marks anything sent. |
| SMS | Retired channel (14 Sep 2026). Rows still drain with a recorded refusal. | — |

Consent, quiet hours, opt-out, marketing suppression, email modes, gym live/sandbox, allowlist/sandbox routing, tenant/branch scoping, dedupe keys and lease/retry identities are unchanged. No test needed loosening.

The content freeze point is the first lease, not enqueue time. The language and catalogue version are captured in the queued row, but the body is rendered on first lease; dynamic substitutions that are read from current member/gym records (and an edited custom gym template) can therefore change before that lease. Once `renderedBody` and `renderedLanguage` are stored, retries reuse them unchanged.

## 3. Descriptors and the UI consumers Codex must wire

How descriptors work:

- **Shape:** `{ key, params? }`.
- **Parameter kinds:**
  - a string: verbatim text, isolated, never translated
  - a number: a count, which drives `plural()`
  - `{date}` — `YYYY-MM-DD`
  - `{at}` — ISO instant, rendered in the reader's gym time zone
  - `{clock}` — `HH:MM`
  - `{amountMinor,currency}`
  - `{enum: channel|paymentMethod|messageContext, value}`
  - `{message}` — a nested descriptor
- **Validation:** an unknown key, a missing or malformed parameter, or an unknown enum value renders the original text.
- **English readers:** they always see the stored original.

Rendering points (UI files owned by Codex/Luna; I did not edit them):

1. `src/components/shell/notification-center.tsx:145-150`: render the title, body and `aria-label` through `presentNotification(n, { locale, t, format })`. `format` comes from `useFormat`, in the gym's time zone.
2. `src/components/shared/timeline-feed.tsx:118,129`: use `presentTimelineEvent(event, ctx)`. This covers member tabs (`features/members/member-tabs.tsx:69,135`), lead detail (`crm/leads/[leadId]/lead-detail.client.tsx:296`) and the owner dashboard (`features/dashboard/owner-dashboard.tsx:163`).
3. `src/features/crm/whatsapp-handoff.tsx`: replace the English-only `defaultWhatsAppMessage` with `followUpHandoffDraft` (from `convex/followupAssist`), using the recipient's `preferredLanguage` and the gym default, never `useLocale`. The handoff note (`whatsAppHandoffNotes`) is stored as authored note text and stays as written.
4. Public gym application form (`components/public` / signup): pass `language: locale` to `submitGymApplication`.
5. `src/lib/mock/MockGymOSApi.ts`: mock records carry no descriptors. The presenters' legacy projection covers their fixed titles; parameterised mock titles stay English.

## 4. Decisions and rules applied

Decision IDs applied in context:

- Voice: `voice`, `politeness` (يرجى), `address`, `buttons`
- Formatting: `plural` (عدد المحاولات: {count}, plus true six-form plurals), `digits`, `calendar`, `months`, `money-format`, `time-format`, `brand`
- Receipts and payments: `receipt` (وصل دفع), `receipt-email` (إيصال دفعتك), `payment`, `collect-payment`, `unpaid`, `cash` (via `domain.paymentMethod`), `refund`, `void-payment`, `cash-difference`, `invoice`
- Memberships: `membership` (اشتراك everywhere; no عضوية remains in the communication files), `extend`, `freeze`, `unfreeze`, `change-plan`, `home-branch`, `renewal-message`, `ends-tomorrow`
- Classes and personal training: `class`, `waitlist`, `cancel-booking`, `cancel-class`, `session`, `trainer`, `package`, `credits`, `return-credit`, `mark-complete`
- Desk and sales: `allow-entry`, `check-in`, `trial`, `lead`, `assigned-to`, `lost-lead`, `offer`, `reception` (الاستقبال instead of كاونتر)
- Messaging: `whatsapp`, `sent` (تم الإرسال for provider-accepted), `consent`
- Platform and support: `support-case`, `reopen`, `past-due`, `suspended`, `owner`, `staff`, `gym-applications`
- Legal: `terms` (شروط الاستخدام in footers), `privacy`

Interpretations:

- **No-show:** timeline sentences use the gender-neutral "تم تسجيل عدم الحضور…". The approved label `لم يحضر` would presuppose a masculine subject here.
- **Unsubscribe:** "إيقاف تلقي الرسائل التسويقية", which avoids اشتراك (membership).

Tested rules:

- All six Arabic plural categories.
- Placeholder parity between English and Arabic for every leaf.
- Exact positive and negative JOD amounts.
- Instants are shown on the gym's calendar day, so 7 Oct 21:30Z appears as 8 تشرين الأول.
- Midnight and noon (`12:00 ص` / `12:00 م`).
- Mixed Arabic/Latin names, `<`/`&`/`'` escaping, URLs, phones and references kept verbatim.

## 5. Commands and results (run from `apps/web`)

- `python3 docs/arabic/verify-lock.py` (repo root): PASS (revision 607, 247 agreements).
- `npx tsc --noEmit` and `npx tsc --noEmit -p convex/tsconfig.json`: clean, both at HEAD and at `3563a87` alone.
- `pnpm lint` (secret audit plus `eslint --max-warnings 0`): passed.
- `npx vitest run`: 1901 passed, 1 failed of 1902 (306 files). The failure is `src/components/public/entry-pass-dialog.test.tsx` ("explains a failed request…", a `toHaveTextContent` mismatch). It fails identically on the untouched base, so it is unrelated.
- Focused suites, all passing: `src/lib/i18n` (75 tests, including catalogue parity and approved decisions), `convex/communicationLanguage.test.ts` (9), `convex/gymApplicationEmail.test.ts` (2), `gymApplications.email-queue` (13), messaging worker / renewal / automation / follow-up (57), and operational email, email template, legal agreement and invoices.
- Base-commit failure I fixed: `emailTemplate.test.ts` expected the old 24-hour Arabic support hours. The brand token already uses the approved 12-hour clock.
- Descriptor sweep (temporary, reverted): I instrumented every notification and timeline insert to throw on a non-renderable descriptor and ran all 600 Convex tests. 395 descriptors across 60+ keys were written, none invalid.
- `git diff --check`: clean.

Coverage of the required proofs:

- **UI locale does not change recipient language:** platform admin `uiLocale` en/ar against gyms in ar/en; owner `uiLocale` against member reminders.
- **Retries after preference changes keep the queued language and body:** automation and renewal.
- **Legacy rows:** 1.0 wording, and an explicit `en` kept.
- **Gym-default fallback:** covered.
- **Tenant isolation of notifications:** covered.
- **Arabic PDF glyphs in the emailed invoice attachment:** covered.

Evidence in `docs/arabic/parallel/claude-communications-evidence/`:

- Receipt and past-due invoice emails, in English and Arabic, as `.html` and `.txt`
- Gym application received, in English and Arabic
- WhatsApp catalogue 1.1 rendered in both languages
- Arabic descriptor samples

The invoice PDFs are not committed because each is about 600 KB. Regenerate them with `RIVET_PDF_FIXTURE_DIR=<dir> npx vitest run convex/platformInvoiceArabic.test.ts`.

## 6. Preserved content, exceptions and blockers

What is preserved unchanged:

- Stored original English titles and bodies, sent-message history, audit payloads, signed agreements, and custom gym templates (`bodyEn`/`bodyAr` as authored).

Text that never gets a descriptor:

- Notes, reasons, task titles, tags, support subjects, rule names, provisioning and provider error text, renewal suppression reasons, and opening-balance or historical-import notes. Bodies that only join names are left without one too.

Historical projection rules:

- A legacy record is projected only on an exact kind/type plus whole-text match. Only a count, date, channel or error code that the system itself wrote is recovered. A legacy timeline title containing a name or amount (for example "Payment collected — JOD 25.000 cash") is not parsed, so it stays English.

Limitations and live-release blockers:

- The current 1.1 marketing footer is request-only in both languages. RIVET has no inbound WhatsApp STOP/إيقاف handler; `convex/http.ts` currently routes only Resend, and the messaging-mode readiness check does not enforce an inbound opt-out integration. Do not flip live until a supported inbound/opt-out path is implemented and verified.
- Staff can record and audit explicit opt-out for an existing member through the member editor. There is no supported lead preference control/API before conversion; leads with unknown preference are suppressed. Do not promise a lead recipient that staff can update a lead preference until that path exists, and keep lead marketing suppressed.
- Meta approval is not represented by the internal catalogue version or category. The revised Arabic 1.1 WhatsApp bodies need Meta approval before live; the current approval state is not verified.
- Gym-staff recipients use the gym default. Staff have no separate communication preference, and their `uiLocale` is deliberately not used.
- Mock-adapter descriptors (§3.5).
- The Convex CLI `codegen` command does not activate deployed code, but it POSTs the bundle to the selected deployment's `/api/deploy2/start_push` endpoint before generating local bindings. `--dry-run` prints generated configuration rather than generated types. No codegen command was run under the no-network review constraint.
- The UI wiring in §3.
