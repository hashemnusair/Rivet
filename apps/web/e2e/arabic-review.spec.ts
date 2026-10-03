import { expect, test } from "@playwright/test";
test("Arabic review supports keyboard choices, filtering, saved states and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/platform/arabic-room?card=membership");
  await expect(page).toHaveURL(/\/arabic-room\?card=membership$/);
  await expect(
    page.getByRole("heading", { name: "Who are you?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hashem", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make it sound like us." }),
  ).toBeVisible();
  await expect(
    page.getByText("Local preview.", { exact: false }),
  ).toBeVisible();
  const option = page.getByRole("radio", { name: /A اشتراك/ });
  await option.focus();
  await page.keyboard.press("Space");
  await expect(option).toBeChecked();
  await page.getByLabel(/Why this wording/).fill("Natural gym wording");
  await page.getByRole("button", { name: "Save answer", exact: true }).click();
  await expect(page.getByText("Answer saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save & next" }).click();
  await expect(
    page.getByRole("heading", { name: "Membership plans", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find a word or situation").fill("offline");
  await page
    .getByRole("navigation", { name: "Review questions" })
    .getByRole("button", { name: /Could not connect/ })
    .click();
  await expect(
    page.getByRole("radio", { name: /تعذّر الاتصال/ }),
  ).toBeVisible();
  await page.getByLabel("Find a word or situation").fill("");
  await page.screenshot({
    path: "/tmp/rivet-ar-review-desktop.png",
    fullPage: true,
  });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/rivet-ar-review-mobile.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export draft choices/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/rivet-arabic-review.*json/);
  const prompt = await page.request.get("/arabic-implementation-prompt.txt");
  expect(prompt.status()).toBe(200);
  const promptText = await prompt.text();
  expect(promptText).toContain("docs/arabic/approved-decisions.v1.json");
  expect(promptText).toContain("revision 607");
  expect(promptText).toContain("all 247 decisions agreed");
  await page.getByRole("button", { name: "Switch name" }).click();
  await page.getByRole("button", { name: "Elias", exact: true }).click();
  await expect(page.getByText("Reviewing as Elias")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Who are you?" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
