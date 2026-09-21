import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GymPublicProfileSection } from "@/features/settings/gym-public-profile-section";
import type { MockGymOSApi } from "@/lib/mock/MockGymOSApi";
import type { UpdateGymPublicProfileInput } from "@/lib/domain/types";
import { renderWithApp, resetApiForTests } from "@/test/harness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("section=profile"),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
afterEach(() => resetApiForTests());

async function saveDraft(api: MockGymOSApi, overrides: Partial<UpdateGymPublicProfileInput>) {
  const current = await api.getGymPublicProfile();
  await api.saveGymPublicProfile({
    shortName: current.shortName,
    taglineEn: current.taglineEn,
    taglineAr: current.taglineAr ?? "",
    descriptionEn: current.descriptionEn,
    descriptionAr: current.descriptionAr ?? "",
    category: current.category,
    audience: current.audience,
    amenities: [...current.amenities],
    contactEmail: current.contactEmail ?? "",
    contactPhone: current.contactPhone ?? "",
    websiteUrl: current.websiteUrl ?? "",
    instagramUrl: current.instagramUrl ?? "",
    accentColor: current.accentColor,
    galleryAssetIds: [],
    ...overrides,
  });
}

describe("public page draft review", () => {
  it("compares the saved draft with the records, keeps unknown claims unknown, flags a language gap, and locates a passage in the editor", async () => {
    const user = userEvent.setup();
    await renderWithApp(<GymPublicProfileSection />, {
      prepare: async (api) => {
        await api.updateAssistPreference({ enabled: true });
        await saveDraft(api, {
          taglineEn: "Strength and conditioning across six branches.",
          taglineAr: "قوة ولياقة في فرعين",
          descriptionEn: "Certified coaches, free weights and cardio. Free parking and a sauna at every branch.",
          descriptionAr: "مدربون معتمدون وأوزان حرة وكارديو.",
        });
      },
    });
    const run = await screen.findByTestId("profile-review-run");
    expect(run).toBeEnabled();
    await user.click(run);
    const findings = await screen.findByTestId("profile-claims-findings");
    const items = within(findings).getAllByTestId("profile-claims-findings-item");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("six branches");
    expect(within(items[0]!).getByTestId("profile-claims-findings-evidence")).toHaveTextContent(/Recorded: \d+ active branch/);
    // Parking and a sauna are not recorded anywhere: listed as unknown, never as false.
    expect(screen.getByTestId("profile-unchecked")).toHaveTextContent("parking");
    expect(screen.getByTestId("profile-unchecked")).toHaveTextContent("unknown rather than false");
    const gaps = await screen.findByTestId("profile-language-findings");
    expect(within(gaps).getAllByTestId("profile-language-findings-item")).toHaveLength(1);
    expect(gaps).toHaveTextContent("Free parking and a sauna at every branch.");
    expect(gaps).toHaveTextContent("the Arabic text does not");
    expect(screen.getByTestId("profile-review-services")).toHaveTextContent(/Published trainers: \d+/);
    // Locate is an explicit action: it focuses the field the passage came from and selects it.
    await user.click(within(gaps).getByRole("button", { name: "Locate in editor" }));
    const description = screen.getByLabelText(/English description/) as HTMLTextAreaElement;
    expect(document.activeElement).toBe(description);
    expect(description.value.slice(description.selectionStart ?? 0, description.selectionEnd ?? 0)).toBe("Free parking and a sauna at every branch.");
    // Unsaved edits are never reviewed: the action waits for a save or a discard.
    await user.type(screen.getByLabelText(/Short name/), "x");
    await waitFor(() => expect(screen.getByTestId("profile-review-run")).toBeDisabled());
    expect(screen.getByTestId("profile-review-run")).toHaveAttribute("title", "Save or discard the unsaved edits first; the review reads the saved draft.");
    // The Save and Send actions are exactly as before: still available, never blocked by a finding.
    expect(screen.getByRole("button", { name: "Save draft" })).toBeInTheDocument();
  });

  it("reports a legitimate bilingual paraphrase as aligned and an agreeing draft as clear", async () => {
    const user = userEvent.setup();
    await renderWithApp(<GymPublicProfileSection />, {
      prepare: async (api) => {
        await api.updateAssistPreference({ enabled: true });
        await saveDraft(api, {
          taglineEn: "Strength training and cardio for everyone.",
          taglineAr: "تدريب قوة وكارديو للجميع",
          descriptionEn: "Two branches in Amman with certified coaches and showers.",
          descriptionAr: "فرعان في عمّان مع مدربين معتمدين وحمامات.",
        });
      },
    });
    await user.click(await screen.findByTestId("profile-review-run"));
    expect(await screen.findByTestId("profile-claims-clear")).toBeInTheDocument();
    expect(await screen.findByTestId("profile-language-clear")).toHaveTextContent("No meaningful difference");
  });

  it("says when there is no Arabic text to compare", async () => {
    const user = userEvent.setup();
    await renderWithApp(<GymPublicProfileSection />, {
      prepare: async (api) => {
        await api.updateAssistPreference({ enabled: true });
        await saveDraft(api, { taglineEn: "Strength for everyone.", taglineAr: "", descriptionEn: "Two branches in Amman.", descriptionAr: "" });
      },
    });
    await user.click(await screen.findByTestId("profile-review-run"));
    expect(await screen.findByTestId("profile-language-unavailable")).toHaveTextContent("Add an Arabic tagline or description");
  });

  it("shows nothing at all while the gym's switch is off", async () => {
    await renderWithApp(<GymPublicProfileSection />);
    await screen.findByLabelText(/Short name/);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
    expect(screen.queryByTestId("profile-draft-review")).not.toBeInTheDocument();
  });
});
