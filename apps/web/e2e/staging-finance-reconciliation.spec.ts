import { expect, test, type Page } from "@playwright/test";
import { chooseFirstAvailableOption, newRoleContext, requireStagingJourney, StagingCleanupLedger } from "./staging-harness";

test.describe("staged finance and reconciliation", () => {
  test("records card and cash partial payments, closes a real variance, and requires manager review", async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(180_000);
    test.skip(process.env.PLAYWRIGHT_STAGING_FULL_SUITE !== "1" || process.env.PLAYWRIGHT_TARGET_CLASSIFICATION !== "staging", "Enable the isolated full staging suite explicitly.");
    const guard = requireStagingJourney("finance-reconciliation", baseURL);
    const cleanup = new StagingCleanupLedger(guard.runId, "finance-reconciliation");
    const ownerContext = await newRoleContext(browser, "owner", baseURL);
    const receptionistContext = await newRoleContext(browser, "receptionist", baseURL);
    const managerContext = await newRoleContext(browser, "manager", baseURL);
    const owner = await ownerContext.newPage();
    const reception = await receptionistContext.newPage();
    const manager = await managerContext.newPage();
    const marker = guard.runId.replace(/[^a-zA-Z0-9]/g, "").slice(-10);
    const fullName = `Staging Finance ${marker}`;
    const phone = `+96279${Date.now().toString().slice(-7)}`;
    let memberUrl: string | undefined;
    let memberCleanup: number | undefined;
    let shiftCleanup: number | undefined;
    let shiftOpened = false;

    try {
      await owner.goto("/members/new", { waitUntil: "domcontentloaded" });
      await owner.getByTestId("member-name").fill(fullName);
      await owner.getByTestId("member-phone").fill(phone);
      await chooseFirstAvailableOption(owner, "Gender");
      await chooseFirstAvailableOption(owner, "Home branch");
      await owner.getByTestId("save-member").click();
      await expect(owner).toHaveURL(/\/members\/[0-9a-f-]+$/);
      memberUrl = owner.url();
      memberCleanup = cleanup.plan({ targetType: "member", targetId: memberUrl.split("/").at(-1), action: "archive", reason: "Disposable finance and reconciliation member" });

      await owner.getByTestId("sell-membership").click();
      const sale = owner.getByRole("dialog", { name: "Sell membership" });
      await sale.getByRole("combobox", { name: "Plan" }).click();
      await owner.getByRole("option").first().click();
      const collectNow = sale.getByRole("switch", { name: "Collect payment now" });
      if ((await collectNow.getAttribute("aria-checked")) === "true") await collectNow.click();
      await sale.getByTestId("confirm-sale").click();
      await expect(sale).toBeHidden();

      await reception.goto("/payments/shifts", { waitUntil: "domcontentloaded" });
      const openShift = reception.getByTestId("open-shift-page");
      await expect(openShift, "Use a staging receptionist/branch with no pre-existing open shift.").toBeVisible();
      await openShift.click();
      const open = reception.getByRole("dialog", { name: "Open cash shift" });
      await open.getByTestId("opening-float").fill("0.000");
      await open.getByTestId("confirm-open-shift").click();
      await expect(open).toBeHidden();
      shiftOpened = true;
      shiftCleanup = cleanup.plan({ targetType: "cash_shift", action: "preserve", reason: "Close and preserve the immutable staging reconciliation shift" });

      await reception.goto(memberUrl, { waitUntil: "domcontentloaded" });
      await collectPartialPayment(reception, "Card", `POS-${guard.runId}`);
      await collectPartialPayment(reception, "Cash");
      await reception.getByTestId("tab-timeline").click();
      await expect(reception.getByTestId("member-timeline")).toContainText(/payment collected/i);

      await reception.goto("/payments/shifts", { waitUntil: "domcontentloaded" });
      await reception.getByTestId("close-shift").click();
      const close = reception.getByRole("dialog", { name: "Close shift" });
      await expect(close.getByTestId("confirm-close-shift")).toBeEnabled();
      await expect(close.getByTestId("variance-panel")).toContainText("short");
      await close.getByTestId("variance-explanation").fill("Intentional isolated staging variance for manager review");
      await close.getByTestId("confirm-close-shift").click();
      await expect(close).toBeHidden();
      shiftOpened = false;

      await manager.goto("/payments/shifts", { waitUntil: "domcontentloaded" });
      await chooseFirstAvailableOption(manager, "Branch");
      await manager.getByRole("button", { name: "Approve variance" }).first().click();
      const review = manager.getByRole("dialog", { name: "Approve cash variance" });
      await review.getByRole("textbox").fill("Verified by the isolated staging reconciliation journey");
      await review.getByRole("button", { name: "Approve variance" }).click();
      await expect(review).toBeHidden();
      await expect(manager.getByText("variance approved").first()).toBeVisible();
      if (shiftCleanup !== undefined) cleanup.complete(shiftCleanup);
    } finally {
      if (shiftOpened && shiftCleanup !== undefined) {
        const closed = await closeOpenShift(reception);
        if (closed) cleanup.complete(shiftCleanup);
        else cleanup.fail(shiftCleanup, "Open staging shift could not be closed");
      }
      if (memberUrl && memberCleanup !== undefined) {
        const archived = await archiveMember(owner, memberUrl);
        if (archived) cleanup.complete(memberCleanup);
        else cleanup.fail(memberCleanup, "Finance staging member could not be archived");
      }
      await cleanup.attach(testInfo);
      await ownerContext.close();
      await receptionistContext.close();
      await managerContext.close();
    }
  });
});

async function collectPartialPayment(page: Page, method: "Card" | "Cash", reference?: string) {
  await page.getByTestId("collect-outstanding").click();
  const dialog = page.getByRole("dialog", { name: "Collect payment" });
  await dialog.getByTestId("payment-amount").fill("1.000");
  await dialog.getByTestId("payment-method").click();
  await page.getByRole("option", { name: method, exact: true }).click();
  if (reference) await dialog.getByRole("textbox", { name: "External reference" }).fill(reference);
  await dialog.getByTestId("confirm-payment").click();
  await expect(dialog).toBeHidden();
}

async function closeOpenShift(page: Page): Promise<boolean> {
  try {
    await page.goto("/payments/shifts", { waitUntil: "domcontentloaded" });
    await page.getByTestId("close-shift").click();
    const dialog = page.getByRole("dialog", { name: "Close shift" });
    await expect(dialog.getByTestId("confirm-close-shift")).toBeEnabled();
    const explanation = dialog.getByTestId("variance-explanation");
    if (await explanation.isVisible()) await explanation.fill("Emergency cleanup for an interrupted staging journey");
    await dialog.getByTestId("confirm-close-shift").click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    return false;
  }
}

async function archiveMember(page: Page, memberUrl: string): Promise<boolean> {
  try {
    await page.goto(memberUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "More actions" }).click();
    await page.getByRole("menuitem", { name: /Archive member/i }).click();
    const dialog = page.getByRole("dialog", { name: /Archive member/i });
    await dialog.getByRole("textbox").fill("Disposable finance and reconciliation staging journey");
    await dialog.getByRole("button", { name: "Archive member" }).click();
    await expect(dialog).toBeHidden();
    return true;
  } catch {
    return false;
  }
}
