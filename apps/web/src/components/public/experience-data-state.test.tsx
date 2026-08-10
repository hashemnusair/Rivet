import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExperienceDataState } from "./experience-data-state";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("ExperienceDataState", () => {
  it("offers a gym application when the live directory is intentionally empty", () => {
    render(
      <ExperienceDataState
        status="ready"
        onRetry={vi.fn()}
        emptyTitle="No RIVET gyms are live yet"
        emptyDescription="Gyms appear here after approval."
        emptyAction={<a href="/signup">Send a gym application</a>}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Gyms appear here after approval.");
    expect(screen.getByRole("link", { name: "Send a gym application" })).toHaveAttribute("href", "/signup");
  });
});
