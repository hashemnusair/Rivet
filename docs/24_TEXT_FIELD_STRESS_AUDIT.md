# 24 — Text Field Stress Audit ("break the UI")

**Living document.** First pass executed 27 October 2026 against `main`
(base `44c473c`). Re-run the method below after any change to shared form
primitives, list/detail layouts that echo user text, or API validation.

The pass tried to break every text field in every dashboard (gym staff,
platform console, member portal and the signed-out pages) by typing hostile
text into it, and tried to break every page that *shows* typed text by saving
very long values. It records what broke, what was fixed in the same change,
and what remains.

---

## 1. Method

### 1.1 Input sweep

A Playwright script signed in as each seeded persona (owner, platform admin,
member Lina Haddad, signed out) against a production build of the mock preview
(`next build` + `next start`, `NEXT_PUBLIC_DATA_MODE=mock`, demo auth),
Chromium, 1440×900. On every route it swept:

- every visible, enabled `input` (text, search, email, tel, url, password,
  number) and `textarea`;
- every tab (`role="tab"`, which also covers every Settings section);
- every dialog or inline editor opened by an action button (New, Add, Edit,
  Record, Log, Collect, Freeze, Renew, Search…);
- reception and checkout a second time with a branch chosen.

Payloads, each typed into every field at once and then field by field when
something broke: a 320-character token with no spaces; ~3,000 characters of
prose; emoji ZWJ sequences; mixed Arabic, Latin and digits; an HTML/script
injection string (`"><script>…`, `<img onerror>`, `{{7*7}}`, `${7*7}`);
whitespace only; and `-1`, `99999999999999999999`, `1e308`, `0.0000001` for
number inputs.

Measured after each payload: horizontal page overflow, content spilling out of
its own box, dialog horizontal scroll, uncaught page errors, console errors,
error panels, script execution (a `window.__xss` flag and native dialogs), and
whether the field has a `maxLength`.

### 1.2 Display sweep (long saved values)

A local-only stress seed (never committed) renamed 3 members, 5 leads,
2 plans, 2 products, 2 suppliers, 2 staff and every branch to 105–140
character unbroken names, and filled notes, emails, addresses, timeline bodies
and the receipt footer with long text. Every staff, platform and member page,
plus member, lead, automation and gym detail pages, was scanned at 1440 and
390 px for spill and off-screen content, with a screenshot of each offender.

### 1.3 Numeric audit

All 41 inputs that use `inputMode="numeric"`/`"decimal"` were read in code
for what `1e3`, `-1`, `0.5`, `99999999999999999999`, spaces, `abc` and an empty
box do, and whether the API re-validates.

### 1.4 Layout regression check

For the global wrap rule (§3.1), every element box on 42 routes × 3 personas
× 1440/768/390 px was compared with and without the rule on the ordinary seed.

---

## 2. Coverage

| Area | Text fields swept after the fix | Without `maxLength` before | Without `maxLength` after |
| --- | ---: | ---: | ---: |
| Gym staff (every route, tab and dialog; reception and checkout with a branch chosen) | 121 | 59 of the 60 the first pass reached | 0 |
| Platform console | 52 | 44 | 0 |
| Member portal | 14 | 14 | 0 |
| Signed-out pages (sign-in, signup) | 21 | 15 | 3 |

The three signed-out fields left unbounded are the same `website` honeypot on
the signup page under three routes; people never see it and only bots fill it.

Not reached by the sweep: the supplier-payment detail page
(`/operations/payables/payments/[paymentId]`, opened from a dialog) and a
customer receipt page (the seeded member has none). Both only display stored
text through components fixed here.

**What held:** no payload caused an uncaught exception, a console error, or
script execution anywhere — React escaping held on every surface. The
platform console, member portal and signed-out pages had no layout breaks
under any payload.

---

## 3. Findings and fixes

### 3.1 Cross-cutting

| # | What broke | Fix |
| --- | --- | --- |
| 1 | Almost no text field had a length limit (33 `maxLength` uses in the app), so a pasted page was saved and then echoed by every list, card, receipt and timeline. | `Input` and `Textarea` now apply a ceiling when the caller sets none: 255 characters for text-like inputs, 2,048 for `type="url"`, 2,000 for textareas. An explicit `maxLength` always wins; the CSV paste box uses the import's 5 MB file limit. The two raw inputs (reception lookup, Arabic review search) are bounded too. |
| 2 | Limits the API enforces were not mirrored, so the operator only learned about them from an error after Save. | `src/lib/domain/input-limits.ts` holds the shared numbers (person name 120, search 120, plan name 80, task title 160, …); the matching inputs use them as `maxLength`. |
| 3 | A long unbroken word (a pasted link, a reference) ran out of its panel wherever text was echoed — e.g. "Nothing found for “…”" on Members spilled 3,454 px. | `body { overflow-wrap: break-word }`. Unlike `anywhere` it leaves intrinsic widths alone: on the ordinary seed it changed no element box on 125 of 126 page/width combinations. The one change was a JOD amount in the payables ageing strip at 768 px that already overflowed its 46 px cell; `MoneyText` now keeps `overflow-wrap: normal` so a figure never splits. A global `anywhere` was measured and rejected: it moved 76 elements in the platform sidebar and 16 in the member header. |

### 3.2 Specific surfaces

| # | Where | What broke | Fix |
| --- | --- | --- | --- |
| 4 | Stock & purchasing → Supplier bills; `/operations/payables` | A search over 120 characters showed "Something went wrong — Search text is too long." with a Try again button that could never succeed. | Input bounded to 120; the query sent (including one from the URL) is clamped. |
| 5 | Search RIVET palette | Convex refuses a query over 120 characters; the "Nothing matches" echo spilled 3,260 px. | Input bounded to 120; echo wraps (#3). |
| 6 | Settings search | "No settings match" echo spilled. | Wraps (#3). |
| 7 | Member profile | A long name ran under Renew and widened the page by 381 px (desktop) and 470 px (phone); Arabic name, branch and breadcrumb likewise; a long email or address in the side panel widened the page by 470 px (phone) and 100 px (tablet). | Name, Arabic name and branch wrap; breadcrumbs truncate the current page; the side panel and overview grid items may shrink. |
| 8 | Lead profile | Name and branch could not wrap (`break-words` on a flex item has no effect). | Wrap with `min-w-0` + `overflow-wrap: anywhere`. |
| 9 | Possible duplicates | Card heading (the two names) spilled 306–516 px. | Heading block may shrink and wrap. |
| 10 | Follow-ups queue | Member name spilled 459 px. | Wraps. |
| 11 | Reception branch chooser | Branch chips overflowed and widened the page at 390 px. | Chips cap their width and truncate with a tooltip. |
| 12 | Owner dashboard | "Collected by branch" widened the page by 276 px at 390 px. | Branch label wraps. |
| 13 | Stock & purchasing inventory | Product names, per-branch availability and the low-stock badge spilled up to 1,415 px; the low-stock strip spilled at 390 px. | Each wraps; the badge may wrap. |
| 14 | Payments (phone list) | The member-name link's `truncate` did nothing (inline element); the "By {staff}" label spilled. | Link is block; label wraps. |
| 15 | Members table | A long name stretched the Name column and clipped Plan. | Name capped at 18rem with ellipsis and a tooltip. |
| 16 | Platform gym list and gym detail | Areas and branch addresses spilled up to 463 px. | Wrap. |
| 17 | New member, new/edit lead, create task, plan form, customer trial request, and the transfer/freeze/extend/cancel/unfreeze/plan-change reasons | Whitespace-only text passed client validation and was refused only after Save. (The API already refuses blank reasons, so the audit trail was never at risk.) | Schemas trim before checking. |
| 18 | Plan form | `z.coerce.number()` accepted `1e3` (1000) and `0x10` (16); clearing the optional "Use within (days)" blocked saving with "Enter 1 or more". | Digits-only counts through the shared `readNumberInput`; a cleared optional count is "not set". |
| 19 | `plans.create` / `plans.update` (Convex) | Duration, visits, validity and freeze days were stored unchecked. | Whole numbers in range: 1–3,650 days, 1–1,000 visits, 1–3,650 validity days, 0–180 freeze days; plan name ≤ 80 and trimmed. Uses the existing localized `apiErrors.wholeNumberRange` / `apiErrors.invalidField`. The mock mirrors it. |
| 20 | `members.create` / `members.update` (Convex) | No upper bound on a member's name (leads and imports stop at 120); an update stored the name untrimmed and could blank it. | Trimmed, non-blank, ≤ 120, with the existing "Full name must be between 3 and 120 characters." message. The mock mirrors it. |
| 21 | Member portal freeze request | Typing `1.5` produced 15 (each keystroke was stored as `Number(text)`); `1e1` became 10; an emptied box showed 0. | The typed text is kept (digits made Latin) and read with `readNumberInput`. |
| 22 | Equipment form | A service interval, useful life or downtime of only spaces was sent as 0. | Trimmed before reading. |

Regression tests: `src/components/ui/input.test.tsx`,
`src/features/plans/plan-form-dialog.test.tsx` (three new cases, each failing
on the old code), the new freeze case in
`src/app/customer/my-gyms/[membershipId]/membership-detail.client.test.tsx`, and
`convex/domain.text-bounds.test.ts` (fails on the old code).

---

## 4. Remaining work

Tracked as open items in the canonical backlog,
[docs/13](13_PRODUCT_AND_OPERATIONS_TODO.md) ("Text field stress pass"); the
detail is kept here.

- **Server-side length limits are still missing for most free text** (notes,
  reasons, addresses, support messages, templates). The new client ceilings
  stop typing and pasting in the product; a direct API caller can still send
  longer text. Recommended: one shared bounded-text validator in Convex,
  applied per field from `input-limits.ts`.
- **`members.update` and `plans.update` write every field they are sent**
  (`{ ...input }`). Tenant isolation holds (`patchRecord` pins `id` and
  `organizationId`), but a direct call can set fields such as a member's
  `status` or `memberNumber` outside the dedicated, audited flows. Recommended
  fix: an allowlist per update; suggested as a separate task.
- A discount larger than the price silently brings the total to 0 in the sale
  dialog and on the server (`Math.min`). Needs a product decision before it
  becomes an error.
- The follow-up window filter (Follow-ups) silently ignores invalid text; the
  country calling code accepts `0`/`000`; automation day/hour fields have no
  maximum; a stock quantity of only spaces makes Save do nothing without a
  message.
- The Settings section rail spills 16 px at 390 px on the ordinary seed
  (pre-existing; unrelated to typed text).

## 5. Assumptions

- Default ceilings (255 / 2,048 / 2,000) are generous for every current field
  and are overridden wherever the API or the product states a limit.
- Plan ranges (≤ 3,650 days, ≤ 1,000 visits) are sanity bounds, not product
  rules; every seeded and tested plan is far inside them.
- No new interface copy was added, so no Arabic decision was needed; all new
  errors reuse existing localized messages.

## 6. Reproducing the sweep

```bash
pnpm install
cd apps/web
NEXT_PUBLIC_DATA_MODE=mock NEXT_PUBLIC_RIVET_DEMO_AUTH=1 \
NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS=preview RIVET_DESIGN_PREVIEW=1 \
NEXT_DIST_DIR=.next-playwright/breakui pnpm exec next build --webpack
# same environment, then:
pnpm exec next start -p 3210
```

Then drive each persona's routes with Playwright, typing the payloads in §1.1
and checking `document.documentElement.scrollWidth` against the viewport and
`el.scrollWidth > el.clientWidth` on elements with `overflow-x: visible`. For
§1.2, temporarily lengthen names in `src/lib/mock/seed.ts` before building;
never commit that change.
