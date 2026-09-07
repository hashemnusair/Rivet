import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Table, TableBody, TableCell, TableRow, rowClickShouldNavigate } from "./table";

function renderRow(onClick: () => void) {
  return render(
    <Table>
      <TableBody>
        <TableRow interactive onClick={onClick} data-testid="row">
          <TableCell>
            <input type="checkbox" aria-label="Select Omar" />
          </TableCell>
          <TableCell>
            <a href="#open-record">Omar Haddad</a>
            <span data-testid="phone">+962 79 123 4567</span>
          </TableCell>
          <TableCell>
            <button type="button">Collect</button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("interactive table rows", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("opens the record from the row itself", async () => {
    const onClick = vi.fn();
    renderRow(onClick);
    await userEvent.click(screen.getByTestId("phone"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("leaves nested controls alone so a checkbox, a link or a row action never opens the record twice", async () => {
    const onClick = vi.fn();
    renderRow(onClick);
    await userEvent.click(screen.getByLabelText("Select Omar"));
    await userEvent.click(screen.getByRole("button", { name: "Collect" }));
    await userEvent.click(screen.getByRole("link", { name: "Omar Haddad" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not navigate when the click ends a text selection", () => {
    const onClick = vi.fn();
    renderRow(onClick);
    const phone = screen.getByTestId("phone");
    const range = document.createRange();
    range.selectNodeContents(phone);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    expect(selection?.toString()).toContain("962");

    const row = screen.getByTestId("row");
    expect(rowClickShouldNavigate({ target: phone, currentTarget: row, defaultPrevented: false })).toBe(false);
    selection?.removeAllRanges();
    expect(rowClickShouldNavigate({ target: phone, currentTarget: row, defaultPrevented: false })).toBe(true);
  });
});
