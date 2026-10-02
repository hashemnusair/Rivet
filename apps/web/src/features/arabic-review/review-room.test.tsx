import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewRoomView } from "./review-room";
import {
  ARABIC_REVIEW_VERSION,
  type ReviewSnapshot,
} from "../../../convex/arabicReviewModel";
const initial: ReviewSnapshot = {
  version: ARABIC_REVIEW_VERSION,
  revision: 0,
  me: "h",
  reviewers: [
    { id: "h", name: "Hashem" },
    { id: "e", name: "Elias" },
  ],
  votes: [],
  approvals: [],
  ready: false,
  presence: [],
};
const present = vi.fn(async () => {});
function room(
  snapshot = initial,
  save = vi.fn(async () => 42),
  connected = true,
) {
  return (
    <ReviewRoomView
      preview
      snapshot={snapshot}
      save={save}
      connected={connected}
      approve={vi.fn()}
      present={present}
    />
  );
}
beforeEach(() => {
  window.history.replaceState(
    null,
    "",
    "/platform/arabic-room?card=membership",
  );
});
describe("Arabic review interaction", () => {
  it("offers multiple choice and explicitly saves the selected answer and comment", async () => {
    const save = vi.fn(async () => 42);
    render(room(initial, save));
    fireEvent.click(screen.getByRole("radio", { name: /A اشتراك/ }));
    fireEvent.change(screen.getByLabelText(/Why this wording/), {
      target: { value: "Our gym says this" },
    });
    expect(screen.getByText("Unsaved answer")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Save answer" }),
    );
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: "membership",
          choice: "a",
          note: "Our gym says this",
          expectedUpdatedAt: 0,
        }),
      ),
    );
    await screen.findByText("Answer saved");
  });
  it("keeps a failed save editable and never claims it saved", async () => {
    render(
      room(
        initial,
        vi.fn(async () => {
          throw new Error("failed");
        }),
      ),
    );
    fireEvent.click(screen.getByRole("radio", { name: /A اشتراك/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Save answer" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText("Unsaved answer")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /A اشتراك/ })).toBeChecked();
  });
  it("reveals the partner choice only after the current reviewer has saved", () => {
    const partner = {
      cardId: "membership",
      userId: "e",
      choice: "b",
      customText: "",
      note: "Elias prefers this",
      updatedAt: 1,
    };
    const { rerender } = render(room({ ...initial, votes: [partner] }));
    expect(screen.queryByText("Elias prefers this")).not.toBeInTheDocument();
    rerender(
      room({
        ...initial,
        votes: [partner, { ...partner, userId: "h", choice: "a", note: "" }],
      }),
    );
    expect(screen.getByText("Elias prefers this")).toBeInTheDocument();
    expect(
      screen.getByText("Discuss together", { selector: "span" }),
    ).toBeInTheDocument();
  });
  it("prevents saving while disconnected", () => {
    render(room(initial, undefined, false));
    fireEvent.click(screen.getByRole("radio", { name: /A اشتراك/ }));
    expect(
      screen.getByRole("button", { name: "Save answer" }),
    ).toBeDisabled();
    expect(screen.getByText(/Disconnected/)).toBeInTheDocument();
  });
  it("preserves an unsaved draft when another tab changes the answer", async () => {
    const mine = {
      cardId: "membership",
      userId: "h",
      choice: "a",
      customText: "",
      note: "",
      updatedAt: 1,
    };
    const { rerender } = render(room({ ...initial, votes: [mine] }));
    fireEvent.change(screen.getByLabelText(/Why this wording/), {
      target: { value: "My unsaved draft" },
    });
    rerender(
      room({ ...initial, votes: [{ ...mine, choice: "b", updatedAt: 2 }] }),
    );
    expect(screen.getByLabelText(/Why this wording/)).toHaveValue(
      "My unsaved draft",
    );
    expect(
      screen.getByRole("button", { name: "Save answer" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved answer" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /B عضوية/ })).toBeChecked(),
    );
  });
  it("filters the catalog by situation and section", () => {
    render(room());
    fireEvent.change(screen.getByLabelText("Find a word or situation"), {
      target: { value: "bank refund" },
    });
    const nav = screen.getByRole("navigation", { name: "Review questions" });
    expect(
      within(nav).getByRole("button", { name: /This records a refund/ }),
    ).toBeInTheDocument();
    expect(
      within(nav).queryByRole("button", { name: "Membership" }),
    ).not.toBeInTheDocument();
  });
});
