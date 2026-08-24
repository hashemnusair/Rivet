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
});
