import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import MemberImportPage from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/members/import",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
});

describe("member import", () => {
  it("makes a real CSV file upload the primary path and previews its members", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD });
    const previewImport = vi.spyOn(api, "previewMemberImport");
    const csv = "full_name,phone,gender,email\nRana Odeh,0798765432,female,rana.odeh@example.com";
    const file = new File([csv], "current-members.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue(csv) });

    expect(screen.getByRole("heading", { name: "Choose your member file" })).toBeInTheDocument();
    expect(screen.getByText("Drop a member file here")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Member CSV content" })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Choose member file"), file);
    expect(await screen.findByText("current-members.csv")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Column for full name" })).toHaveTextContent("full_name");
    expect(screen.getByRole("combobox", { name: "Column for phone" })).toHaveTextContent("phone");
    expect(screen.getByRole("combobox", { name: "Column for gender" })).toHaveTextContent("gender");
    await waitFor(() => expect(screen.getByRole("button", { name: "Check members" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Check members" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledWith(expect.objectContaining({ csv: expect.stringContaining("Rana Odeh,0798765432,female,rana.odeh@example.com"), branchId: BRANCH_ABD, sourceFileName: "current-members.csv", sourceKind: "csv", columnMapping: { fullName: 0, phone: 1, gender: 2, email: 3 }, migrationCutoffDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), planMappings: {} })));
    expect(await screen.findByRole("heading", { name: "Review before import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 member" })).toBeInTheDocument();
    expect(screen.getByText("Bring over current memberships")).toBeInTheDocument();
  });

  it("keeps pasting CSV as an explicit secondary path", async () => {
    const user = userEvent.setup();
    await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD });

    await user.click(screen.getByRole("button", { name: "Paste CSV instead" }));
    const editor = screen.getByRole("textbox", { name: "Member CSV content" });
    await user.click(editor);
    await user.paste("full_name,phone,gender\nMira Nasser,0798123456,female");

    expect(editor).toHaveValue("full_name,phone,gender\nMira Nasser,0798123456,female");
    expect(screen.getByRole("button", { name: "Check members" })).toBeEnabled();
  });

  it("suggests columns from values when assistance is on, filling only empty choices for the person to check", async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    const user = userEvent.setup();
    await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD, prepare: async (api) => {
      // A platform admin makes the preview gym available before its owner turns assistance on.
      await api.setPlatformAiAvailability({ organizationId: (await api.getSession()).organization.id, available: true, reason: "Test gym" });
      const settings = await api.getAiSettings();
      await api.updateAiSettings({ tenantMode: "prepare", expectedRevision: settings.revision });
    } });
    await user.click(screen.getByRole("button", { name: "Paste CSV instead" }));
    await user.click(screen.getByRole("textbox", { name: "Member CSV content" }));
    await user.paste("Col A,Col B,Col C\nMira Nasser,0798123456,female\nOmar Khalil,0785550101,male\nLina Haddad,0777000111,أنثى");
    expect(screen.getByRole("button", { name: "Check members" })).toBeDisabled();
    await user.click(await screen.findByTestId("import-suggestions-run"));
    expect(screen.getByRole("combobox", { name: "Column for full name" })).toHaveTextContent("Col A");
    expect(screen.getByRole("combobox", { name: "Column for phone" })).toHaveTextContent("Col B");
    expect(screen.getByRole("combobox", { name: "Column for gender" })).toHaveTextContent("Col C");
    expect(screen.getByTestId("import-suggestions-applied")).toHaveTextContent("Nothing is imported until you confirm.");
    expect(screen.getByRole("button", { name: "Check members" })).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
