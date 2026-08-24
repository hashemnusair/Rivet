import { expect, test } from "@playwright/test";

test.describe("daily operations workflows", () => {
  test("records stock, completes a facility task, and resolves an equipment issue", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /owner/i }).click();
    await page.getByRole("button", { name: /Open .+ workspace/i }).click();
    await page.goto("/operations");
    await expect(page.getByTestId("operations-command-center")).toBeVisible();

    await page.getByRole("button", { name: /Record movement/i }).click();
    const movement = page.getByRole("region", { name: "Record stock movement" });
    await movement.getByLabel("Quantity").fill("1");
    await movement.getByRole("button", { name: /Record movement/i }).click();
    await expect(page.getByText(/Recent stock movements/i)).toBeVisible();

    await page.getByRole("tab", { name: /Facilities/i }).click();
    await page.getByRole("button", { name: /Request task/i }).click();
    const taskForm = page.getByRole("region", { name: "Request facility task" });
    await taskForm.getByPlaceholder("Restock bathroom supplies").fill("Verify operations test task");
    await taskForm.getByRole("button", { name: /Create task/i }).click();
    const taskRow = page.getByText("Verify operations test task").locator("xpath=ancestor::div[contains(@class, 'flex-col')][1]");
    await expect(taskRow).toContainText("open");
    await taskRow.getByRole("button", { name: "Start" }).click();
    await taskRow.getByRole("button", { name: "Complete" }).click();
    await expect(taskRow).toContainText("completed");

    await page.getByRole("tab", { name: /Equipment/i }).click();
    const issueRow = page.getByText("Belt slipping under load").locator("xpath=ancestor::div[contains(@class, 'space-y-1.5')][1]");
    await expect(issueRow).toContainText("in progress");
    await issueRow.getByRole("button", { name: "Resolve issue" }).click();
    await expect(issueRow).toContainText("resolved");
  });
});
