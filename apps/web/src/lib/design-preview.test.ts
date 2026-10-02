import { describe, expect, it } from "vitest";
import { designPreviewEnabled } from "./design-preview";

describe("design preview gate", () => {
  it("opens automatically in local development", () => {
    expect(designPreviewEnabled({ NODE_ENV: "development" })).toBe(true);
  });

  it("requires the explicit flag on Vercel Preview", () => {
    expect(designPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBe(false);
    expect(designPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: "preview", RIVET_DESIGN_PREVIEW: "1" })).toBe(true);
  });

  it("always fails closed in Vercel Production", () => {
    expect(designPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", RIVET_DESIGN_PREVIEW: "1" })).toBe(false);
  });

  it("opens for an approved mock preview bundle only with the explicit flag, never for a production-class bundle", () => {
    expect(designPreviewEnabled({ NODE_ENV: "production", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview", RIVET_DESIGN_PREVIEW: "1" })).toBe(true);
    expect(designPreviewEnabled({ NODE_ENV: "production", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview" })).toBe(false);
    expect(designPreviewEnabled({ NODE_ENV: "production", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "production", RIVET_DESIGN_PREVIEW: "1" })).toBe(false);
    expect(designPreviewEnabled({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS: "preview", RIVET_DESIGN_PREVIEW: "1" })).toBe(false);
  });

  it("does not expose the gallery in an unclassified production build", () => {
    expect(designPreviewEnabled({ NODE_ENV: "production", RIVET_DESIGN_PREVIEW: "1" })).toBe(false);
  });
});
