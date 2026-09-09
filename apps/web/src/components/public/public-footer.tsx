"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePublicViewer } from "@/lib/auth/public-viewer";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";

/**
 * The public site's footer — the site map lives here, so every area is one
 * click away. Signed out it names both doors; signed in it names the
 * visitor's own area and offers sign-out, and drops the application and
 * account-creation links. No hooks beyond the viewer, so the landing and the
 * document pages share it without carrying the member shell's machinery.
 */
export function PublicFooter() {
  const viewer = usePublicViewer();
  const signedIn = viewer.status === "signed-in" ? viewer : null;
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    if (!signedIn || signingOut) return;
    setSigningOut(true);
    try {
      await signedIn.signOut();
    } catch {
      setSigningOut(false);
      return;
    }
    setSigningOut(false);
  };

  const productLinks: Array<[string, string]> = [
    ["Overview", "/#product"],
    ["For members", "/#member"],
    ["Pricing", "/#pricing"],
  ];
  if (!signedIn) productLinks.push(["Send gym application", "/signup"]);

  const memberLinks: Array<[string, string]> = [["Find a gym", "/customer/discover"]];
  if (signedIn) {
    if (signedIn.destination.area === "member") memberLinks.push(["My gyms", signedIn.destination.href]);
  } else {
    memberLinks.push(["Create a member account", "/login/member/create"]);
  }

  return (
    <footer className="night-surface bg-night text-night-ink">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] lg:px-12">
        <div>
            <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={140} height={36} />
          <p className="mt-5 max-w-xs text-[13.5px] leading-relaxed text-night-ink-2">
            The revenue and operations system for gyms — and the simplest way for members to find, join, and enter them.
          </p>
          <p className="mt-6 text-[12px] font-medium text-night-ink-3">صُنع في عمّان · Made in Amman</p>
        </div>
        <FooterColumn title="Product" links={productLinks} />
        <FooterColumn title="Members" links={memberLinks} />
        {signedIn ? (
          <nav aria-label="Your account">
            <p className="text-[12px] font-medium text-night-ink-3">Your account</p>
            <div className="mt-4 grid gap-3">
              <Link href={signedIn.destination.href} className="text-[13px] text-night-ink-2 transition-colors hover:text-night-ink">
                {signedIn.destination.verb}
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="w-fit cursor-pointer text-start text-[13px] text-night-ink-2 transition-colors hover:text-night-ink disabled:cursor-default disabled:text-night-ink-3"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </nav>
        ) : (
          <FooterColumn
            title="Sign in"
            links={[
              ["Gym sign in", "/login/gym"],
              ["Member sign in", "/login/member"],
            ]}
          />
        )}
        <nav aria-label="Contact RIVET">
          <p className="text-[12px] font-medium text-night-ink-3">Contact</p>
          <div className="mt-4 grid gap-3 text-[13px]">
            <a href={RIVET_CONTACT.phoneHref} className="text-night-ink-2 transition-colors hover:text-night-ink" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a>
            <a href={RIVET_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="text-night-ink-2 transition-colors hover:text-night-ink">WhatsApp RIVET</a>
            <a href={RIVET_CONTACT.instagramHref} target="_blank" rel="noreferrer" className="text-night-ink-2 transition-colors hover:text-night-ink" dir="ltr">{RIVET_CONTACT.instagramHandle}</a>
            <span className="text-night-ink-3">{RIVET_CONTACT.city}</span>
          </div>
        </nav>
      </div>
      <div className="border-t border-night-line px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 text-[12px] font-medium text-night-ink-3">
          <span>© 2026 RIVET · Amman, Jordan</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((item) => <Link key={item.href} href={item.href} className="transition-colors hover:text-night-ink">{item.label}</Link>)}
          </span>
          <span>Every member. Every dinar. Every shift.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <nav aria-label={title}>
      <p className="text-[12px] font-medium text-night-ink-3">{title}</p>
      <div className="mt-4 grid gap-3">
        {links.map(([label, href]) => (
          <Link key={href + label} href={href} className="text-[13px] text-night-ink-2 transition-colors hover:text-night-ink">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
