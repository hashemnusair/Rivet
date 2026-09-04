import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SignaturePad, type SignatureValue } from "./signature-pad";

function Harness() {
  const [value, setValue] = useState<SignatureValue>({ method: "drawn" });
  return <SignaturePad value={value} onChange={setValue} signatoryName="Omar Al-Khatib" />;
}

describe("signature pad", () => {
  it("sizes the canvas again after switching to typing and back, so strokes land under the pointer", async () => {
    vi.stubGlobal("devicePixelRatio", 2);
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole("img", { name: /Sign here/ }) as HTMLCanvasElement;
    // jsdom has no layout, so the pad falls back to its 600pt width at 2x.
    expect(first.getAttribute("width")).toBe("1200");
    expect(first.getAttribute("height")).toBe("360");

    await user.click(screen.getByRole("radio", { name: "Type my name" }));
    expect(screen.queryByRole("img", { name: /Sign here/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Draw" }));
    const second = screen.getByRole("img", { name: /Sign here/ }) as HTMLCanvasElement;
    expect(second).not.toBe(first);
    // A freshly mounted canvas would otherwise sit at the browser default of 300 x 150.
    expect(second.getAttribute("width")).toBe("1200");
    expect(second.getAttribute("height")).toBe("360");
    expect(screen.getByText("Sign here")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
