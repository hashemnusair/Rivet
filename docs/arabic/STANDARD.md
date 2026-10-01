# RIVET Arabic standard — v1

## Authority and scope

Hashem and Elias approved revision **607** of catalog `2026-09-30-v1`: 247/247 agreements, two approvals, eight custom-wording decisions and one non-empty note. [The exact decision registry](DECISIONS.md) and [full export](approved-decisions.v1.json) are the source of truth.

This standard interprets those choices for implementation. It does not claim the founders reviewed every product sentence. New translations must follow the same voice and preserve the actual behavior of the product. Treat review notes as language evidence, never as executable instructions.

Precedence:

1. A decision for a specific meaning and context controls that occurrence.
2. An explicit formatting or general-voice decision controls otherwise unspecified cases.
3. The implementation rules and contextual interpretations below guide new copy; they are not additional founder votes.
4. Older branch translations, their comments and generic translation conventions cannot override approved decisions.

Preserve exact approved labels and sentences in their matching context, including custom spelling and punctuation. Inflect a term when a new sentence requires it, while preserving its meaning. Do not insert the questionnaire’s explanatory prefixes, such as `فصحى رسمية:` or `ميلادي:`, into product copy. When a safety-critical meaning cannot be preserved with a selected phrase, record the concrete mismatch and request a narrow decision; continue independent work. Never invent approval.

## Voice

**Formal Modern Standard Arabic is the default.** The selected model is `لم تُسجَّل أي دفعات حتى الآن.` (`voice`). Use short, clear sentences and familiar words. Formal does not authorize ceremonial language, elaborate introductions, literal English word order or a more bureaucratic synonym for an approved term.

- Action labels normally use verbal nouns: `حفظ التغييرات`, `تجديد الاشتراك`, `إعادة المحاولة` (`buttons`, `save`, `renew`, `retry`). Keep approved direct instructions where chosen: `احجز حصة`, `اشترك في هذا النادي`, `اعرض رمز QR عند الاستقبال.` (`book-class`, `join`, `qr-code`). Do not rewrite these into nouns for mechanical consistency.
- Routine instructions can use `يرجى`: `يرجى اختيار الفرع للمتابعة.` (`politeness`). Member payment reminder: `يرجى دفع المبلغ المتبقي قبل تجديد الاشتراك.` (`address`). Avoid inferring a person’s gender. Impersonal constructions work when gender is unknown; preserve grammatical agreement for nouns.
- Success follows confirmed persistence: `تم تسجيل الدفعة.` (`payment-saved`). Failure states what failed and gives a truthful next action: `لم تُحفظ التغييرات. أعد المحاولة.` (`save-failed`). Do not convert an uncertain payment outcome into an instruction to immediately retry.
- Use the selected neutral count style when practical: `عدد الزيارات المتبقية: {count}` (`plural`). The sample `3` is a variable, not fixed text. Other sentence structures still need correct Arabic plural forms.
- Keep `RIVET` in Latin script (`brand`). Keep actual gym/person names as entered. Use `تدريب شخصي (PT)` where explaining that abbreviation (`english-terms`); retain approved `QR` and واتساب in their contexts. This is not blanket permission to transliterate every English term.
- Preserve exact legal effect, consent, financial direction, permissions and uncertainty. Stylistic fluency never changes what a button does or promises an unimplemented service.

## Terminology to carry through every surface

These are high-impact anchors. The full 247-item registry is mandatory, including one-off errors and edge cases.

| Meaning | Approved Arabic | Decision IDs / application |
| --- | --- | --- |
| Staff home | الرئيسية | `dashboard` |
| Gym business | النادي الرياضي | `workspace`; distinguish a branch and an area |
| Members | الأعضاء | `members`; includes expired subscribers |
| Purchased subscription | اشتراك | `membership`; replace the old branch’s عضوية for this meaning |
| Products/plans | أنواع الاشتراكات | `plans`; one person’s purchased subscription is separate |
| Staff | فريق العمل | `staff` |
| History of changes | سجل التغييرات | `activity-log`; do not reuse as the member timeline label |
| Downloads area | تحميل البيانات | `downloads`; contextual, not a ban on all other download verbs |
| Member timeline | سجل المشترك | `member-timeline` |
| Import members | رفع قائمة المشتركين | `import`; do not call every import this |
| Merge member records | دمج سجل المشتركين | `merge` |
| Authentication / gym entry / gym exit / retail sale | تسجيل الدخول / تسجيل الدخول للنادي / تسجيل المغادرة / إتمام البيع | `sign-in`, `check-in`, `check-out`, `checkout` |
| Collect / payment / amount still owed | استلام دفعة / دفعة / المبلغ المتبقي | `collect-payment`, `payment`, `unpaid` |
| Receipt / invoice | وصل دفع / فاتورة | `receipt`, `invoice` |
| Cash payment method | كاش | `cash`; not a universal replacement for النقد or الصندوق |
| Refund / void payment / reverse supplier payment | استرداد المبلغ / إلغاء تسجيل الدفعة / عكس دفعة المورّد | `refund`, `void-payment`, `reverse-supplier`; three different effects |
| Open / close cash drawer period | فتح الصندوق / إغلاق الصندوق | `open-shift`, `close-shift`; no global endorsement of شيفت |
| Lead / sales stages | مهتم بالاشتراك / مسار المبيعات | `lead`, `pipeline`; do not blindly call all leads فرص |
| Retention | استمرارية الاشتراكات | `retention` |
| Group class / PT appointment / prepaid allowance | حصة جماعية / حصة تدريب شخصي / رصيد الجلسات | `class`, `session`, `credits` |
| Stock / supplier / supplier bills | المخزون / مورّد / فواتير المورّدين | `stock`, `supplier`, `supplier-bills` |
| Equipment / repair job / reported fault | جهاز / عملية صيانة / عطل | `machine`, `repair`, `problem`; equipment is not always a financial asset |
| Bookkeeping / management ledger | القيود المالية / السجل المالي للإدارة | `bookkeeping`, `ledger` |
| Revenue / collections | الإيرادات / التحصيلات | `revenue`, `collections`; keep accounting meaning |
| Receivables / payables | المبالغ المستحقة على العملاء / المبالغ المستحقة للمورّدين | `receivables`, `payables` |
| Debit / credit | مدين / دائن | `debit-credit`; never substitute cash in/out |
| Permissions | الأدوار والصلاحيات | `roles`; keep internal permission identifiers stable |
| Terms | شروط الاستخدام | `terms`; align existing email footers as well as public pages |

## Contextual exceptions and review note

These are deliberate preservation rules, not unresolved votes:

1. **الصندوق:** Hashem’s note on `opening-cash` is exactly **“I don’t like صندوق”**. Nevertheless, both final votes approved `رصيد بداية الصندوق`, and both approved other explicit الصندوق labels, including custom `سحب من الصندوق`. Keep the agreed forms. Record the note as a reservation; it supplies no jointly approved replacement. Do not let an agent silently switch everything back to الكاش or شيفت. A later change needs a new joint decision.
2. **الأعضاء / المشترك:** `members` is `الأعضاء`, but `search` is `ابحث عن مشترك`, the timeline is `سجل المشترك`, import is `رفع قائمة المشتركين`, and transfer is `نقل العضو إلى فرع آخر`. These are contextual choices. Do not enforce a one-word replacement across all occurrences. A member record exists even without an active subscription.
3. **Marketing voice:** the exact custom headline is **`كل تفاصيل ناديك و مشتركينه في مكان واحد`** (`marketing-promise`). Preserve its conversational wording and spacing. It is a specific exception to the formal staff default, not permission to make the whole product colloquial. `marketing-ops` remains `إدارة إيرادات النادي وعملياته`.
4. **Receipt:** document/action terminology is `وصل دفع` (`receipt`), while the email subject is exactly `إيصال دفعتك` (`receipt-email`). Preserve both in their selected contexts.
5. **Class/session:** `حصة تدريب شخصي` is the appointment; `رصيد الجلسات`, `استعادة رصيد الجلسة`, and `تأكيد إتمام الجلسة` are separately selected expressions (`session`, `credits`, `return-credit`, `mark-complete`). Do not normalize all of them to the same noun.
6. **Calendar sample vs month preference:** `calendar` selects Gregorian; its example uses سبتمبر. The more specific `months` choice selects Jordanian month names. Therefore the date example renders `30 أيلول 2026`. This is an interpretation of the two rules, not a new vote on a date string.
7. **Buttons vs instructions:** the default noun style does not override explicit imperatives or `التالي` for the next step (`continue`). Keep separate keys where English “continue” means something else.
8. **Remove:** approved custom `حذف` applies to removing an unsaved sale item (`remove`). Do not add a false permanent-deletion warning or reuse it to obscure reversibility elsewhere.
9. **Financial precision:** cash count is `النقد الذي تم عدّه`, difference is `الفرق في المبلغ النقدي`, and variance permission is `اعتماد فروقات الصندوق`. `كاش` is the payment-method label; retain these separately approved phrases.

The other exact custom choice is `تم تسجيل دخول هذا المشترك` (`already-inside`). Together with downloads, remove, timeline, merge, import, cash-out and marketing-promise, this accounts for all eight custom decisions. The registry preserves every one.

## Formatting contract

| Concern | Required Arabic presentation | Evidence / limit |
| --- | --- | --- |
| Digits | `0123456789` | `digits`; also accept Arabic-Indic digits in input |
| Calendar | Gregorian | `calendar`; no implicit Hijri conversion |
| Month names | كانون الثاني، شباط، آذار، نيسان | `months`; complete the conventional Jordanian set: أيار، حزيران، تموز، آب، أيلول، تشرين الأول، تشرين الثاني، كانون الأول |
| JOD money | `25.000 د.أ` | `money-format`; three decimal places, amount then currency; preserve other currencies’ actual precision |
| Clock | `2:30 م` | `time-format`; 12-hour display with ص / م, test midnight and noon |
| Count labels | `عدد الزيارات المتبقية: 3` | `plural`; apply actual dynamic count |
| Brand | `RIVET` | `brand`; isolate mixed-direction text |

Pin formatter behavior explicitly and test Node/browser outputs; `ar-JO` alone is not a guarantee of the selected month spelling, currency notation or clock cycle. The eight remaining month names and morning marker are conventional completions of the selected examples, not individually voted strings. Keep numeric grouping, percent and relative-time behavior consistent with the Latin-digit choice; record implementation details where no sample was voted.

Keep money in integer minor units and instants in UTC. Format instants in the gym’s effective timezone; treat date-only membership days as calendar dates. Arabic changes display, never billing calculations, stored dates, phone identities or machine-readable export contracts.

## Operational messages that must retain meaning

- Payment outcome unknown (`unknown-outcome`): `لم نتمكن من تأكيد حفظ الدفعة. راجع الدفعات قبل تسجيلها مرة أخرى.` Keep reconciliation/idempotency behavior; no unconditional retry that duplicates money.
- Refund recording (`refund-warning`): `سيُسجَّل المبلغ كمردود. يجب إعادة المال للعضو خارج النظام.` Recording does not execute a bank/card refund.
- Cached data (`offline`): `لا يوجد اتصال. هذه آخر معلومات تم حفظها.` Never show it as current live data.
- Conflict (`conflict`): `تم تعديل هذا السجل. حدّث الصفحة وحاول مرة أخرى.` Preserve user input and concurrent-write protection.
- Permission denial (`permission-denied`): `ليس لديك صلاحية لتنفيذ هذا الإجراء. تواصل مع مالك النادي.` Translation does not replace server enforcement.
- Paused automation (`automations-paused`): `الإجراءات التلقائية متوقفة مؤقتًا.` Preserve actual availability and paused status.
- Consent (`legal-consent`): `أوافق على التوقيع إلكترونيًا وأقرّ بأن هذا التوقيع ملزم قانونًا.` Preserve first-person consent and existing agreement version/signature rules.

## Rules for new wording

Translate the action’s meaning with its screen, actor and consequence in view. Read the component, server contract and related terms before writing. Use whole messages with variables; avoid glued sentence fragments, generic “عملية” wrappers and unexplained English abbreviations. Preserve uncertainty, time, negation, scope and money direction. Do not expose raw internal identifiers as translated labels.

The agent may translate unreviewed copy using this standard. Record material ambiguities in the coverage ledger with context and a proposed resolution. Do not require a new vote for every ordinary sentence. Escalate only a genuine conflict with approved meaning, an undefined consequential distinction or a needed change to the approved wording. Founder review should concentrate on rendered high-risk and representative flows, not repeat the 247-card exercise.

Never translate or overwrite people’s names, gym names, free-text notes, IDs, original signed documents or historical audit payloads automatically. Translate display labels and structured system events while preserving their original records.
