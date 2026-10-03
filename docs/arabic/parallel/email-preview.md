# Responsive email preview QA

The first local preview identified 600px frame overflow at a 390px viewport in the saved receipt and invoice HTML. I updated the current renderer’s phone rule, then regenerated separate previews from the source functions. The saved Claude evidence under `claude-communications-evidence/` is unchanged and remains historical.

Current renderer change: `apps/web/convex/emailTemplate.ts` forces `.rv-frame` to `width:100%` and `max-width:100%` under the existing ≤480px media query. Desktop keeps the existing 600px inline frame. `apps/web/convex/emailTemplate.test.ts` covers both constraints. Content, values, copy, links, and attachment behavior are unchanged.

Fresh HTML outputs are under `/private/tmp/rivet-arabic-email-preview/fresh/`; screenshots are under `fresh/screenshots/`. Each has Arabic and English variants:

| Output | Generated from | Viewports |
| --- | --- | --- |
| `payment-receipt.{ar,en}.html` and matching `.png` screenshots | `operationalEmailContent("payment_receipt", ...)` | 1280×900, 390×844 |
| `invoice-past-due.{ar,en}.html` and matching `.png` screenshots | `operationalEmailContent("platform_invoice_past_due", ...)` | 1280×900, 390×844 |
| `gym-application-received.{ar,en}.html` and matching `.png` screenshots | `applicantReceivedEmail(...)` | 1280×900, 390×844 |

Playwright Chromium reported 1280px document width and a 600px frame at desktop for all transactional messages. At 390px, both languages of receipt and invoice now report 390px viewport, document, body, and frame widths; no descendant or document-level horizontal overflow was found. The phone layout stacks card labels and values, and headings, body copy, actions, identifiers, money, dates, attachment name, and footer fit within the viewport. RTL amount runs (`25.000 د.أ`, `12.500 د.أ`, `27.875 د.أ`) and LTR receipt/invoice references remain readable. The unchanged gym-application fragments fit 390px in both languages.

Validation from the repository root:

- `pnpm --dir apps/web exec vitest run --configLoader runner convex/emailTemplate.test.ts` — passed, 10 tests.
- `pnpm --dir apps/web exec eslint convex/emailTemplate.ts convex/emailTemplate.test.ts` — passed.
- Playwright Chromium fresh-render QA — all six current-source HTML outputs rendered at 1280×900 and 390×844 with all non-local requests aborted; no 390px horizontal overflow.
- `git diff --check -- apps/web/convex/emailTemplate.ts apps/web/convex/emailTemplate.test.ts docs/arabic/parallel/email-preview.md` — passed.

Limitations: remote logos/backgrounds and web fonts were blocked, so the RIVET logo is missing in preview and fallback fonts are used. Gym-application screenshots are fragment previews without the production email shell. This is local HTML browser QA, not inbox/client certification. No email was sent or provider/deploy called; the temporary generator test was removed after writing the fresh HTML artifacts.
