import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { GymPublicProfileSection } from "./gym-public-profile-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams("section=profile"),
}));

afterEach(() => resetApiForTests());

describe("GymPublicProfileSection draft safety", () => {
  it("never allows a saved draft to be published while newer local edits exist", async () => {
    const user = userEvent.setup();
    await renderWithApp(<GymPublicProfileSection />);
    const shortName = await screen.findByLabelText(/Short name/);

    await user.clear(shortName);
    await user.type(shortName, "Saved profile");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish draft" })).toBeEnabled());

    await user.clear(shortName);
    await user.type(shortName, "Newer unsaved profile");
    const publish = screen.getByRole("button", { name: "Publish draft" });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAttribute("title", "Save or discard the unsaved edits before publishing.");
  });

  it("previews logo and cover locally and defers server upload until draft save", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<GymPublicProfileSection />);
    const upload = vi.spyOn(api, "uploadMediaAsset");
    const logoInput = await screen.findByLabelText("Logo");
    const coverInput = await screen.findByLabelText("Cover image");
    const altTextInputs = await screen.findAllByLabelText("Accessible image description");

    await user.upload(logoInput, new File(["logo"], "logo.png", { type: "image/png" }));
    await user.type(altTextInputs[0]!, "Gym logo");
    await user.upload(coverInput, new File(["cover"], "cover.png", { type: "image/png" }));
    await user.type(altTextInputs[1]!, "Gym cover");

    expect(upload).not.toHaveBeenCalled();
    expect(screen.getAllByText(/local preview only/i).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(upload.mock.calls.map(([input]) => input.ownerType)).toEqual(["gym_logo", "gym_cover"]);
  });
});
