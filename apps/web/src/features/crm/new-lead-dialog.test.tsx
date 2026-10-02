import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BRANCH_ABD } from "@/lib/mock/seed";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { NewLeadDialog } from "./new-lead-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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

describe("NewLeadDialog quick capture", () => {
  it("creates a walk-in lead from name and phone while keeping extras collapsed", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { api } = await renderWithApp(<NewLeadDialog open onOpenChange={onOpenChange} />, { branchId: BRANCH_ABD });
    const createLead = vi.spyOn(api, "createLead");

    const optionalDetails = document.querySelector("details");
    const nameInput = document.querySelector<HTMLInputElement>('input[name="fullName"]');
    const phoneInput = document.querySelector<HTMLInputElement>('input[name="phone"]');
    expect(optionalDetails).not.toBeNull();
    expect(optionalDetails).not.toHaveAttribute("open");
    expect(nameInput).not.toBeNull();
    expect(phoneInput).not.toBeNull();
    await user.type(nameInput!, "Maya Khalil");
    await user.type(phoneInput!, "0799000777");
    await user.click(screen.getByRole("button", { name: "Create lead" }));

    await waitFor(() => expect(createLead).toHaveBeenCalledOnce());
    expect(createLead.mock.calls[0]?.[0]).toMatchObject({
      fullName: "Maya Khalil",
      phone: "0799000777",
      source: "walk_in",
      ownerId: expect.any(String),
      branchId: expect.any(String),
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
