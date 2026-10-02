import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { ContextLabel, TechnicalLabel } from "./typography";

describe("product typography", () => {
  it("distinguishes human context from technical metadata", () => {
    render(
      <>
        <ContextLabel>Member finance</ContextLabel>
        <TechnicalLabel>RV-001006</TechnicalLabel>
      </>,
    );

    expect(screen.getByText("Member finance")).toHaveAttribute("data-rivet-label", "context");
    expect(screen.getByText("Member finance")).not.toHaveClass("font-mono", "uppercase");
    expect(screen.getByText("RV-001006")).toHaveAttribute("data-rivet-label", "technical");
    expect(screen.getByText("RV-001006")).toHaveClass("font-mono", "uppercase");
  });

  it("uses readable context labels in page headings and stats", () => {
    render(
      <>
        <PageHeader sectionLabel="Member records" title="Members" />
        <Stat label="Collected today" value="JOD 767.750" />
      </>,
    );

    expect(screen.getByText("Member records")).toHaveAttribute("data-rivet-label", "context");
    expect(screen.getByText("Collected today")).toHaveAttribute("data-rivet-label", "context");
  });
});
