# Public marketing and signup Arabic completion

Completed the public landing page, product illustrations, public navigation and footer, and gym application flow in English and Modern Standard Arabic. The approved hero promise is exactly `كل تفاصيل ناديك و مشتركينه في مكان واحد`. Pricing tiers and capabilities, plan names, route/query behavior, application data, and original gym/member demo identities remain intact.

The public application now formats JOD, capacity counts, and product-screen dates/times through the locale formatter. Arabic phone digits normalize only for validation/submission; the visible draft remains unchanged. The selected plan and billing interval survive locale changes, and the application sends its captured `language` with the API request. Marketing navigation/dialog labels, image alternatives, illustrative UI labels, form validation, confirmations, and auth handoff copy are translated. Horizontal tab arrows follow the active locale; vertical arrows and focus movement remain available.

The catalog is registered in the existing English and Arabic `publicCompletion` namespaces. Its key groups are `hero`, `header`, `footer`, `authHandoff`, `landing`, `story`, `preview`, `signup`, `memberShell`, and `accessibility`. English and Arabic plural shapes/placeholders are aligned, including `preview.queue.expiresIn`; JOD and count variants use the shared formatter/plural helpers. Exact marketing wording remains as approved above. Directional icons rely on the shared RTL mirroring rule in `globals.css`; the page does not add duplicate icon rotations, while hover translations still reverse in RTL.

The social preview was assessed: the shared layout already localizes its title, description, and alt text, and uses the existing text-free `/brand/rivet-social-preview.png`. No metadata, image, or route changes were needed. No hreflang routes were added. Legal pages/PDFs and the bilingual public review-room evidence were left untouched; stored user choices/votes and authored historical gym content remain original.

Owned implementation and test files:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/page.test.tsx`
- `apps/web/src/app/signup/page.tsx`
- `apps/web/src/app/signup/page.test.tsx`
- `apps/web/src/components/marketing/cinematic-header.tsx`
- `apps/web/src/components/marketing/hero-devices.tsx`
- `apps/web/src/components/marketing/landing-story.tsx`
- `apps/web/src/components/marketing/product-screens.tsx`
- `apps/web/src/components/public/gym-mark.tsx`
- `apps/web/src/components/public/public-footer.tsx`
- `apps/web/src/components/public/public-shell.tsx`
- `apps/web/src/components/public/public-plan-copy.ts`
- `apps/web/src/components/public/segmented-tabs.tsx`
- `apps/web/src/components/public/segmented-tabs.test.tsx`
- `apps/web/src/lib/i18n/messages/en/publicCompletion.ts`
- `apps/web/src/lib/i18n/messages/ar/publicCompletion.ts`

Validation from `apps/web`:

- `pnpm exec vitest run --configLoader runner src/lib/i18n/messages.test.ts src/app/page.test.tsx src/app/signup/page.test.tsx src/components/marketing/cinematic-header.test.tsx src/components/marketing/landing-story.test.ts src/components/public/public-footer.test.tsx src/components/public/customer-shell.test.tsx src/components/public/customer-communication-preferences.test.tsx src/components/public/experience-data-state.test.tsx src/components/public/segmented-tabs.test.tsx` — 10 files, 49 tests passed, including Arabic landing/RTL/focus and Arabic-digit application submit with `language: "ar"`.
- Scoped ESLint over all owned TypeScript files — passed with `--max-warnings 0`.
- `pnpm exec tsc --noEmit --incremental false --pretty false` — no errors in this packet; two remaining errors are in concurrently edited files outside this packet: `src/app/(app)/audit/page.tsx` and `src/lib/i18n/messages/ar/index.ts`.
- A broader exploratory run also included `src/components/public/entry-pass-dialog.test.tsx`; its existing unknown-error case expects the raw `Error.message`, while `localizeApiError` renders the generic localized API fallback. The dialog/test was not changed in this packet.

No known public/signup behavior limits remain. The existing text-free social preview does not show locale-specific text, and legal routes are outside this packet because their approved Arabic translations were completed separately.
