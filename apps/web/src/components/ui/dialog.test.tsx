import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

/** State-driven dialogs, as the app uses them: no DialogTrigger anywhere. */
function Harness() {
  const [open, setOpen] = useState(false);
  const [nested, setNested] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Who booked</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Roster</DialogTitle><DialogDescription>People in the class.</DialogDescription></DialogHeader>
          <DialogBody>
            <button type="button" onClick={() => setNested(true)}>Remove Yara</button>
          </DialogBody>
          <DialogFooter><button type="button" onClick={() => setOpen(false)}>Close</button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={nested} onOpenChange={setNested}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Yara?</DialogTitle><DialogDescription>A reason is required.</DialogDescription></DialogHeader>
          <DialogBody><textarea aria-label="Reason" /></DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

describe("Dialog focus return", () => {
  it("returns focus to the control that opened a state-driven dialog, through a nested dialog too", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Who booked" });
    opener.focus();
    await user.keyboard("{Enter}");
    const remove = await screen.findByRole("button", { name: "Remove Yara" });
    remove.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "Remove Yara?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Reason" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove Yara?" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Yara" })).toHaveFocus());

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Roster" })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
