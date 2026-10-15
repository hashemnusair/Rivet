import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PrivacyPolicy } from "./privacy-policy";
import { TermsOfService } from "./terms-of-service";
import { RIVET_CONTACT } from "@/lib/rivet-contact";

describe("public legal documents", () => {
  it("renders the privacy policy with a numbered contents list, the retention table, and RIVET's contact details", () => {
    render(<PrivacyPolicy />);
    expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(within(contents).getAllByRole("link")).toHaveLength(15);
    expect(within(contents).getByRole("link", { name: /National ID numbers/ })).toHaveAttribute("href", "#national-id");
    expect(screen.getByRole("heading", { level: 2, name: /How long we keep it/ })).toBeInTheDocument();
    expect(screen.getByText(/Twelve months after our last contact/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: RIVET_CONTACT.phoneDisplay })).toHaveAttribute("href", "tel:+962778378608");
    expect(screen.getByRole("link", { name: RIVET_CONTACT.instagramHandle })).toHaveAttribute("href", "https://instagram.com/rivet.jo");
    expect(screen.getByRole("link", { name: "Terms of service" })).toHaveAttribute("href", "/terms");
  });

  it("renders the terms with the data processing addendum and electronic-signature clause", () => {
    render(<TermsOfService />);
    expect(screen.getByRole("heading", { level: 1, name: "Terms of service" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Contents" })).getAllByRole("link")).toHaveLength(20);
    expect(screen.getByRole("heading", { level: 2, name: /Data and the processing addendum/ })).toBeInTheDocument();
    expect(screen.getByText(/Electronic Transactions Law No. 15 of 2015/)).toBeInTheDocument();
    expect(screen.getByText(/09:00 to 21:00 Amman time/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  });

  it("publishes version 1.2 with the beta period right after availability, and points notices at the contact section", () => {
    render(<TermsOfService />);
    expect(screen.getByText(/Version 1\.2 · 15 October 2026/)).toBeInTheDocument();
    const titles = within(screen.getByRole("navigation", { name: "Contents" })).getAllByRole("link").map((link) => link.textContent);
    expect(titles[9]).toMatch(/Availability and support/);
    expect(titles[10]).toMatch(/Beta period/);
    expect(titles[19]).toMatch(/Contact/);
    expect(within(screen.getByRole("navigation", { name: "Contents" })).getByRole("link", { name: /Beta period/ })).toHaveAttribute("href", "#beta-period");
    expect(screen.getByText(/unavailable for longer than the aim in section 10 allows/)).toBeInTheDocument();
    expect(screen.getByText(/check important records, such as payments, unpaid amounts and membership dates/)).toBeInTheDocument();
    expect(screen.getByText(/to RIVET at the details in section 20\./)).toBeInTheDocument();
  });
});
