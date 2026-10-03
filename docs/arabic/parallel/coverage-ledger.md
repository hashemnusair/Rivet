# Arabic route coverage ledger handoff

Updated `docs/arabic/COVERAGE.md` from the historical pending list to the current source tree. The current count is 75 `page.tsx` files plus `apps/web/src/app/offline/route.ts` (76 page/handler entry modules). A source comparison verified that the inventory enumerates all 75 current pages exactly once; the offline handler is separately listed. The stale `offline/page.tsx` appears only in the explicitly labeled historical baseline.

The route table groups pages by product workflow and records the registered namespaces plus representative, real test paths. Namespace names come from the current paired `messages/{en,ar}/index.ts` exports; paths and reported test results were cross-checked against source, `EXECUTION.md`, and the current parallel handoffs. The test counts are kept per packet because suites overlap and the handoffs were not all run at the same time.

## Recorded source/unit evidence

- `public.md`: public landing/signup and shared public components, 10 files / 49 tests.
- `crm.md`: CRM flows, 6 files / 31 tests, plus the separate Arabic search invariant.
- `platform-console.md`: platform console, 6 files / 18 tests.
- `platform-finance.md`: finance, billing, subscriptions and gyms, 7 files / 51 tests; separate catalog run, 10 tests.
- `staff-tools.md`: audit, checklist, automation, support and export flows, 10 selected files / 36 tests.
- `desk.md`: reception/dashboard, 7 files / 59 tests.
- `EXECUTION.md`: foundation, auth, setup/offline, legal PDFs, settings, payments, enrollment/import, classes, PT, operations, statements, reports/exports and preference/format checkpoints with focused unit/backend/document tests. The previous top-level execution status table is a checkpoint snapshot; subsequent packet reports provide the scoped parallel results.
- `system-text-ui.md`: shared notification/timeline consumers, 4 files / 16 tests and 13 presenter tests.
- `claude-communications.md`: backend message builders, recipient language, retries and typed event projections. Its broad run is recorded as 1,901 passed / 1 failed, with the report saying the failure reproduces on the untouched base; focused communication suites are listed there separately. This does not count as route coverage.

Coverage remains bounded by its evidence: route rows point to source/unit tests or packet-reported behavior. They do not assert that each wrapper page was mounted or manually reviewed in a browser. The system-message, email, WhatsApp, document and export rows distinguish generated-output tests from route/UI acceptance.

## Exceptions and outstanding acceptance

- `/arabic-room` remains an original-review/authored-history surface. `/platform/arabic-room` is a redirect. Their presence in route inventory does not authorize rewriting the saved review evidence.
- `/dev/design-system` is production-gated and intentionally excluded from release-route coverage; its English sample labels remain if the gallery is used in Arabic preview.
- The read-only audit in `remaining-source-audit.md` found a known generated accounting reason and an unused breadcrumb label. Both are resolved: the reason is projected only for its exact action/text pair (with authored/history fallback), and breadcrumb accessibility uses the locale catalog. The report remains a dated source-audit snapshot.
- Browser/RTL/mobile/keyboard/screen-reader review, provider-owned verification language, Meta approval, real offline installation, staging and release gates remain distinct from source/unit evidence. This document does not certify them or claim full release completion. The primary agent owns final integrated checks and will append those outcomes.

No application source or test was changed for this documentation packet.
