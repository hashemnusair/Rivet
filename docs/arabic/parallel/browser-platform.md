# Platform browser regression packet

## Findings and changes

- The 360px gym-detail check exposed a real intrinsic-width issue in the information view’s implicit single-column CSS grid. The view now uses an explicit `minmax(0, 1fr)` single column and `min-w-0` on its nested information panels. The change preserves the controls, information, and existing text sizes.
- The billing preview existed in the named preview note as a list item, but regex matching over the composed amount did not reliably match it. The test now targets the first invoice list item and checks stable text fragments separately (`An invoice for`, currency, selected plan, and `is issued today.`).
- Gym detail opens on the “Gym info” tab. The public-listing and subscription-history checks now open “Settings” before querying those controls/events. Existing English text expectations are retained.
- The public-profile status badge composes “Draft”, “· version”, and the version number from separate text nodes. Its test now checks the combined header text. The payment-method test now uses the current English label “Other”; the product label remains unchanged.
- The gym-directory result sentence had lost its final period when the original English sentence was split into base and suffix translation keys. The period is restored after composing both parts, preserving the historical `e94f004e` English sentence for filtered and unfiltered results. The direct page test now expects that baseline punctuation.

## Files

- `apps/web/src/app/platform/gyms/[gymId]/gym-admin-detail.tsx`
- `apps/web/src/app/platform/gyms/page.tsx`
- `apps/web/src/app/platform/gyms/page.test.tsx`
- `apps/web/e2e/platform-subscription-entitlements.spec.ts`
- `apps/web/e2e/public-experience.spec.ts`
- `apps/web/e2e/workflow-pass-6.spec.ts` (also preserves the operations textbox locator correction from the desk packet)
- `apps/web/e2e/workflow-pass-7.spec.ts`

## Validation

- Focused ESLint on the gym detail and four affected e2e specs: passed with `--max-warnings 0`.
- Focused ESLint on the changed gym directory/detail files and affected e2e specs: passed with `--max-warnings 0`.
- Focused Vitest for `page.test.tsx`, `gym-admin-detail.test.tsx`, and billing `page.test.tsx`: 3 files, 29 tests passed. Used Vitest’s `--configLoader runner` after the default bundled loader hit a sandbox `EPERM` writing under `node_modules/.vite-temp`.
- `git diff --check`: passed.
- The primary/console agent’s final-bundle run confirms the gym-detail overflow journey passes at 360px, as do console overview/application and tenant-record plus money/legal/support journeys at 360px, 390px, 768px, and 820px. Adjusted listing, profile-badge, and audit-history assertions passed.
- The first full 175-test run finished 173/175. Both affected failures then passed focused reruns against the rebuilt `.next-arabic-final`: billing entitlement (1/1) after the stable invoice-item fragment checks, and the complete overview/filter journey (1/1) after restoring the final period.

## Limitations

The gym-detail 360px result, billing entitlement journey, and full overview/filter journey are verified against the final bundle. No snapshot or threshold was changed here.

## Final integration result

The rebuilt production preview passed both corrected platform journeys in separate focused reruns: billing entitlements (1/1) and overview/URL filters (1/1). The full 175-test run remains recorded as 173 passed and two failed; the focused reruns close those failures without changing screenshot baselines or thresholds. See `browser-regression.md` and the final `../EXECUTION.md` section for exact source/build and result boundaries.
