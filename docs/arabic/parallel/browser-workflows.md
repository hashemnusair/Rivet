# Browser workflow regression packet

Date: 2026-10-03. Scope: update E2E selectors and display assertions after Arabic-safe text inputs and bidi/date presentation were integrated. The six settings viewport cases use one shared section-ready assertion; no viewport, workflow, submitted value, API payload, or product behavior was changed.

## Files changed

- `apps/web/e2e/workflow-pass-6.spec.ts` — the Gym rules readiness check now queries the labeled numeric text field as a textbox. The same check covers each 360, 390, 768, 820, 1280, and 1440px run.
- `apps/web/e2e/happy-path.spec.ts` — the manager override flow now reads the phone from the `bdi[dir="ltr"]` value wrapper inside the table cell; the phone itself and audit-reason assertions are unchanged.
- `apps/web/e2e/repo-workflows.spec.ts` — purchase-order Quantity and Unit cost fields now use textbox role selectors. The test still fills the same values, saves the draft, approves it, changes the delivery date, and checks overdue filtering.
- `apps/web/e2e/trainer-journey.spec.ts` — saved time-off display assertions use the formatted `21 Sept 2026` value. The canonical date submitted to the date input remains `2026-09-21`.

Console confirmed it owns no desk E2E files, and is editing the separate manual-RTL/i18n block in `happy-path.spec.ts`; this packet changed only the phone selector in the manager override test. Platform finance owns its platform-only subscription spec and platform portions of workflow pass 7, and is separately editing the public-profile assertion in `workflow-pass-6.spec.ts`; this packet changed only the Gym rules selector in that shared spec. It does not edit platform specs.

## Failure diagnosis

The settings viewport failures all showed the accessible name `Ending soon warning, days` on a textbox while the E2E requested a spinbutton. The DOM therefore confirms the test expectation was stale after the numeric text-input normalization. The purchase-order snapshot likewise timed out waiting for `spinbutton` named `Quantity`; the form uses textboxes for both Quantity and Unit cost. The member-row phone now has a directional `<bdi>` child rather than `dir="ltr"` on its `<td>`. The trainer availability dialog renders the locale-formatted date `21 Sept 2026` while its input and canonical value remain ISO date-only.

All four mismatches were test-only corrections for the presented DOM. Numeric text inputs, bidi isolation, submitted date values, and business-workflow assertions remain intact.

## Verification

- From `apps/web`: `pnpm exec eslint e2e/workflow-pass-6.spec.ts e2e/happy-path.spec.ts e2e/repo-workflows.spec.ts e2e/trainer-journey.spec.ts` — passed with no output.
- Console reports the integrated 175-test run on `.next-arabic-final` finished 173/175. All scoped cases passed: six settings viewport runs, the member-phone BDI audit journey, purchase-order Quantity/Unit cost entry, and the trainer formatted-date flow. The two failures were outside this packet: `platform-subscription-entitlements.spec.ts:111` (billing preview) and `workflow-pass-7.spec.ts:203` (the overview link journey now renders “Awaiting review 1” while the test expects the former “Pending 1”); the platform-console owner is correcting the second test's English label. No separate Playwright run was made.
- Console ran this command from `apps/web`:

  ```sh
  PLAYWRIGHT_SERVER_MODE=start \
  PLAYWRIGHT_DIST_DIR=.next-arabic-final \
  PLAYWRIGHT_PORT=3120 \
  PLAYWRIGHT_WORKERS=2 \
  pnpm exec playwright test --output /private/tmp/rivet-playwright-results-regression-final \
    e2e/arabic-review.spec.ts \
    e2e/checkout-and-payables.spec.ts \
    e2e/classes.spec.ts \
    e2e/design-system-checkpoint.spec.ts \
    e2e/design-system-visual.spec.ts \
    e2e/exports.spec.ts \
    e2e/feedback-regressions.spec.ts \
    e2e/gym-spaces.spec.ts \
    e2e/happy-path.spec.ts \
    e2e/host-routing.spec.ts \
    e2e/legal-agreement.spec.ts \
    e2e/member-import.spec.ts \
    e2e/operations-workflows.spec.ts \
    e2e/platform-subscription-entitlements.spec.ts \
    e2e/public-experience.spec.ts \
    e2e/repo-workflows.spec.ts \
    e2e/role-routing.spec.ts \
    e2e/tab-scroll-stability.spec.ts \
    e2e/today-queue.spec.ts \
    e2e/trainer-journey.spec.ts \
    e2e/workflow-pass-1-visual.spec.ts \
    e2e/workflow-pass-2.spec.ts \
    e2e/workflow-pass-3.spec.ts \
    e2e/workflow-pass-4.spec.ts \
    e2e/workflow-pass-5.spec.ts \
    e2e/workflow-pass-6.spec.ts \
    e2e/workflow-pass-7.spec.ts
  ```
- The original failure contexts were inspected from `/private/tmp/rivet-playwright-results-regression`. No snapshots or thresholds were changed.
- No snapshots, thresholds, product files, or canonical test payloads were changed.

## Final integration result

The rebuilt production preview passed both corrected platform journeys in separate focused reruns: billing entitlements (1/1) and overview/URL filters (1/1). The full 175-test run remains recorded as 173 passed and two failed; the focused reruns close those failures without changing screenshot baselines or thresholds. See `browser-regression.md` and the final `../EXECUTION.md` section for exact source/build and result boundaries.
