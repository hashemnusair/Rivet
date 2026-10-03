# Parallel Arabic completion handoff

The user explicitly authorized Luna Max parallel agents and a separate Claude task on 2026-10-03. The primary agent owns integration and final acceptance. All work extends the integrated main/Arabic history and approved revision 607; no production deployment or real outbound messages are authorized.

## Common rules

- Work in `/Users/eliashreish/.codex/worktrees/complete-arabic-support/Rivet2` unless your assignment explicitly specifies the separate Claude checkout. Always pass the workdir; the default cwd is the original untouched checkout. Escalated filesystem permission is needed for this managed checkout.
- Read root/app AGENTS.md, docs/arabic/README.md, STANDARD.md, full DECISIONS.md and locked approved-decisions.v1.json. Run verify-lock.py. Preserve FRONTEND_HANDOFF.md, saved review evidence and the lock.
- Each agent owns only its assigned files and its paired catalog namespace. Do not edit the catalog index files: every namespace is already registered. Do not modify another agent's files or restore/reset unrelated work. Shared source files, domain types or dependencies require coordination with the primary agent first.
- Keep technical enums, money minor units, canonical calendar values, IDs, API contracts, permissions and financial behavior. Use typed TKey/TFunction, useLocale/useT, useFormat/useFormattingTimeZone and real plural() objects with all Arabic categories. Arabic numeric input must normalize before validation; native number inputs discard non-ASCII digits.
- Existing pure helpers: lib/i18n/core.ts (createTranslator), formatters.ts, utils/text.ts (latinDigits/searchKey), utils/money.ts (readMoneyInput/parseMoneyInput). Search normalization must affect comparison only. Unknown authored/historical values remain original. Never translate stored user content or signed documents.
- Modern Standard Arabic, nominal actions, Latin digits, Jordanian Gregorian months, Arabic 12-hour time, JOD `25.000 د.أ`, unchanged RIVET. Exact approved contexts override generic wording. Approved cash method is كاش; drawers use الصندوق; receipt وصل دفع; email subject إيصال دفعتك; membership plans أنواع الاشتراكات; marketing line كل تفاصيل ناديك و مشتركينه في مكان واحد.
- Do not commit, push, deploy, run external sends or spawn more agents. The primary agent commits reviewed packets. Claude has its own checkout and may commit there as its prompt directs.
- Tests must exercise meaning: locale switching must retain drafts and retry keys, exact amounts/dates and permission boundaries. Run focused relevant tests and lint. Global typecheck failures may originate in another concurrently edited namespace; report them and never fix another packet without coordination.
- Write your completion notes, owned file list, decision mappings, test commands/results, limitations and original-content exceptions to your assigned `docs/arabic/parallel/<packet>.md`. Do not edit CURRENT_STATE.md, EXECUTION.md, decision-coverage.json or the release runbook; the primary agent consolidates those.
- Scripts in /private/tmp/rivet-* are scratch migration tools; many are not idempotent. Do not rerun an existing mutation script. The read-only `/private/tmp/rivet-extract-page.cjs <repo-relative-file>` and `/private/tmp/rivet-remaining.cjs` can help audit; their English hits include technical literals and require review.

## Ownership

| Packet | Owner | Boundaries | Namespace |
| --- | --- | --- | --- |
| CRM | Luna Max | CRM routes, features/crm, features/followup | crmCompletion |
| Platform finance | Luna Max | platform/billing, platform/subscriptions, platform/gyms | platformFinance |
| Platform console | Luna Max | platform home/applications/agreements/support/email-log and components/platform | platformConsole |
| Public marketing | Luna Max | public home/signup, components/marketing and components/public | publicCompletion |
| Staff tools | Luna Max | staff audit/checklists/automations/support/exports, features/automations | staffTools |
| Reception and dashboards | Luna Max | staff reception/dashboard, features/reception and features/dashboard | deskCompletion |
| Communications and event descriptors | Claude, isolated checkout | server email/SMS/WhatsApp/notification/timeline localization and recipient-safe tests | communicationCompletion |
| Shared integration and gates | Primary | shared infrastructure, remaining settings/auth/documents, global coverage and final tests | Existing typed catalogs as needed |
