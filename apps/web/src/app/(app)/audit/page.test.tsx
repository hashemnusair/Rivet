import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import AuditPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/audit",
  useSearchParams: () => new URLSearchParams("approval=pending"),
}));

afterEach(() => { resetApiForTests(); vi.restoreAllMocks(); });

it("lets an owner approve a pending discount with a reason, and the request leaves the pending list", async () => {
  const { api } = await renderWithApp(<AuditPage />);
  const review = vi.spyOn(api, "reviewApproval");
  const user = userEvent.setup();
  const approve = (await screen.findAllByRole("button", { name: "Approve" }))[0]!;
  const pendingBefore = screen.getAllByRole("button", { name: "Approve" }).length;
  expect(screen.getAllByRole("button", { name: "Reject" })).toHaveLength(pendingBefore);

  await user.click(approve);
  const dialog = await screen.findByRole("dialog");
  const confirm = within(dialog).getByRole("button", { name: "Approve" });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByRole("textbox"), "Checked with the member");
  await user.click(confirm);

  await waitFor(() => expect(review).toHaveBeenCalledWith(expect.any(String), { decision: "approved", note: "Checked with the member" }));
  await waitFor(() => expect(screen.queryAllByRole("button", { name: "Approve" })).toHaveLength(pendingBefore - 1));
});

it("shows no approve or reject control to a role that cannot review", async () => {
  await renderWithApp(<AuditPage />, { role: "receptionist" });
  await waitFor(() => expect(screen.queryByTestId("session-loading")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
});
