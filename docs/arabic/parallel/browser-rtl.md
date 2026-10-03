# Arabic browser and RTL verification

Run date: 2026-10-03. Verification used the final production-built mock preview (`.next-arabic-final`) with demo personas and no provider or production mutations.

## Files and decisions

- [`apps/web/e2e/arabic-browser-verification.spec.ts`](../../../apps/web/e2e/arabic-browser-verification.spec.ts) covers first paint, language switching, draft retention, mobile member and receipt routes, platform views, and a real PDF download.
- [`apps/web/e2e/rtl-audit.spec.ts`](../../../apps/web/e2e/rtl-audit.spec.ts) captures 31 staff routes and asserts no horizontal document overflow or clipped text.
- Captures and the downloaded PDF are stored under `/private/tmp/rivet-arabic-rtl-evidence`; they are linked below and are intentionally not committed as repository images.

First paint is seeded with `rivet_locale=ar` and the encoded `rivet_ui_locale_v1` preference (`version: 1`, `locale: "ar"`, `owner: null`, pending browser choice). The test checks the returned HTML as well as the visible Arabic page, then checks the chosen English `lang`/`dir` after a reload. The role menu test opens the account menu with physical Enter, reads the actual `role=menuitem` nodes and active element, traverses with physical ArrowDown while polling for each focus move, and activates the language item with Enter. The test id is on the menuitem itself; it is not a nested-child focus proxy. Radix schedules focus after the key event, so the test waits for the active menuitem to move before sending the next key. The initial rapid-key diagnostic was a test synchronization issue; no app accessibility code change was needed.

The 720 CSS-pixel viewport represents a 200%-equivalent reflow from 1440 CSS pixels; it is not a test of operating-system or browser zoom. The 820-pixel viewport is tablet and 390 pixels is the narrow-phone check. Each responsive measurement waits for the app shell's margin transition to finish. An early 390-pixel sample briefly measured `scrollWidth=402` while the sidebar's `transition-[margin]` was in flight; after the transition-aware wait, the support view measured without horizontal overflow. This was an animation-timing artifact, not a persistent content overflow.

The receipt assertions normalize bidi control marks only for comparison. The product money formatter must render an exact three-decimal Arabic JOD display such as `25.000 د.أ`; the test keeps phone numbers and `R-…` receipt references in Latin digits. The receipt footer is a separate canonical ISO fallback and must retain `JOD · المبالغ بعملة دينار أردني`. The test does not relax other currency fields to accept `JOD`.

Audit/event text, support ticket subjects and authored messages, and authored automation templates remain source content. The browser check writes `Browser verification draft; do not send.` only into a local support reply field to test draft retention; it never submits the reply. Status, known system labels, and other presentation copy are localized. Gym names, member references, phone numbers, and other fixture/business data retain their canonical text.

## Coverage

The five invariant tests verify:

1. Arabic public first paint from server HTML; Arabic support at desktop, tablet (820px), 390px phone, and 720px 200%-equivalent reflow; physical-key language switching; draft retention through the language switch; and persisted English first paint after reload.
2. The seeded member membership detail at 390px, including the member number and QR action.
3. A seeded payment receipt at 390px with a Jordan phone, receipt reference, app-formatted JOD amount, and ISO footer fallback.
4. The loaded platform overview at desktop and tablet widths.
5. A real downloaded Arabic terms PDF: `%PDF-` bytes, Arabic searchable title metadata, `/ToUnicode` mappings, and embedded font data. The final downloaded PDF is 1,203,450 bytes and has four A4 pages. Its first page was rendered and visually inspected with Poppler; the title is `RIVET شروط الاستخدام`.

The 31 route captures use the seeded Owner persona except CRM routes (Sales) and reception routes (Reception):

`/dashboard`, `/members`, `/payments`, `/payments/shifts`, `/classes`, `/memberships`, `/plans`, `/checkout`, `/operations`, `/operations/payables`, `/maintenance`, `/finance`, `/finance/controls`, `/finance/balance-sheet`, `/finance/cash-flow`, `/finance/income-statement`, `/reports`, `/reports/statements`, `/members/import`, `/members/duplicates`, `/crm/pipeline`, `/crm/queues`, `/audit`, `/checklists`, `/automations`, `/support`, `/exports`, `/settings`, `/pt`, `/reception`, and the Reception dashboard at `/dashboard`.

The current captures were visually inspected before acceptance, including the financial statement, report chooser, member import, staff support at 390px, platform overview, receipt, public Arabic terms, and rendered PDF page. No snapshot baselines were bulk-updated.

## Commands and results

Run from `apps/web`:

```sh
PLAYWRIGHT_SERVER_MODE=start PLAYWRIGHT_DIST_DIR=.next-arabic-final PLAYWRIGHT_PORT=3126 PLAYWRIGHT_WORKERS=1 RTL_SHOTS=/private/tmp/rivet-arabic-rtl-evidence pnpm exec playwright test e2e/arabic-browser-verification.spec.ts e2e/rtl-audit.spec.ts --output=/private/tmp/rivet-playwright-results-rtl-final-final
```

Result: **36 passed** (5 invariant tests and 31 RTL route captures; 2.1 minutes). The Playwright-managed mock server stopped when the run ended. No test sent a message, invoked an external provider, or mutated a production/staging system.

```sh
pnpm exec eslint e2e/rtl-audit.spec.ts e2e/arabic-browser-verification.spec.ts
pnpm exec playwright test e2e/arabic-browser-verification.spec.ts e2e/rtl-audit.spec.ts --list
```

Both commands passed; the list contains 36 tests. The complete browser test run above exercises physical keyboard traversal on the final bundle.

## Evidence

- [Arabic public homepage, desktop](</private/tmp/rivet-arabic-rtl-evidence/public-home-ar-desktop.png>)
- [Arabic staff support, 390px with local unsent draft](</private/tmp/rivet-arabic-rtl-evidence/staff-support-ar-phone-390.png>)
- [Arabic support 200%-equivalent reflow viewport](</private/tmp/rivet-arabic-rtl-evidence/staff-support-ar-zoom-200-equivalent.png>)
- [Arabic member membership, 390px](</private/tmp/rivet-arabic-rtl-evidence/member-membership-ar-phone-390.png>)
- [Arabic payment receipt, 390px](</private/tmp/rivet-arabic-rtl-evidence/staff-payment-receipt-ar-phone-390.png>)
- [Arabic platform overview, desktop](</private/tmp/rivet-arabic-rtl-evidence/platform-overview-ar-desktop.png>) and [tablet](</private/tmp/rivet-arabic-rtl-evidence/platform-overview-ar-tablet.png>)
- [Arabic balance sheet capture](</private/tmp/rivet-arabic-rtl-evidence/finance-balance-sheet.png>), [reports](</private/tmp/rivet-arabic-rtl-evidence/reports-statements.png>), and [member import](</private/tmp/rivet-arabic-rtl-evidence/members-import.png>)
- [Actual downloaded Arabic terms PDF](</private/tmp/rivet-arabic-rtl-evidence/terms-arabic-real-download.pdf>) and [rendered first page](</private/tmp/rivet-arabic-rtl-evidence/terms-arabic-pdf-page1-final-bundle.png>)

## Limitations

Authentication and data are the seeded local mock personas. No real Clerk identity, cross-host cookie flow, or staging credential was available, so those paths were not verified. Actual browser/OS zoom was not controlled; the 720 CSS-pixel viewport is a reflow proxy. The PDF browser assertion verifies the downloaded bytes, title string, Unicode map, and embedded font; PDF rendering was inspected separately with Poppler, and the primary agent independently rendered the final downloaded file with PDFium. PDFium found the exact body title `شروط الاستخدام`, pypdf found the exact metadata title `RIVET شروط الاستخدام`, and extraction contained zero replacement characters. Authored business content is intentionally preserved, so English fixture ticket subjects and event/template text are visible on otherwise Arabic screens.
