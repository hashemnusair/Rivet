import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithApp, resetApiForTests } from "@/test/harness";
import { PlatformEmailLog } from "./platform-email-log.client";

const routerMock = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock, usePathname: () => "/platform/email-log", useSearchParams: () => new URLSearchParams(), useParams: () => ({}) }));

afterEach(() => resetApiForTests());

describe("platform email log", () => {
  it("lists every queued message with a plain reason for anything that did not arrive", async () => {
    await renderWithApp(<PlatformEmailLog />, { role: "owner" });
    const rows = await screen.findAllByTestId("email-log-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Not sent")).toBeInTheDocument();
    expect(within(rows[0]!).getByTestId("email-log-outcome")).toHaveTextContent("Operational email mode is off (RIVET_EMAIL_MODE)");
    expect(within(rows[0]!).getByText(/1 PDF/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Delivered")).toBeInTheDocument();
    expect(within(rows[1]!).getByTestId("email-log-outcome")).toHaveTextContent("Sent in live mode");
    expect(screen.getByText("1 of 2 sent")).toBeInTheDocument();
  });
});
