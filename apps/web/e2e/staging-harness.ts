import { existsSync } from "node:fs";
import { expect, type Browser, type BrowserContext, type TestInfo } from "@playwright/test";
import { stagingJourneyRoles, stagingJourneySelected, storageStateEnvironmentKey, type StagingJourney, type StagingRole, validateStagingEnvironment } from "../src/lib/release/staging-guard";

type CleanupEntry = { targetType: string; targetId?: string; action: "archive" | "deactivate" | "unpublish" | "suspend" | "preserve"; reason: string; status: "planned" | "completed" | "failed"; error?: string };

export function requireStagingJourney(journey: StagingJourney, baseURL: string | undefined) {
  const guard = validateStagingEnvironment(process.env, baseURL ?? "http://127.0.0.1:3100");
  expect(stagingJourneySelected(guard.selectedJourneys, journey), `Journey ${journey} was not selected by PLAYWRIGHT_STAGING_JOURNEYS`).toBe(true);
  return guard;
}

export function requiredStagingRoles(journey: StagingJourney): readonly StagingRole[] {
  return stagingJourneyRoles(journey);
}

export async function newRoleContext(browser: Browser, role: StagingRole, baseURL = "http://localhost:3100"): Promise<BrowserContext> {
  const key = storageStateEnvironmentKey(role);
  const path = process.env[key] ?? (role === "owner" ? process.env.PLAYWRIGHT_CLERK_STORAGE_STATE : undefined);
  if (!path || !existsSync(path)) throw new Error(`${key} must point to a readable Clerk storage-state file.`);
  return await browser.newContext({ storageState: path, baseURL, viewport: { width: 1440, height: 900 }, locale: "en-US" });
}

export class StagingCleanupLedger {
  private readonly entries: CleanupEntry[] = [];
  constructor(private readonly runId: string, private readonly journey: StagingJourney) {}
  plan(entry: Omit<CleanupEntry, "status">): number { return this.entries.push({ ...entry, status: "planned" }) - 1; }
  complete(index: number) { if (this.entries[index]) this.entries[index]!.status = "completed"; }
  fail(index: number, error: unknown) { if (this.entries[index]) { this.entries[index]!.status = "failed"; this.entries[index]!.error = error instanceof Error ? error.message : "Cleanup failed"; } }
  async attach(testInfo: TestInfo) {
    console.log("[staging-cleanup]", JSON.stringify({
      journey: this.journey,
      entries: this.entries.map(({ targetType, action, status }) => ({ targetType, action, status })),
    }));
    await testInfo.attach(`staging-cleanup-${this.journey}-${this.runId}.json`, { body: Buffer.from(JSON.stringify({ runId: this.runId, journey: this.journey, generatedAt: new Date().toISOString(), entries: this.entries }, null, 2)), contentType: "application/json" });
  }
}
