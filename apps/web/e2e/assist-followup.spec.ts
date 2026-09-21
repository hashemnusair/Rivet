import { expect, test } from "@playwright/test";

/**
 * Connected staff follow-up assistance in the preview: an owner turns
 * suggestions on, opens a member record, reviews a contact note about a
 * relative (no outcome is suggested), then a clear note (the outcome is
 * applied only when accepted), and logs the contact through the normal form.
 */
test.describe("contact note review", () => {
  test("owner reviews a note, keeps a third-party note unresolved, and accepts a clear outcome", async ({ page }) => {
    await page.goto("/login/gym");
    await page.getByRole("radio", { name: /Owner Omar Al-Khatib/i }).click();
    await page.getByTestId("sign-in-button").click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/settings?section=assist");
    await page.getByRole("switch", { name: "Allow Jev suggestions" }).click();
    await page.getByRole("button", { name: "Save Jev switch" }).click();
    await expect(page.getByTestId("assist-blocked")).toHaveCount(0);

    // Stay inside the running app so the saved switch survives.
    await page.getByRole("complementary", { name: "Primary navigation" }).getByRole("link", { name: "Members", exact: true }).click();
    await page.getByTestId("member-row").first().click();
    await expect(page.getByRole("heading", { name: "Follow-up context" })).toBeVisible();

    await page.getByRole("button", { name: "Log contact" }).click();
    const dialog = page.getByRole("dialog", { name: "Log contact" });
    const notes = dialog.getByRole("textbox", { name: "Notes" });
    await notes.fill("Spoke to her brother, she is travelling until Thursday");
    await dialog.getByRole("button", { name: "Review note" }).click();
    await expect(dialog.getByTestId("contact-note-third-party")).toContainText("someone other than the member");
    await expect(dialog.getByRole("button", { name: /^Use “/ })).toHaveCount(0);

    await notes.fill("No answer, went to voicemail twice");
    await dialog.getByRole("button", { name: "Review note" }).click();
    await expect(dialog.getByTestId("contact-note-review")).toContainText("Reads as No answer");
    await dialog.getByRole("button", { name: "Use “No answer”" }).click();
    await expect(dialog.getByRole("radio", { name: "No answer" })).toHaveAttribute("aria-checked", "true");
    await expect(notes).toHaveValue("No answer, went to voicemail twice");
    await dialog.getByTestId("log-contact-submit").click();
    await expect(page.getByText("Contact logged — timeline updated.")).toBeVisible();
  });
});
