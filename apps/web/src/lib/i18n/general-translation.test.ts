import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import gtConfig from "../../../gt.config.json";

describe("General Translation configuration", () => {
  it("keeps English as the source locale and Arabic as the target locale", () => {
    expect(gtConfig).toMatchObject({
      defaultLocale: "en",
      locales: ["ar"],
      publish: true,
      files: {
        gt: {
          parsingFlags: { enableAutoJsxInjection: true },
        },
      },
    });
  });

  it("documents only server-side GT credential names", () => {
    const envExample = readFileSync(".env.example", "utf8");

    expect(envExample).toContain("GT_PROJECT_ID=");
    expect(envExample).toContain("GT_API_KEY=");
    expect(envExample).not.toContain("NEXT_PUBLIC_GT_");
    expect(envExample).not.toContain("GT_DEV_API_KEY");
  });

  it("keeps GT in the production build and requires its server credentials", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: { build: string } };
    const envValidator = readFileSync("scripts/validate-vercel-env.mjs", "utf8");
    const nextConfig = readFileSync("next.config.mjs", "utf8");
    const translationRelease = readFileSync("scripts/translate-production.mjs", "utf8");

    expect(packageJson.scripts.build).toContain("pnpm translate:production");
    expect(envValidator).toContain('"GT_PROJECT_ID"');
    expect(envValidator).toContain('"GT_API_KEY"');
    expect(nextConfig).toContain("withGTConfig");
    expect(nextConfig).toContain("enableAutoJsxInjection: true");
    expect(translationRelease).toContain('"--publish"');
    expect(translationRelease).toContain("RIVET_TRANSLATE_BUILD");
    expect(translationRelease).not.toContain("TRANSLATION_RELEASE_PAUSED");
  });
});
