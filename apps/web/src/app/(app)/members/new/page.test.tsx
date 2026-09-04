import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import NewMemberPage from "./page";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };
const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => navigation.searchParams,
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
HTMLElement.prototype.hasPointerCapture = () => false;
HTMLElement.prototype.setPointerCapture = () => undefined;
HTMLElement.prototype.releasePointerCapture = () => undefined;
HTMLElement.prototype.scrollIntoView = () => undefined;

afterEach(() => {
  resetApiForTests();
  vi.clearAllMocks();
  navigation.searchParams = new URLSearchParams();
});

describe("new member duplicate pre-check", () => {
  it("blocks both save paths until a matching identity is reviewed", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NewMemberPage />, { branchId: BRANCH_ABD });
    const existing = (await api.listMembers({ branchId: BRANCH_ABD, pageSize: 20 })).items.find((member) => member.phone);
    if (!existing) throw new Error("No seeded member with a phone number");
    const createMember = vi.spyOn(api, "createMember");

    await user.type(screen.getByTestId("member-name"), "Another Member");
    const phone = screen.getByTestId("member-phone");
    await user.type(phone, existing.phone);
    await act(async () => {
      phone.blur();
      await Promise.resolve();
    });
    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    await user.click(await screen.findByRole("option", { name: "Female" }));

    await user.click(screen.getByTestId("save-member"));

    expect(await screen.findByText(/confirm these results belong to a different person/i)).toBeInTheDocument();
    expect(createMember).not.toHaveBeenCalled();
  });

  it("reports a failed check and makes retry or explicit override available", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NewMemberPage />, { branchId: BRANCH_ABD });
    const duplicateCheck = vi.spyOn(api, "checkMemberDuplicates").mockRejectedValueOnce(
      ApiError.of(ERR.FORCED_FAILURE, "Connection unavailable."),
    );

    await user.type(screen.getByTestId("member-name"), "Yara Saleh");
    const phone = screen.getByTestId("member-phone");
    await user.type(phone, "0799000999");
    await act(async () => {
      phone.blur();
      await Promise.resolve();
    });

    expect(await screen.findByText(/could not check for an existing member/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry check" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue without pre-check" }));
    expect(screen.getByRole("button", { name: "Continuing without pre-check" })).toBeDisabled();

    duplicateCheck.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Retry check" }));
    await waitFor(() => expect(screen.queryByText(/could not check for an existing member/i)).not.toBeInTheDocument());
    expect(duplicateCheck).toHaveBeenCalledTimes(2);
  });

  it("prefills a reception search and commits the member and membership only after final confirmation", async () => {
    navigation.searchParams = new URLSearchParams("name=Walk-in Guest");
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NewMemberPage />, { branchId: BRANCH_ABD });
    const createMember = vi.spyOn(api, "createMember");
    const createMemberSale = vi.spyOn(api, "createMemberMembershipSale");

    expect(screen.getByTestId("member-name")).toHaveValue("Walk-in Guest");
    const phone = screen.getByTestId("member-phone");
    await user.type(phone, "0799000666");
    await act(async () => {
      phone.blur();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.queryByText(/Checking for duplicates/i)).not.toBeInTheDocument());
    await user.click(screen.getByRole("combobox", { name: "Gender" }));
    await user.click(await screen.findByRole("option", { name: "Female" }));
    await user.click(screen.getByRole("button", { name: /Create & sell membership/i }));

    expect(await screen.findByText(/Choose Walk-in Guest's membership/i)).toBeInTheDocument();
    expect(createMember).not.toHaveBeenCalled();
    expect(createMemberSale).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("quick-sale-plan"));
    await user.click(await screen.findByRole("option", { name: /Monthly Standard/i }));
    await user.click(screen.getByRole("switch", { name: "Collect payment now" }));
    await user.click(screen.getByTestId("confirm-member-sale"));

    await waitFor(() => expect(createMemberSale).toHaveBeenCalledOnce());
    expect(await screen.findByRole("heading", { name: "Member ready" })).toBeInTheDocument();
    expect(screen.getByText("Balance recorded")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
