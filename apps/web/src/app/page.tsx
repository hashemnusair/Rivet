"use client";

import {
  ArrowRight,
  Banknote,
  Check,
  Dumbbell,
  MapPin,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DecorativeQr } from "@/components/marketing/decorative-qr";
import { HeroDevices } from "@/components/marketing/hero-devices";
import { Reveal } from "@/components/marketing/reveal";
import { RivetLoopMachine } from "@/components/marketing/rivet-loop-machine";
import { ScrollProgress } from "@/components/marketing/scroll-progress";
import { VocabularyMarquee } from "@/components/marketing/vocabulary-marquee";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { Button } from "@/components/ui/button";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import {
  ANNUAL_DISCOUNT_PERCENT,
  calculatePlanPrice,
  formatJodMinor,
  pricingSignupHref,
  publicPlanFeatures,
  resolvePublicPricingPlans,
  type BillingInterval,
} from "@/lib/public/pricing";

/** Hero entrance order, in ms — one cascade from eyebrow to the stat rail. */
const HERO_STEP = {
  eyebrow: 0,
  line1: 70,
  line2: 140,
  line3: 210,
  copy: 300,
  actions: 380,
  note: 440,
  stats: 500,
} as const;

export default function LandingPage() {
  const { saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  const marketplaceGyms = useMarketplaceGyms();
  const pricingPlans = resolvePublicPricingPlans(saasPlans);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  return (
    <div className="marketing-body min-h-screen bg-paper text-ink">
      <ScrollProgress />
      <PublicHeader />

      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section className="relative overflow-hidden border-b border-ink/10">
          {/* Ruled backdrop, faded out at the edges so it never competes with
              the headline. Texture only — no painted colour. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="marketing-grid-sm absolute inset-0 [mask-image:radial-gradient(115%_85%_at_72%_18%,black,transparent_72%)]" />
          </div>

          <div className="relative mx-auto grid max-w-[1440px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:px-12 lg:py-20">
            <div>
              <p
                className="flex animate-rise-in items-center gap-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.18em] text-ink-3"
                style={{ animationDelay: `${HERO_STEP.eyebrow}ms` }}
              >
                <span className="h-px w-10 origin-left animate-underline bg-signal [animation-delay:250ms]" />
                Revenue &amp; operations OS · Built in Amman
              </p>

              <h1 className="marketing-display mt-7 text-[clamp(2.7rem,5vw,4.7rem)] leading-[0.9]">
                <span className="block animate-rise-in" style={{ animationDelay: `${HERO_STEP.line1}ms` }}>
                  Every member.
                </span>
                <span className="block animate-rise-in" style={{ animationDelay: `${HERO_STEP.line2}ms` }}>
                  Every dinar.
                </span>
                <span className="block animate-rise-in text-signal" style={{ animationDelay: `${HERO_STEP.line3}ms` }}>
                  {/* The rule is measured off the words, not a guessed width. */}
                  <span className="relative inline-block">
                    Every shift.
                    <span className="absolute inset-x-0 -bottom-1 h-[3px] origin-left animate-underline bg-signal [animation-delay:620ms] rtl:origin-right" />
                  </span>
                </span>
              </h1>

              <p
                className="mt-8 max-w-xl animate-rise-in text-[16px] leading-[1.65] text-ink-2 sm:text-[17px]"
                style={{ animationDelay: `${HERO_STEP.copy}ms` }}
              >
                RIVET joins the sales desk, the gym floor, the cash drawer and the member&rsquo;s phone into one record — from
                the first free trial to the tenth renewal.
              </p>

              <div
                className="mt-8 flex animate-rise-in flex-wrap gap-3"
                style={{ animationDelay: `${HERO_STEP.actions}ms` }}
              >
                <Button asChild variant="signal" size="lg" className="group">
                  <Link href="/signup">
                    Send a gym application{" "}
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="#product">See how it works</Link>
                </Button>
              </div>

              <p
                className="mt-4 animate-rise-in text-[12.5px] text-ink-3"
                style={{ animationDelay: `${HERO_STEP.note}ms` }}
              >
                Gym access is issued after application review and operator onboarding.
              </p>

              <dl
                className="mt-12 grid max-w-2xl animate-rise-in grid-cols-2 gap-x-8 gap-y-6 border-t border-ink/10 pt-8 xl:grid-cols-4"
                style={{ animationDelay: `${HERO_STEP.stats}ms` }}
              >
                {[
                  ["Cash · Card · CliQ", "Every tender receipted"],
                  ["Multi-branch", "One ledger, every floor"],
                  ["Arabic / RTL", "Native from day one"],
                  ["Member QR", "One scan, clear verdict"],
                ].map(([term, detail]) => (
                  <div key={term} className="group relative">
                    <span className="absolute -top-8 left-0 h-px w-0 bg-signal transition-[width] duration-500 ease-out group-hover:w-full" />
                    <dt className="font-mono text-[9.5px] font-medium uppercase tracking-[0.12em] text-ink transition-colors duration-300 group-hover:text-signal">
                      {term}
                    </dt>
                    <dd className="mt-1.5 text-[11.5px] leading-snug text-ink-3">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroDevices />
          </div>
        </section>

        {/* ---------------------------------------------------------- Vocabulary */}
        <VocabularyMarquee />

        {/* ------------------------------------------------------------- Numbers */}
        <section className="border-b border-ink/10 bg-sunken">
          <div className="mx-auto grid max-w-[1440px] divide-y divide-ink/10 px-5 sm:px-8 md:grid-cols-4 md:divide-x md:divide-y-0 lg:px-12">
            {[
              ["Live", "branch operations in one workspace"],
              ["One", "chronological member timeline"],
              ["Audited", "payments, shifts and overrides"],
              ["Scoped", "roles, branches and tenant access"],
            ].map(([value, label], index) => (
              <Reveal key={label} delay={index * 90} className={index === 0 ? "py-8 md:pe-6" : "py-8 md:px-6"}>
                <div className="group">
                  <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-4 transition-colors duration-300 group-hover:text-signal">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-[34px] font-semibold leading-none tabular transition-transform duration-500 ease-out group-hover:-translate-y-0.5">
                    {value}
                  </p>
                  <p className="mt-2 text-[12.5px] text-ink-3">{label}</p>
                </div>
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
                index={0}
                icon={<Users />}
                label="Member 360"
                title="The whole story"
                copy="Calls, trials, plans, payments, freezes, visits and renewals in one chronological record."
              />
              <DarkFeature
                index={1}
                icon={<ScanLine />}
                label="Reception"
                title="A verdict, not a guess"
                copy="Valid, expiring, frozen, depleted or blocked — with the next action already attached."
              />
              <DarkFeature
                index={2}
                icon={<Banknote />}
                label="Shift & drawer"
                title="Close in ninety seconds"
                copy="Expected against counted cash, with every variance named, explained and routed for approval."
              />
              <DarkFeature
                index={3}
                icon={<ShieldCheck />}
                label="Accountability"
                title="Every override has a name"
                copy="Discounts, refunds, freezes and voids are reasoned, tiered and written to an append-only log."
              />
            </div>
            <div className="mt-10">
              <Button asChild variant="night" size="lg" className="group">
                <Link href="/login">
                  Sign in to RIVET{" "}
                  <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
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
                ].map((item, index) => (
                  <li key={item}>
                    <Reveal delay={index * 80} className="group flex items-start gap-3 text-[14px] text-ink-2">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-success/30 transition-colors duration-300 group-hover:border-success group-hover:bg-success-bg">
                        <Check className="size-3 text-success" />
                      </span>
                      {item}
                    </Reveal>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg" className="group">
                  <Link href="/login/member/create">
                    Create a free account{" "}
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/customer/discover">Find a gym</Link>
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
            {experienceStatus !== "ready" || marketplaceGyms.length === 0 ? (
              <div className="mt-12">
                <ExperienceDataState status={experienceStatus} error={experienceError} onRetry={retryExperience} emptyTitle="No RIVET gyms are live yet" emptyDescription="The network directory is ready, but no gym has published a live listing yet." />
              </div>
            ) : (
              <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {marketplaceGyms.map((gym, index) => (
                <Reveal key={gym.id} delay={index * 80} className="h-full">
                <Link
                  href={`/customer/gyms/${gym.id}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-[transform,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:border-ink hover:shadow-pop"
                >
                  <div className="relative h-24 overflow-hidden px-5 py-4 text-white" style={{ backgroundColor: gym.accent }}>
                    <div className="absolute inset-0 opacity-20 marketing-grid" />
                    <span className="relative flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.16em]">
                      {gym.shortName}
                      <span className="flex items-center gap-1">
                        <Dumbbell className="size-3" /> {gym.trainers?.length ?? 0} PT
                      </span>
                    </span>
                    <Dumbbell
                      className="absolute bottom-3 end-4 size-8 opacity-30 transition-transform duration-500 ease-out group-hover:-rotate-12 group-hover:scale-110"
                      strokeWidth={1.4}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <p className="eyebrow">{gym.category}</p>
                    <h3 className="mt-1.5 text-[19px] font-semibold tracking-tight">{gym.name}</h3>
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2">{gym.tagline}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                        <MapPin className="size-3.5" /> {gym.areas.join(" · ")}
                      </span>
                      <span className="flex items-center gap-1.5 text-[12px] font-medium">
                        JD {gym.fromPriceMinor / 1000}+
                        <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                      </span>
                    </div>
                  </div>
                </Link>
                </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------- Pricing */}
        <section id="pricing" className="scroll-mt-20 border-b border-ink/10 bg-sunken px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro
              eyebrow="Pricing"
              title="One branch or every branch. Same system."
              description="Every plan includes the marketplace listing, the member app, staff permissions, audit history and the complete revenue loop. Choose monthly or save 20% with annual billing."
            />
            {experienceStatus === "error" && saasPlans.length === 0 ? (
              <div className="mt-8">
                <ExperienceDataState status={experienceStatus} error={experienceError} onRetry={retryExperience} emptyTitle="Showing launch pricing" emptyDescription="The live catalog is temporarily unavailable. These prices are the approved launch defaults." />
              </div>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="eyebrow">Billing cadence</p>
                <p className="mt-1 text-[12px] text-ink-3">Same workspace features either way. Annual is paid once and saves {ANNUAL_DISCOUNT_PERCENT}%.</p>
              </div>
              <div role="tablist" aria-label="Billing interval" className="inline-flex rounded-md border border-line bg-surface p-1 shadow-sm">
                {(["monthly", "annual"] as const).map((interval) => {
                  const selected = billingInterval === interval;
                  return (
                    <button
                      key={interval}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="pricing-plans"
                      onClick={() => setBillingInterval(interval)}
                      className={`rounded px-4 py-2 text-[12px] font-medium transition-colors ${selected ? "bg-ink text-paper" : "text-ink-3 hover:text-ink"}`}
                    >
                      {interval === "monthly" ? "Monthly" : "Annual · Save 20%"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div id="pricing-plans" role="tabpanel" className="mt-6 grid gap-4 lg:grid-cols-4">
                {pricingPlans.map((plan, index) => {
                  const price = calculatePlanPrice(plan, billingInterval);
                  const features = publicPlanFeatures(plan);
                  const isEnterprise = plan.name === "Enterprise";
                  const isNight = plan.tone === "night";
                  return (
                <Reveal key={plan.name} delay={index * 90} className="h-full">
                  <div
                    className={`h-full transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-pop ${
                      isNight
                        ? "night-surface rounded-lg bg-night p-6 text-night-ink"
                        : plan.tone === "signal"
                          ? "rounded-lg border-2 border-signal bg-surface p-6 shadow-pop"
                          : "rounded-lg border border-line bg-surface p-6"
                    }`}
                  >
                  <div className="flex items-center justify-between">
                    <p className={plan.tone === "night" ? "eyebrow-night" : "eyebrow"}>{plan.name}</p>
                    {plan.tone === "signal" ? (
                      <span className="rounded-sm bg-signal px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white">
                        Most popular
                      </span>
                    ) : isEnterprise ? (
                      <span className="rounded-sm border border-night-line px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-night-ink-2">
                        Multi-site
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-6">
                    <span className="text-[34px] font-semibold tabular">JD {formatJodMinor(price.effectiveMonthlyMinor)}</span>
                    <span className={isNight ? "text-night-ink-3" : "text-ink-3"}> / month</span>
                  </p>
                  {billingInterval === "annual" ? (
                    <div className={isNight ? "mt-1 text-[11px] text-night-ink-3" : "mt-1 text-[11px] text-ink-3"}>
                      JD {formatJodMinor(price.annualTotalMinor)} billed annually · <strong className={isNight ? "text-night-ink-2" : "text-ink-2"}>Save {ANNUAL_DISCOUNT_PERCENT}%</strong>
                    </div>
                  ) : (
                    <div className={isNight ? "mt-1 text-[11px] text-night-ink-3" : "mt-1 text-[11px] text-ink-3"}>Billed monthly · cancel before renewal</div>
                  )}
                  <ul className={`mt-7 grid gap-2.5 text-[13px] ${isNight ? "text-night-ink-2" : "text-ink-2"}`}>
                    {features.map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    variant={isNight ? "night" : plan.tone === "signal" ? "signal" : "secondary"}
                    className="mt-8 w-full"
                  >
                    <Link href={pricingSignupHref(plan.name, billingInterval)}>Send gym application</Link>
                  </Button>
                  </div>
                </Reveal>
                  );
                })}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------------- CTA */}
        <section className="marketing-grid relative overflow-hidden px-5 py-24 sm:px-8 lg:px-12">
          <div className="relative mx-auto max-w-3xl text-center">
            <Reveal>
              <p className="eyebrow">First cohort onboarding in Amman</p>
              <h2 className="marketing-display mt-5 text-[clamp(2.6rem,5.2vw,4.4rem)] leading-[0.92]">
                See it on your own numbers.
              </h2>
              <p className="mx-auto mt-6 max-w-xl text-[15.5px] leading-relaxed text-ink-2">
                We configure a pilot around your own branches, members and operating rules so the team can validate the complete workflow on authoritative data.
              </p>
              {/* One action here — the header already carries sign-in, and the ops
                  section owns the demo link. */}
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Button asChild variant="signal" size="lg" className="group">
                  <Link href="/signup">
                    Send a gym application{" "}
                    <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The member app as a card — the same surfaces the phone in the hero shows,
 * at reading size. Values stay non-numeric: this is the shape of the record,
 * not a claim about anyone's membership.
 */
function MemberCard() {
  return (
    <Reveal>
      <div className="night-surface mx-auto w-full max-w-sm rounded-lg bg-night p-6 text-night-ink shadow-[0_24px_70px_rgb(27_26_21/0.22)]">
        <div className="flex items-center justify-between border-b border-night-line pb-4 font-mono text-[9px] uppercase tracking-[0.15em] text-night-ink-3">
          <span>RIVET MEMBER</span>
          <span className="flex items-center gap-1.5 text-success">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 animate-pulse-ring rounded-full bg-current" />
              <span className="relative size-1.5 rounded-full bg-current" />
            </span>
            LIVE WORKSPACE
          </span>
        </div>
        <p className="mt-6 eyebrow-night">Your gym membership</p>
        <h3 className="mt-1.5 text-[27px] font-semibold tracking-tight">One verified member record</h3>
        <p className="mt-1 font-mono text-[10px] text-night-ink-3">PLAN · BRANCH · MEMBER NUMBER</p>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-md bg-night-line">
          <div className="bg-night-2 p-4 transition-colors duration-300 hover:bg-night-3">
            <p className="eyebrow-night">Membership</p>
            <p className="mt-2 text-[14px] font-semibold">Live gym status</p>
          </div>
          <div className="bg-night-2 p-4 transition-colors duration-300 hover:bg-night-3">
            <p className="eyebrow-night">Visits</p>
            <p className="mt-2 text-[14px] font-semibold">Recorded check-ins</p>
          </div>
        </div>

        {/* The entry code, with the desk's scan sweeping it — decorative only. */}
        <div className="mt-5 rounded-md bg-night-2 p-4">
          <div className="relative mx-auto w-full max-w-[168px] overflow-hidden rounded-sm bg-night-ink p-3 text-night">
            <DecorativeQr />
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] animate-qr-scan bg-signal" aria-hidden />
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold">
            <ScanLine className="size-3.5 text-signal" /> Entry QR after activation
          </p>
          <p className="mt-1 text-center text-[10px] text-night-ink-3">
            Issued only from an active persisted membership.
          </p>
        </div>

        <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">
          Check-in identity · authorized by the gym
        </p>
      </div>
    </Reveal>
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

function DarkFeature({
  icon,
  label,
  title,
  copy,
  index,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  copy: string;
  index: number;
}) {
  return (
    <Reveal delay={index * 90}>
      <div className="group relative h-full bg-night-2 p-6 transition-colors duration-300 hover:bg-night-3">
        {/* A signal rule draws across the cell on hover — the same accent the
            product uses to mark the active surface. */}
        <span className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-signal transition-transform duration-500 ease-out group-hover:scale-x-100 rtl:origin-right" />
        <span className="flex size-10 items-center justify-center rounded-md border border-night-line text-signal transition-colors duration-300 group-hover:border-signal group-hover:bg-signal group-hover:text-white [&_svg]:size-4">
          {icon}
        </span>
        <p className="mt-7 eyebrow-night">{label}</p>
        <h3 className="mt-2.5 text-[19px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-3 text-[12.5px] leading-relaxed text-night-ink-2">{copy}</p>
      </div>
    </Reveal>
  );
}
