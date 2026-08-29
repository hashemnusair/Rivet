import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, ERR } from "@/lib/api/errors";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import NewMemberPage from "./page";

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
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
});

describe("new member duplicate pre-check", () => {
  it("reports a failed check and makes retry or explicit override available", async () => {
    const user = userEvent.setup();
    const { api } = await renderWithApp(<NewMemberPage />);
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
});
