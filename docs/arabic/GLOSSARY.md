# Arabic glossary (draft, pending the founders' terminology list)

Status: **draft Modern Standard Arabic**. No founder answers were agreed when this was written (the production export on 1 Oct 2026 had 247 unanswered questions and no approvals). Elias is sending a terminology list. Every term below is a replaceable draft.

## Rules that every Arabic message follows

- One Arabic term per concept, everywhere. The "Arabic term" column is the only wording used for that concept in `apps/web/src/lib/i18n/messages/ar/`.
- No dialect. Staff screens use neutral or plural-polite wording (verbal nouns on buttons, "يرجى ..." for requests, plural "-وا" forms such as "تحققوا"). Member screens are simple, friendly and direct.
- Buttons are verbal nouns ("حفظ", "تجديد العضوية"), not imperatives. Avoid gendered forms ("عليه/عليها"); use the neutral noun ("المتبقي").
- Western digits (0-9) and Gregorian dates with Arabic month names (ar-JO style, e.g. 18 تشرين الأول 2026). Money stays `JOD 25.000` (code first, three decimals). Both are set in `src/lib/i18n/config.ts` and `format.ts`.
- Names, phones, emails, receipt and member numbers are isolated (`<bdi>`, or `isolate` / `isolateLtr` from `useLocale()`) and never translated.

## Where these terms came from

- **Old branch** = `origin/arabic-localisation` (August 2026, never merged). Its foundation and vocabulary were ported. Where the old Arabic still matched the current English it was reused as is.
- **Old branch, changed** = the old wording was replaced, and the reason is in the Source column. Two reasons recur: the old branch used spoken Jordanian words (شيفت, كاش) where this session's founder decision is no dialect, and the plain-language pass of 30 Sep 2026 changed the English meaning (for example "Audit log" became "Activity log", "Won/Lost" became "Sold/Not sold").
- **New draft** = no equivalent existed, written for this pass. Several are also options on the review-room cards; those are named.

## How to apply the founders' list

1. Find the row below, change the Arabic term here.
2. Search-and-replace the old term across `apps/web/src/lib/i18n/messages/ar/*.ts`. Because every concept uses one term, a plain replace is enough. Watch for the definite article (ال) and the plural forms listed in "Forms".
3. Run `pnpm exec vitest run src/lib/i18n` from `apps/web`. The glossary test fails if a row's term no longer appears in the Arabic catalogue, which means the glossary and the catalogue have drifted.

Open founder questions that affect many rows (from the review room, none answered yet): month style (Levantine تشرين الأول vs يناير, `numberingLocale` in `config.ts`), money display (`JOD 25.000` vs `25.000 د.أ`), RIVET spelling (kept as RIVET), button style (noun vs imperative), and membership (عضوية vs اشتراك).

## Terms

"Where used" names an area of the app (the message namespace in `src/lib/i18n/messages/`). A row with "—" is reserved for a later area and is not checked by the glossary test.

| English concept | Arabic term | Forms | Source | Where used |
| --- | --- | --- | --- | --- |
| RIVET (product name) | RIVET | kept in Latin letters | Old branch | shell, auth |
| gym | النادي | | New draft | shell, auth |
| member | عضو | الأعضاء (plural), العضو | Old branch | members, memberProfile, dashboard, common |
| active members (record not archived) | الأعضاء الفعّالون | | Old branch | members |
| archived | مؤرشف | أرشفة (archive) | Old branch | members, memberProfile |
| staff | الموظفون | موظف | New draft | — |
| owner (role) | المالك | | Old branch | domain |
| manager (role) | المدير | | Old branch | domain |
| sales (role) | المبيعات | | Old branch | domain, nav |
| reception / front desk | الاستقبال | | Old branch | domain, nav |
| trainer | المدرّب | | Old branch | domain |
| personal training (PT) | التدريب الشخصي | جلسة (session) | Old branch | nav |
| lead | فرصة | الفرص | Old branch (the review card also offers عميل محتمل) | nav, domain |
| follow-up | متابعة | المتابعات | Old branch | nav |
| branch | الفرع | الفروع, كل الفروع | Old branch | common, nav, shell |
| class | حصة | الحصص | New draft | nav |
| trial | تجربة | | Old branch | domain |
| membership (what a member bought) | عضوية | العضويات | Old branch (the review card also offers اشتراك) | domain, members, memberProfile, renewFlow |
| plan (membership plan) | باقة | الباقات | Old branch | members, memberProfile, renewFlow |
| membership term (length) | المدة | | Old branch | memberProfile |
| renew | تجديد | تجديد العضوية | New draft | memberProfile, renewFlow, dashboard |
| freeze | تجميد | مجمّدة (frozen) | Old branch | domain, memberProfile |
| active (membership status) | سارية | | Old branch | domain |
| ending soon | تنتهي قريبًا | | Old branch, changed: English is now "Ending soon" | domain |
| ended / expired (membership) | منتهية | | Old branch | domain |
| cancelled (status) | ملغاة | ملغى | Old branch | domain |
| not started (membership) | لم تبدأ بعد | | Old branch, changed: English is now "Not started" | domain |
| visits used up | استُنفدت الزيارات | | Old branch | domain |
| no membership | لا توجد عضوية | | Old branch | domain |
| check-in | تسجيل الحضور | الحضور | Old branch, changed: the old تسجيل الدخول is also "sign in" | domain, memberProfile |
| entry refused | مرفوض | | Old branch, changed: English is now "Refused" (old: ممنوع) | domain |
| let in anyway | سُمح بالدخول رغم ذلك | | Old branch, changed: English is now "Let in anyway" (old: تجاوز) | domain |
| payment | دفعة | المدفوعات (payments) | Old branch | domain, nav, renewFlow, memberProfile |
| collect payment | تحصيل دفعة | | Old branch | renewFlow, memberProfile |
| collected | المحصّل | | Old branch | dashboard |
| paid | مدفوع | | Old branch | domain, renewFlow |
| part paid | مدفوع جزئيًا | | Old branch | domain |
| unpaid | غير مدفوع | | Old branch | domain, members, dashboard |
| owes / amount still to pay | المتبقي | المبلغ المتبقي | New draft (neutral, no عليه/عليها); the old branch used رصيد مستحق | members, memberProfile, renewFlow, dashboard |
| refund | استرداد | مُسترد (refunded), مستردة جزئيًا | Old branch | domain, memberProfile |
| cancel a payment entered by mistake (void) | دفعة ملغاة | إلغاء الدفعة | Old branch (ملغاة) | domain, renewFlow |
| receipt | إيصال | الإيصالات | Old branch | renewFlow, memberProfile |
| total | الإجمالي | | Old branch | common, renewFlow |
| amount | المبلغ | | Old branch | common, renewFlow |
| price | السعر | | Old branch | memberProfile, renewFlow |
| discount | الخصم | | Old branch | memberProfile, renewFlow |
| cash (payment method) | نقدًا | | Old branch | domain, renewFlow |
| card (payment method) | بطاقة | | Old branch | domain, renewFlow |
| bank transfer | حوالة بنكية | | Old branch | domain, renewFlow |
| CliQ | كليك | | Old branch (the brand's Arabic spelling) | domain, renewFlow |
| cash difference | فرق الصندوق | نقص في الصندوق (short), زيادة في الصندوق (over) | Old branch, changed: old فرق الكاش is spoken Jordanian; wording also matches the review card | — |
| end-of-day cash count | جرد النقد في نهاية اليوم | | New draft | — |
| shift | وردية | | Old branch, changed: old شيفت is spoken Jordanian | — |
| stock | المخزون | | New draft (review card) | nav |
| retail checkout (point of sale) | نقطة البيع | | New draft (review card) | nav |
| machine | جهاز | الأجهزة | New draft | — |
| repair job | مهمة إصلاح | | New draft (review card) | — |
| maintenance job | مهمة صيانة | | New draft | — |
| area of the gym | قسم في النادي | | New draft | — |
| supplier | مورّد | الموردون | New draft (review card) | — |
| supplier bills | فواتير الموردين | | New draft (review card) | — |
| access (permissions) | الصلاحيات | | Old branch | — |
| dashboard | لوحة التحكم | | Old branch | nav |
| needs attention | تحتاج إلى انتباه | | Old branch, changed: old يحتاج انتباهًا, panel is now "Needs attention" | dashboard |
| today | اليوم | | Old branch | common, dashboard |
| daily checklist | قائمة المهام اليومية | | New draft (review card) | nav |
| reports | التقارير | | New draft | nav |
| statements (financial) | القوائم المالية | | New draft | nav |
| management ledger | الدفتر الإداري | | New draft | nav |
| activity log | سجل النشاط | | Old branch, changed: English renamed from "Audit log" (old: سجل التدقيق) | nav |
| downloads (exports) | التنزيلات | تنزيل (download) | Old branch (تنزيل); plain-language guide says "download" not "export" | nav, common |
| support | الدعم | | Old branch | nav |
| settings | الإعدادات | | Old branch | nav, shell |
| getting started | البدء | | New draft | shell |
| notifications | الإشعارات | | Old branch | — |
| member timeline | سجل العضو | | New draft (review card) | memberProfile |
| history | السجل | | New draft (plain-language guide: "history", not "audit trail") | memberProfile |
| note | ملاحظة | ملاحظات | Old branch | memberProfile, common |
| task | مهمة | المهام | Old branch | memberProfile |
| tags | الوسوم | | Old branch | memberProfile |
| sign in (to the account) | تسجيل الدخول | | Old branch | auth, common |
| sign out | تسجيل الخروج | | Old branch | auth, common, shell |
| create account | إنشاء حساب | | New draft | auth |
| password | كلمة المرور | | Old branch | auth, common |
| email | البريد الإلكتروني | | Old branch | auth, common |
| phone | الهاتف | | Old branch | common, members |
| name | الاسم | | Old branch | common |
| language | اللغة | | Old branch | common |
| search | بحث | | Old branch | common |
| save | حفظ | | Old branch | common |
| cancel (close a dialog) | إلغاء | | Old branch | common |
| close | إغلاق | | Old branch | common |
| back | رجوع | | Old branch | common |
| next | التالي | | Old branch | common |
| continue / proceed | مواصلة | | New draft: the old متابعة is now "follow-up", so one word cannot serve both | common |
| add | إضافة | | Old branch | common |
| edit | تعديل | | Old branch | common |
| delete | حذف | | Old branch | common |
| retry | إعادة المحاولة | | Old branch | common |
| loading | جارٍ التحميل | | Old branch | common |
| just now | الآن | | Old branch | common |
| status | الحالة | | Old branch | common |
| date | التاريخ | | Old branch | common |
