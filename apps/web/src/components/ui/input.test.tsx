import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { INPUT_MAX_LENGTH, Input, TEXTAREA_MAX_LENGTH, Textarea, URL_INPUT_MAX_LENGTH } from "./input";

describe("text field bounds", () => {
  it("gives every free-text field a ceiling the caller can override", () => {
    render(
      <>
        <Input aria-label="name" />
        <Input aria-label="email" type="email" />
        <Input aria-label="site" type="url" />
        <Input aria-label="code" maxLength={8} />
        <Textarea aria-label="notes" />
        <Textarea aria-label="csv" maxLength={5_000_000} />
      </>,
    );
    expect(screen.getByLabelText("name")).toHaveAttribute("maxlength", String(INPUT_MAX_LENGTH));
    expect(screen.getByLabelText("email")).toHaveAttribute("maxlength", String(INPUT_MAX_LENGTH));
    expect(screen.getByLabelText("site")).toHaveAttribute("maxlength", String(URL_INPUT_MAX_LENGTH));
    expect(screen.getByLabelText("code")).toHaveAttribute("maxlength", "8");
    expect(screen.getByLabelText("notes")).toHaveAttribute("maxlength", String(TEXTAREA_MAX_LENGTH));
    expect(screen.getByLabelText("csv")).toHaveAttribute("maxlength", "5000000");
  });

  it("leaves non-text inputs alone", () => {
    render(
      <>
        <Input aria-label="date" type="date" />
        <Input aria-label="file" type="file" />
      </>,
    );
    expect(screen.getByLabelText("date")).not.toHaveAttribute("maxlength");
    expect(screen.getByLabelText("file")).not.toHaveAttribute("maxlength");
  });
});
