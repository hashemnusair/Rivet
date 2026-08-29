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
    const csv = "full_name,phone,email\nRana Odeh,0798765432,rana.odeh@example.com";
    const file = new File([csv], "current-members.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: vi.fn().mockResolvedValue(csv) });

    expect(screen.getByRole("heading", { name: "Upload a member list" })).toBeInTheDocument();
    expect(screen.getByText("Drop your CSV file here")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Member CSV content" })).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText("Choose member CSV file"), file);
    expect(await screen.findByText("current-members.csv")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Review members" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Review members" }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledWith({ csv, branchId: BRANCH_ABD }));
    expect(await screen.findByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import 1 member" })).toBeInTheDocument();
  });

  it("keeps pasting CSV as an explicit secondary path", async () => {
    const user = userEvent.setup();
    await renderWithApp(<MemberImportPage />, { branchId: BRANCH_ABD });

    await user.click(screen.getByRole("button", { name: "Paste CSV instead" }));
    const editor = screen.getByRole("textbox", { name: "Member CSV content" });
    await user.type(editor, "full_name,phone\nMira Nasser,0798123456");

    expect(editor).toHaveValue("full_name,phone\nMira Nasser,0798123456");
    expect(screen.getByRole("button", { name: "Review members" })).toBeEnabled();
  });
});
