// @vitest-environment-options {"url":"https://www.rivetjo.com/login"}
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SheetLink } from "./page-sheet";

vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/app/login/sign-in-art", () => ({ DrawingLoop: () => null }));

describe("sheet links across RIVET hosts", () => {
  it("connects ahead, once, to another host a link crosses to", () => {
    render(
      <>
        <SheetLink href="/login/gym">Gym team</SheetLink>
        <SheetLink href="/login/gym?art=account">Gym team again</SheetLink>
        <SheetLink href="/login/member">Gym member</SheetLink>
        <SheetLink href="/terms">Terms</SheetLink>
      </>,
    );
    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>("link[rel='preconnect']"));
    expect(links.map((link) => link.href)).toEqual(["https://dashboard.rivetjo.com/", "https://app.rivetjo.com/"]);
  });
});
