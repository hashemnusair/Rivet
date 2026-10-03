"use client";
import { useT } from "@/lib/i18n/provider";

import { usePublicSiteHref } from "@/lib/routing/use-public-site-href";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { usePublicViewer } from "@/lib/auth/public-viewer";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";
import { publicDestinationCopy } from "@/components/public/public-plan-copy";

/**
 * The public site's footer — the site map lives here, so every area is one
 * click away. Signed out it offers sign-in; signed in it names the
 * visitor's own area and offers sign-out, and drops the application and
 * account-creation links. The public origin keeps landing links correct on
 * member discovery and signup pages.
 */
export function PublicFooter() {
  const t = useT();
  const publicHref = usePublicSiteHref();
  const viewer = usePublicViewer();
  const signedIn = viewer.status === "signed-in" ? viewer : null;
  const destinationCopy = signedIn ? publicDestinationCopy(signedIn.destination.area, t) : null;
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
    [t("publicCompletion.footer.overview"), `${publicHref}#product`],
    [t("publicCompletion.footer.forMembers"), `${publicHref}#member`],
    [t("publicCompletion.header.pricing"), `${publicHref}#pricing`],
  ];
  if (!signedIn) productLinks.push([t("publicCompletion.footer.apply"), `${publicHref.split("?")[0]}signup`]);

  const memberLinks: Array<[string, string]> = [[t("publicCompletion.footer.findGym"), "/customer/discover"]];
  if (signedIn) {
    if (signedIn.destination.area === "member") memberLinks.push([t("publicCompletion.footer.myGyms"), signedIn.destination.href]);
  } else {
    memberLinks.push([t("publicCompletion.footer.createAccount"), "/login/member/create"]);
  }

  return (
    <footer className="night-surface bg-night text-night-ink">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr] lg:px-12">
        <div>
            <Image src="/brand/rivet-lockup-rev.png" alt={t("common.brand.name")} width={140} height={36} />
          <p className="mt-5 max-w-xs text-[13.5px] leading-relaxed text-night-ink-2">
            {t("publicCompletion.footer.intro")}
          </p>
          <p className="mt-6 text-[12px] font-medium text-night-ink-3">{t("publicCompletion.footer.madeIn")}</p>
        </div>
        <FooterColumn title={t("marketing.footer.product")} links={productLinks} />
        <FooterColumn title={t("palette.groups.members")} links={memberLinks} />
        {signedIn ? (
          <nav aria-label={t("publicCompletion.footer.account")}>
            <p className="text-[12px] font-medium text-night-ink-3">{t("publicCompletion.footer.account")}</p>
            <div className="mt-4 grid gap-3">
              <Link href={signedIn.destination.href} className="text-[13px] text-night-ink-2 transition-colors hover:text-night-ink">
                {destinationCopy?.action}
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="w-fit cursor-pointer text-start text-[13px] text-night-ink-2 transition-colors hover:text-night-ink disabled:cursor-default disabled:text-night-ink-3"
              >
                {signingOut ? t("publicCompletion.footer.signingOut") : t("common.action.signOut")}
              </button>
            </div>
          </nav>
        ) : (
          <FooterColumn title={t("common.action.signIn")} links={[[t("publicCompletion.footer.signInToRivet"), "/login"]]} />
        )}
        <nav aria-label={t("publicCompletion.footer.contact")}>
          <p className="text-[12px] font-medium text-night-ink-3">{t("publicCompletion.footer.contact")}</p>
          <div className="mt-4 grid gap-3 text-[13px]">
            <a href={RIVET_CONTACT.phoneHref} className="text-night-ink-2 transition-colors hover:text-night-ink" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a>
            <a href={RIVET_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="text-night-ink-2 transition-colors hover:text-night-ink">{t("publicCompletion.footer.whatsappLink")}</a>
            <a href={RIVET_CONTACT.instagramHref} target="_blank" rel="noreferrer" className="text-night-ink-2 transition-colors hover:text-night-ink" dir="ltr">{RIVET_CONTACT.instagramHandle}</a>
            <span className="text-night-ink-3">{t("publicCompletion.header.city")}</span>
          </div>
        </nav>
      </div>
      <div className="border-t border-night-line px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 text-[12px] font-medium text-night-ink-3">
          <span>{t("marketing.footer.copyright")}</span>
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {LEGAL_LINKS.map((item) => <Link key={item.href} href={item.href} className="transition-colors hover:text-night-ink">{t(item.href === "/terms" ? "auth.chrome.terms" : "auth.chrome.privacy")}</Link>)}
          </span>
          <span>{t("common.brand.tagline")}</span>
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
