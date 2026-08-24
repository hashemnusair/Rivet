# General Translation integration

> Temporary deployment pause (24 August 2026): the GT provider/compiler hooks
> and translation publish command are intentionally commented out of the
> normal Vercel path so deployments work without GT credentials or a network
> translation call. The package, config, components, and tests remain in place
> for a later re-enable. `pnpm build` currently validates the normal Convex and
> Clerk variables and builds Next.js directly.

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
- `apps/web/next.config.mjs` retains the `withGTConfig` setup as commented code;
  it is not active during the temporary deployment pause.
- `@generaltranslation/compiler` remains installed and configured for the
  later re-enable, but is not invoked by the current Vercel build.
- `apps/web/src/app/layout.tsx` retains the `GTProvider` boundary and document
  synchronizer as commented code; the current runtime uses the normal Clerk,
  Convex, identity, and app providers without GT.
- The authenticated Topbar retains an English↔Arabic locale switch backed by
  GT's `useLocale`/`useSetLocale` hooks as commented code for the later
  re-enable. The existing manual RTL demo control remains available.
- A small document synchronizer that updates `<html lang>` and `<html dir>` is
  also retained as commented code; it is not mounted while GT is paused.
- Production Vercel builds no longer require either GT environment variable
  while the integration is paused. The previous `gtx-cli translate --publish`
  release step is retained in `scripts/translate-production.mjs` but exits with
  an explicit pause message, and `pnpm build` does not call it. The values are
  never included in source, examples, logs, or browser variables.

When re-enabled, the provider and locale switch establish the runtime
translation boundary. In the webpack build path, GT's compiler automatically injects translation
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

When the integration is re-enabled, use a development API key for local
development and a production API key for a production build, following General
Translation's environment guidance. During the pause, GT credentials are
optional and the normal typecheck/test/build gates can run without them.

Translation catalog publishing is paused. To re-enable it later, restore the
commented GT config/provider lines, remove the temporary pause in
`scripts/translate-production.mjs`, add the GT variables to Vercel Production,
and explicitly add `pnpm translate:production` back to the build script after
reviewing the release workflow. Do not run that command with credentials in an
agent transcript.

## Vercel configuration

When the integration is re-enabled, add the GT names to the **Production**
scope. They are not required during the current pause. The normal production
variables remain:

- `NEXT_PUBLIC_CONVEX_URL` — the production Convex deployment URL.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — the production Clerk publishable key.
- `NEXT_PUBLIC_DATA_MODE=convex` — selects the live Convex adapter.

The repository's Vercel root directory is `apps/web`, and its build command is
`pnpm build`. The current build does not invoke translation generation and does
not require GT variables. After changing any Vercel variable, trigger a new
deployment because Next.js embeds build-time configuration into the server
bundle.

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
