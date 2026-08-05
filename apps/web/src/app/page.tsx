"use client";

import {
  ArrowRight,
  Banknote,
  Check,
  Dumbbell,
  MapPin,
  ScanLine,
  ShieldCheck,
  Star,
  Users,
} from "lucide-react";
import Link from "next/link";
import { DecorativeQr } from "@/components/marketing/decorative-qr";
import { HeroDevices } from "@/components/marketing/hero-devices";
import { Reveal } from "@/components/marketing/reveal";
import { LoadingLink } from "@/components/marketing/route-loader";
import { RivetLoopMachine } from "@/components/marketing/rivet-loop-machine";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { useExperience } from "@/lib/providers/experience-provider";

export default function LandingPage() {
  const { marketplaceGyms, saasPlans } = useExperience();
  return (
    <div className="marketing-body min-h-screen bg-paper text-ink">
      <PublicHeader />

      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden border-b border-ink/10">
          <div className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:px-12 lg:py-20">
            <div>
              <p className="flex items-center gap-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-3">
                <span className="h-px w-10 bg-signal" /> Revenue &amp; operations OS · Built in Amman
              </p>
              <h1 className="marketing-display mt-7 text-[clamp(2.7rem,5vw,4.7rem)] leading-[0.9]">
                Every member.
                <br />
                Every dinar.
                <br />
                <span className="text-signal">Every shift.</span>
              </h1>
              <p className="mt-7 max-w-xl text-[16px] leading-[1.65] text-ink-2 sm:text-[17px]">
                RIVET joins the sales desk, the gym floor, the cash drawer and the member&rsquo;s phone into one record — from
                the first free trial to the tenth renewal.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="signal" size="lg">
                  <Link href="/signup">
                    Start a free trial <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="#product">See how it works</Link>
                </Button>
              </div>
              <p className="mt-4 text-[12.5px] text-ink-3">14 days · No card required · Your data stays yours</p>

              <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-6 border-t border-ink/10 pt-8 xl:grid-cols-4">
                {[
                  ["Cash · Card · CliQ", "Every tender receipted"],
                  ["Multi-branch", "One ledger, every floor"],
                  ["Arabic / RTL", "Native from day one"],
                  ["Member QR", "One scan, clear verdict"],
                ].map(([term, detail]) => (
                  <div key={term}>
                    <dt className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink">{term}</dt>
                    <dd className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroDevices />
          </div>
        </section>

        {/* ------------------------------------------------------------- Numbers */}
        <section className="border-b border-ink/10 bg-sunken">
          <div className="mx-auto grid max-w-[1440px] divide-y divide-ink/10 px-5 sm:px-8 md:grid-cols-4 md:divide-x md:divide-y-0 lg:px-12">
            {[
              ["4", "gyms live in Amman"],
              ["3,160", "members under management"],
              ["JD 154K", "collected and reconciled monthly"],
              ["0", "spreadsheets required"],
            ].map(([value, label], index) => (
              <Reveal key={label} delay={index * 90} className={index === 0 ? "py-8 md:pe-6" : "py-8 md:px-6"}>
                <p className="text-[34px] font-semibold leading-none tabular">{value}</p>
                <p className="mt-2 text-[12.5px] text-ink-3">{label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------------- Loop */}
        <RivetLoopMachine />

        {/* ----------------------------------------------------------------- Ops */}
        <section className="night-surface bg-night px-5 py-20 text-night-ink sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro
              dark
              eyebrow="RIVET for gyms"
              title="Depth where gyms lose money."
              description="Not a wall of dashboards — a working surface for selling, collecting, checking in, reconciling and supervising."
            />
            <div className="mt-12 grid gap-px overflow-hidden rounded-lg border border-night-line bg-night-line md:grid-cols-2 lg:grid-cols-4">
              <DarkFeature
                icon={<Users />}
                label="Member 360"
                title="The whole story"
                copy="Calls, trials, plans, payments, freezes, visits and renewals in one chronological record."
              />
              <DarkFeature
                icon={<ScanLine />}
                label="Reception"
                title="A verdict, not a guess"
                copy="Valid, expiring, frozen, depleted or blocked — with the next action already attached."
              />
              <DarkFeature
                icon={<Banknote />}
                label="Shift & drawer"
                title="Close in ninety seconds"
                copy="Expected against counted cash, with every variance named, explained and routed for approval."
              />
              <DarkFeature
                icon={<ShieldCheck />}
                label="Accountability"
                title="Every override has a name"
                copy="Discounts, refunds, freezes and voids are reasoned, tiered and written to an append-only log."
              />
            </div>
            <div className="mt-10">
              <Button asChild variant="night" size="lg">
                <Link href="/login">
                  Open the gym demo <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- Member */}
        <section id="member" className="scroll-mt-20 border-b border-ink/10 px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto grid max-w-[1344px] gap-14 lg:grid-cols-[1fr_0.85fr] lg:items-center">
            <div>
              <SectionIntro
                stacked
                eyebrow="RIVET for members"
                title="Their side of the counter."
                description="One account finds new gyms, books a free trial, and holds every active membership — no app store, no plastic card, no screenshots of old receipts."
              />
              <ul className="mt-8 grid gap-3.5">
                {[
                  "Membership status, expiry, visits and balance at a glance",
                  "A dedicated QR identity for fast entry at the desk",
                  "Receipts and payment history that survive a lost phone",
                  "Arabic or English, per member",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[14px] text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" /> {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <Link href="/customer/signup">
                    Create a free account <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <LoadingLink href="/customer/discover">Find a gym</LoadingLink>
                </Button>
              </div>
            </div>

            <MemberCard />
          </div>
        </section>

        {/* --------------------------------------------------------- Marketplace */}
        <section className="border-b border-ink/10 px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro
              eyebrow="The RIVET network"
              title="Find the gym. Book before you visit."
              description="Only gyms actually operating on RIVET appear in discovery, so a trial request lands on a real follow-up queue instead of an inbox."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {marketplaceGyms.map((gym, index) => (
                <Reveal key={gym.id} delay={index * 80} className="h-full">
                <Link
                  href={`/customer/gyms/${gym.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-ink hover:shadow-pop"
                >
                  <div className="relative h-24 px-5 py-4 text-white" style={{ backgroundColor: gym.accent }}>
                    <div className="absolute inset-0 opacity-20 marketing-grid" />
                    <span className="relative flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.16em]">
                      {gym.shortName}
                      <span className="flex items-center gap-1">
                        <Star className="size-3 fill-current" /> {gym.rating}
                      </span>
                    </span>
                    <Dumbbell className="absolute bottom-3 end-4 size-8 opacity-30" strokeWidth={1.4} />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="eyebrow">{gym.category}</p>
                    <h3 className="mt-1.5 text-[19px] font-semibold tracking-tight">{gym.name}</h3>
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">{gym.tagline}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        <MapPin className="size-3.5" /> {gym.areas.join(" · ")}
                      </span>
                      <span className="text-[12px] font-medium">JD {gym.fromPriceMinor / 1000}+</span>
                    </div>
                  </div>
                </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Pricing */}
        <section id="pricing" className="scroll-mt-20 border-b border-ink/10 bg-sunken px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro
              eyebrow="Pricing"
              title="One branch or eight. Same system."
              description="Every plan includes the marketplace listing, the member app, staff permissions, audit history and the complete revenue loop. Change plans any time before the trial ends."
            />
            <div className="mt-12 grid gap-4 lg:grid-cols-3">
              {saasPlans.map((plan, index) => (
                <Reveal
                  key={plan.name}
                  delay={index * 90}
                  className={
                    plan.tone === "night"
                      ? "night-surface rounded-lg bg-night p-6 text-night-ink"
                      : plan.tone === "signal"
                        ? "rounded-lg border-2 border-signal bg-surface p-6 shadow-pop"
                        : "rounded-lg border border-line bg-surface p-6"
                  }
                >
                  <div className="flex items-center justify-between">
                    <p className={plan.tone === "night" ? "eyebrow-night" : "eyebrow"}>{plan.name}</p>
                    {plan.tone === "signal" ? (
                      <span className="rounded-sm bg-signal px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-6">
                    <span className="text-[38px] font-semibold tabular">JD {plan.priceMinor / 1000}</span>
                    <span className={plan.tone === "night" ? "text-night-ink-3" : "text-ink-3"}> / month</span>
                  </p>
                  <ul className={`mt-7 grid gap-2.5 text-[13px] ${plan.tone === "night" ? "text-night-ink-2" : "text-ink-2"}`}>
                    {[
                      `${plan.branches} ${plan.branches === 1 ? "branch" : "branches"}`,
                      `Up to ${plan.staff} staff accounts`,
                      `Up to ${plan.members.toLocaleString()} members`,
                      "Member app and marketplace included",
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check className={`mt-0.5 size-3.5 shrink-0 ${plan.tone === "night" ? "text-success" : "text-success"}`} />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={plan.tone === "night" ? "night" : plan.tone === "signal" ? "signal" : "secondary"}
                    className="mt-8 w-full"
                  >
                    <Link href="/signup">Start 14-day trial</Link>
                  </Button>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- CTA */}
        <section className="marketing-grid px-5 py-24 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">First cohort onboarding in Amman</p>
            <h2 className="marketing-display mt-5 text-[clamp(2.6rem,5.2vw,4.4rem)] leading-[0.92]">
              See it on your own numbers.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-relaxed text-ink-2">
              Fourteen days, your own members, no card. Import last month, open a shift, and watch where the money
              actually goes.
            </p>
            {/* One action here — the header already carries sign-in, and the ops
                section owns the demo link. */}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild variant="signal" size="lg">
                <Link href="/signup">
                  Start a free trial <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------

function MemberCard() {
  return (
    <div className="night-surface mx-auto w-full max-w-sm rounded-lg bg-night p-6 text-night-ink shadow-[0_24px_70px_rgb(27_26_21/0.22)]">
      <div className="flex items-center justify-between border-b border-night-line pb-4 font-mono text-[9px] uppercase tracking-[0.15em] text-night-ink-3">
        <span>RIVET MEMBER</span>
        <span>19:41</span>
      </div>
      <p className="mt-6 eyebrow-night">Forge Fitness · Abdoun</p>
      <h3 className="mt-1.5 text-[27px] font-semibold tracking-tight">Lina Haddad</h3>
      <p className="mt-1 font-mono text-[10px] text-night-ink-3">6-MONTH · #ABD-2214</p>
      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-night-line">
        <div className="bg-night-2 p-4">
          <p className="eyebrow-night">Renews in</p>
          <p className="mt-2 text-[25px] font-semibold text-warning">12 days</p>
        </div>
        <div className="bg-night-2 p-4">
          <p className="eyebrow-night">Visits · Jul</p>
          <p className="mt-2 text-[25px] font-semibold">14</p>
        </div>
      </div>
      <div className="mt-5 rounded-md bg-night-ink p-5 text-night">
        <DecorativeQr />
      </div>
      <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">
        Check-in identity · refreshes securely
      </p>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  description,
  dark = false,
  stacked = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  dark?: boolean;
  stacked?: boolean;
}) {
  return (
    <Reveal className={stacked ? "max-w-xl" : "grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end"}>
      <div>
        <p className={`font-mono text-[10px] font-medium uppercase tracking-[0.18em] ${dark ? "text-signal" : "text-ink-3"}`}>{eyebrow}</p>
        <h2
          className={`marketing-display mt-4 text-[clamp(2.3rem,4vw,3.7rem)] leading-[0.95] ${dark ? "text-night-ink" : "text-ink"}`}
        >
          {title}
        </h2>
      </div>
      <p className={`text-[14.5px] leading-[1.7] ${dark ? "text-night-ink-2" : "text-ink-2"} ${stacked ? "mt-5" : "lg:pb-2"}`}>
        {description}
      </p>
    </Reveal>
  );
}

function DarkFeature({ icon, label, title, copy }: { icon: React.ReactNode; label: string; title: string; copy: string }) {
  return (
    <Reveal className="bg-night-2 p-6 transition-colors hover:bg-night-3">
      <span className="flex size-10 items-center justify-center rounded-md border border-night-line text-signal [&_svg]:size-4">{icon}</span>
      <p className="mt-7 eyebrow-night">{label}</p>
      <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{title}</h3>
      <p className="mt-3 text-[12.5px] leading-relaxed text-night-ink-2">{copy}</p>
    </Reveal>
  );
}
