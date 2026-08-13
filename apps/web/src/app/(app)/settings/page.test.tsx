import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContext, useContext, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { SettingsPageInner } from "./page";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/dialog", () => {
  type RootProps = { open?: boolean; children?: ReactNode };
  type ContentProps = ComponentPropsWithoutRef<"div"> & {
    hideClose?: boolean;
    onEscapeKeyDown?: (event: unknown) => void;
    onPointerDownOutside?: (event: unknown) => void;
  };
  const labelContext = createContext<string | undefined>(undefined);
  const Dialog = ({ open, children }: RootProps) => open ? <>{children}</> : null;
  const DialogContent = ({ children, hideClose: _hideClose, onEscapeKeyDown: _onEscapeKeyDown, onPointerDownOutside: _onPointerDownOutside, ...props }: ContentProps) => {
    const labelId = useId();
    return <labelContext.Provider value={labelId}><div role="dialog" aria-labelledby={labelId} {...props}>{children}</div></labelContext.Provider>;
  };
  const DialogTitle = ({ children, ...props }: ComponentPropsWithoutRef<"h2">) => <h2 id={useContext(labelContext)} {...props}>{children}</h2>;
  const DialogDescription = ({ children, ...props }: ComponentPropsWithoutRef<"p">) => <p {...props}>{children}</p>;
  const DialogClose = ({ children, ...props }: ComponentPropsWithoutRef<"button">) => <button type="button" {...props}>{children}</button>;
  const DialogTrigger = DialogClose;
  const DialogOverlay = () => null;
  const DialogHeader = ({ children, ...props }: ComponentPropsWithoutRef<"div">) => <div {...props}>{children}</div>;
  const DialogBody = DialogHeader;
  const DialogFooter = DialogHeader;
  return { Dialog, DialogTrigger, DialogClose, DialogOverlay, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter };
});

afterEach(() => {
  resetApiForTests();
  navigation.push.mockReset();
});

async function editPublicProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "Public profile" }));
  const shortName = await screen.findByLabelText(/Short name/);
  await user.clear(shortName);
  await user.type(shortName, "Unsaved profile name");
}

describe("Settings public-profile navigation guard", () => {
  it("offers Stay and Discard before changing Settings tabs", async () => {
    const user = userEvent.setup();
    await renderWithApp(<SettingsPageInner />);
    await editPublicProfile(user);

    await user.click(screen.getByRole("tab", { name: "Organization" }));
    expect(screen.getByRole("dialog", { name: "Unsaved public profile changes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.getByRole("tab", { name: "Public profile" })).toHaveAttribute("data-state", "active");

    await user.click(screen.getByRole("tab", { name: "Organization" }));
    await user.click(screen.getByRole("button", { name: "Discard and leave" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Organization" })).toHaveAttribute("data-state", "active"));
    expect(await screen.findByRole("heading", { name: "Organization" })).toBeInTheDocument();
  });

  it("saves before following an internal navigation link", async () => {
    const user = userEvent.setup();
    await renderWithApp(<><a href="/dashboard">Dashboard link</a><SettingsPageInner /></>);
    await editPublicProfile(user);

    await user.click(screen.getByRole("link", { name: "Dashboard link" }));
    expect(navigation.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/dashboard"));
  });
});
