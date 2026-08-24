# General Translation integration

RIVET now has an additive `gt-next` integration for English (`en`) source
content and Arabic (`ar`) translations. The integration deliberately keeps the
existing app URL structure, authentication middleware, manual RTL preview, and
any future hand-authored catalogue independent from GT. This avoids making a
locale-prefixed route tree a prerequisite for the current authenticated gym
workflows.

## What is wired

- `apps/web/gt.config.json` declares `en` as the default locale and `ar` as the
  supported target locale, enables the same automatic JSX parsing for the CLI,
  and publishes the generated catalog to GT's CDN.
- `apps/web/next.config.mjs` applies `withGTConfig`, which reads the server-only
  `GT_PROJECT_ID` and `GT_API_KEY` environment variables.
- `@generaltranslation/compiler` is enabled through `withGTConfig`'s Babel
  compiler option. The app's `dev` and `build` scripts explicitly use
  `--webpack`, which is required for GT's automatic JSX injection; Next 16's
  default Turbopack path does not run that compiler.
- `apps/web/src/app/layout.tsx` mounts `GTProvider` above the existing Clerk,
  Convex, identity, and app providers.
- The authenticated Topbar exposes an English↔Arabic locale switch backed by
  GT's `useLocale`/`useSetLocale` hooks. The existing `AppProviders` direction
  state is updated to the selected locale direction, while the separate demo
  control remains available for manual RTL layout checks.
- A small document synchronizer updates `<html lang>` for the active GT locale
  and keeps `<html dir>` aligned after a locale change. An explicitly stored
  manual direction remains authoritative on first mount.
- Production Vercel builds fail closed when either GT environment variable is
  missing. Once those names are configured, the build runs `gtx-cli translate
  --publish` before Next.js, so new static JSX strings are uploaded and the
  server-side `GTProvider` can load the Arabic catalog. The values are never
  included in source, examples, logs, or browser variables.

The provider and locale switch establish the runtime translation boundary. In
the webpack build path, GT's compiler automatically injects translation
components around static JSX text, so existing screens do not need a mass
manual wrapper pass. This was verified against the generated webpack server
bundle: static shell text is emitted through GT's injected translation helper.
The compiler cannot translate arbitrary runtime data safely. Use GT's
`<T>`/`<Var>` components (and `<Num>`, `<Currency>`, or `<DateTime>` where
appropriate) for dynamic values as screens are reviewed. Keep member names,
phone numbers, receipt IDs, financial amounts, and other private runtime values
as variables rather than sending them as translation text. The default scripts
use webpack so this behavior is present in local development and production;
custom Next commands must also pass `--webpack`. This is broad static-copy
coverage, not a claim that every dynamic or private value is already localized.

## Setup outside the agent transcript

Set these names in the relevant local/Vercel environments with values from the
General Translation dashboard. Do not commit the values or put them in
`NEXT_PUBLIC_*` variables:

```dotenv
GT_PROJECT_ID=
GT_API_KEY=
```

Use a development API key for local development and a production API key for a
production build, following General Translation's environment guidance. After
the credentials are configured, run the app's normal typecheck/test/build
gates (`pnpm typecheck`, `pnpm test`, and `pnpm build` from the repository
root). The build command uses the GT webpack compiler; do not replace it with a
Turbopack build if automatic JSX injection is required.

For production translation catalogs, the Vercel Production build runs
`gtx-cli translate --publish` automatically before `next build`. This is the
required release step for the default CDN delivery mode. A local build skips
the network translation step by default; set `RIVET_TRANSLATE_BUILD=1` only in
an environment where the production GT variables are already available. Do
not run that command with credentials in an agent transcript.

## Vercel configuration

- Add these exact names to the **Production** scope. Vercel exposes Production
  variables to both the build and the running Next.js server, which is required
  because the catalog is published during the build and loaded at request time:

- `GT_PROJECT_ID` — the General Translation project ID.
- `GT_API_KEY` — a General Translation **production** API key.
- `NEXT_PUBLIC_CONVEX_URL` — the production Convex deployment URL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — the production Clerk publishable key.
- `NEXT_PUBLIC_DATA_MODE=convex` — selects the live Convex adapter.

The repository's Vercel root directory is `apps/web`, and its build command is
`pnpm build`. Preview deployments intentionally skip translation generation
and use the deterministic mock experience; add GT variables to Preview only if
you deliberately change that deployment policy. After changing any Vercel
variable, trigger a new deployment because Next.js embeds build-time
configuration into the server bundle.

## Official references

- [gt-next migration/setup](https://generaltranslation.com/en-US/docs/next/guides/migration)
- [GT JSX production generation](https://generaltranslation.com/en-US/docs/cli/reference/formats/gt-jsx-files)
- [gt.config.json configuration](https://generaltranslation.com/en-US/docs/next/config)
- [The `<T>` component](https://generaltranslation.com/en-US/docs/next/guides/t)
- [Variable components and sensitive values](https://generaltranslation.com/docs/next/guides/variables)
- [Production vs development behavior](https://generaltranslation.com/docs/next/concepts/environments)
- [Right-to-left support](https://generaltranslation.com/en-US/docs/next/guides/rtl)
- [The `gt translate` production command](https://generaltranslation.com/docs/cli/reference/commands/translate)
- [Production deployment and translation generation](https://generaltranslation.com/docs/next/tutorials/quickdeploy)
- [GT compiler setup for Next.js](https://generaltranslation.com/en-US/blog/compiler_v1_0_0_gt-next_v6_7_0)
- [Automatic JSX injection in the GT compiler](https://generaltranslation.com/en-US/blog/compiler_v1_3_0)
