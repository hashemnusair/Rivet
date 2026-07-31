"use client";

import { ArrowRight, Dumbbell, LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useCustomerPersona, useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/#loop", label: "The loop" },
  { href: "/#ops", label: "Operations" },
  { href: "/customer/discover", label: "Find a gym" },
  { href: "/#pricing", label: "Pricing" },
];

export function PublicHeader({ customerMode = false }: { customerMode?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { customerSignedIn, signOutCustomer } = useExperience();
  const customer = useCustomerPersona();

  return (
    <header className="sticky top-0 z-50 border-b border-ink/10 bg-paper/95 backdrop-blur-md">
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href={customerMode ? "/customer/discover" : "/"} className="flex items-center gap-3" aria-label="RIVET home">
          <Image src="/brand/rivet-lockup.png" alt="RIVET" width={144} height={36} priority />
          {customerMode ? (
            <span className="hidden border-s border-line-2 ps-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink-3 sm:block">
              Member
            </span>
          ) : null}
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary navigation">
          {(customerMode
            ? [
                { href: "/customer/discover", label: "Discover" },
                { href: "/customer/my-gyms", label: "My gyms" },
              ]
            : NAV
          ).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "font-mono text-[10.5px] font-medium uppercase tracking-[0.17em] text-ink-2 transition-colors hover:text-ink",
                pathname === item.href && "text-signal",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {customerSignedIn ? (
            <>
              <Link href="/customer/my-gyms" className="me-2 text-[12px] font-medium text-ink-2">
                {customer?.name}
              </Link>
              <Button variant="ghost" size="sm" onClick={signOutCustomer}>
                <LogOut /> Sign out
              </Button>
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/customer/login">Member login</Link>
            </Button>
          )}
          {!customerMode ? (
            <Button asChild variant="signal" size="sm">
              <Link href="/signup">Start a gym trial <ArrowRight /></Link>
            </Button>
          ) : null}
        </div>

        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle navigation">
          {open ? <X /> : <Menu />}
        </Button>
      </div>

      {open ? (
        <div className="border-t border-line bg-paper px-5 py-5 lg:hidden">
          <nav className="grid gap-1" aria-label="Mobile navigation">
            {(customerMode
              ? [
                  { href: "/customer/discover", label: "Discover gyms" },
                  { href: "/customer/my-gyms", label: "My gyms" },
                ]
              : NAV
            ).map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-[14px] font-medium hover:bg-sunken">
                {item.label}
              </Link>
            ))}
            <Link href={customerSignedIn ? "/customer/my-gyms" : "/customer/login"} onClick={() => setOpen(false)} className="mt-2 flex items-center gap-2 border-t border-line px-3 pt-4 text-[14px] font-medium">
              <Dumbbell className="size-4" /> {customerSignedIn ? customer?.name : "Member login"}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="night-surface bg-night text-night-ink">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr] lg:px-12">
        <div>
          <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={150} height={38} />
          <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-night-ink-2">
            The revenue and operations OS for gyms—and the simplest way for members to discover, join, and enter them.
          </p>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.18em] text-night-ink-3">صُنع في عمّان · Made in Amman</p>
        </div>
        <FooterColumn title="Product" links={[['Gym operations','/login'],['RIVET Member','/customer/discover'],['Platform admin','/platform'],['Pricing','/#pricing']]} />
        <FooterColumn title="Start" links={[['Book a demo','/signup'],['Find a gym','/customer/discover'],['Member login','/customer/login'],['Gym staff login','/login']]} />
      </div>
      <div className="border-t border-night-line px-5 py-5 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 font-mono text-[9.5px] uppercase tracking-[0.14em] text-night-ink-3">
          <span>© 2026 RIVET · Amman, Jordan</span>
          <span>Every member. Every dinar. Every shift.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <nav>
      <p className="font-mono text-[10px] uppercase tracking-[0.17em] text-night-ink-3">{title}</p>
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

export function CustomerShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader customerMode />
      {children}
      <PublicFooter />
    </div>
  );
}
