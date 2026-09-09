"use client";

import {
  ArrowRight,
  Check,
  Dumbbell,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useState, type PointerEvent } from "react";
import { CinematicHeader } from "@/components/marketing/cinematic-header";
import { HeroDevices } from "@/components/marketing/hero-devices";
import styles from "@/components/marketing/landing-cinematic.module.css";
import { LandingMotionController } from "@/components/marketing/landing-motion";
import { EntryPassCard } from "@/components/marketing/product-screens";
import {
  AccountabilityLedger,
  OperationalDay,
  RegionProof,
  SheetUnder,
  StackStory,
  StoryMarker,
} from "@/components/marketing/landing-story";
import { Reveal } from "@/components/marketing/reveal";
import { ScrollProgress } from "@/components/marketing/scroll-progress";
import { PublicFooter } from "@/components/public/public-footer";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
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

/** Hero entrance order, in ms — one cascade from the headline to the fact rail. */
const HERO_STEP = {
  line1: 0,
  line2: 70,
  line3: 140,
  copy: 240,
  actions: 320,
  note: 380,
  facts: 440,
} as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Anchors a pricing tier's liquid to the point where the pointer came in, and
 * sizes it to reach the card's farthest corner from there. A pointer that
 * comes back while the last bloom is still draining keeps that bloom's point,
 * so the liquid never jumps.
 */
function anchorBloom(event: PointerEvent<HTMLDivElement>) {
  const card = event.currentTarget;
  const bloom = card.querySelector<HTMLElement>("[data-bloom]");
  if (bloom) {
    const matrix = getComputedStyle(bloom).transform;
    const [a = 0, b = 0] = matrix.startsWith("matrix(") ? matrix.slice(7, -1).split(",").map(Number) : [];
    if (Math.hypot(a, b) > 0.04) return;
  }
  const rect = card.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  const reach = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
  card.style.setProperty("--bloom-x", `${x.toFixed(1)}px`);
  card.style.setProperty("--bloom-y", `${y.toFixed(1)}px`);
  card.style.setProperty("--bloom-size", `${Math.ceil(reach * 2.35)}px`);
}

export default function LandingPage() {
  const { saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  const marketplaceGyms = useMarketplaceGyms();
  const pricingPlans = resolvePublicPricingPlans(saasPlans);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const liveGyms = experienceStatus === "ready" ? marketplaceGyms : [];

  return (
    <div className={`${styles.pageShell} marketing-body min-h-screen bg-paper text-ink`}>
      <LandingMotionController />
      <ScrollProgress />
      <CinematicHeader />

      <div data-landing-sheet className={styles.pageSheet}>
      <main>
        {/* ---------------------------------------------------------------- Hero */}
        <section
          id="top"
          data-landing-hero
          data-landing-theme="paper"
          className={`${styles.coverSheet} ${styles.layer1} relative overflow-hidden bg-paper lg:min-h-[100svh]`}
        >
          {/* Ruled backdrop, faded out at the edges so it never competes with
              the headline. Texture only — no painted colour. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="marketing-grid-sm absolute inset-0 [mask-image:radial-gradient(115%_85%_at_72%_18%,black,transparent_72%)]" />
          </div>

          <div className={`${styles.heroMotion} relative mx-auto grid max-w-[1440px] items-center gap-10 px-5 pb-10 pt-[calc(4.25rem+2.5rem)] sm:px-8 sm:pb-14 lg:min-h-[100svh] lg:grid-cols-[1fr_1fr] lg:gap-12 lg:px-12 lg:pb-20 lg:pt-28`}>
            <div>
              <h1 className="marketing-display text-[clamp(1.9rem,9.2vw,4.7rem)] leading-[0.9] lg:text-[clamp(2.6rem,4.7vw,4.7rem)] xl:text-[clamp(2.6rem,5vw,4.7rem)]">
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
                className="mt-7 max-w-xl animate-rise-in text-[16px] leading-[1.65] text-ink-2 sm:text-[17px]"
                style={{ animationDelay: `${HERO_STEP.copy}ms` }}
              >
                One record for the sales desk, reception, the cash drawer and the member&rsquo;s phone. Every trial, membership,
                payment and check-in is logged under the person who handled it.
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
                className="mt-10 grid max-w-2xl animate-rise-in grid-cols-2 gap-x-8 gap-y-5 border-t border-ink/10 pt-7 xl:grid-cols-4"
                style={{ animationDelay: `${HERO_STEP.facts}ms` }}
              >
                {[
                  ["Cash, card, CliQ", "A receipt for every payment"],
                  ["Multi-branch", "One ledger across every floor"],
                  ["Arabic and English", "Right-to-left ready"],
                  ["Member QR", "One scan at the door"],
                ].map(([term, detail]) => (
                  <div key={term} className="group relative">
                    <span className="absolute -top-7 left-0 h-px w-0 bg-signal transition-[width] duration-500 ease-out group-hover:w-full" />
                    <dt className="text-[13px] font-semibold tracking-[-0.01em] text-ink transition-colors duration-300 group-hover:text-signal">
                      {term}
                    </dt>
                    <dd className="mt-1 text-[12px] leading-snug text-ink-3">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <HeroDevices />
          </div>
        </section>

        {/* ------------------------------------------------------------- The stack */}
        <SheetUnder tone="paper" />
        <StackStory />

        {/* --------------------------------------------------------- A day on RIVET */}
        <SheetUnder tone="stack" />
        <OperationalDay />

        {/* ---------------------------------- Accountability, then where it is built
            The region sheet slides over the pinned accountability sheet; the pair
            shares one wrapper so the pin releases once the region has passed. */}
        <div className={styles.coverPair}>
          <AccountabilityLedger />
          <RegionProof />
        </div>

        {/* ------------------------------------------------------------- Members */}
        <section
          id="member"
          data-landing-theme="paper"
          aria-labelledby="member-title"
          className={`${styles.coverSheet} ${styles.layer7} ${styles.memberSection} bg-paper px-5 sm:px-8 lg:px-12`}
        >
          <div className="mx-auto max-w-[1344px]">
            {/* The text and the Entry QR card start on the same line. Centring
                the shorter column against the taller card left a blank stage
                above the heading and floated the card above it. */}
            <div className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start lg:gap-14">
              <div>
                <Reveal still>
                  <StoryMarker label="For members" drawn />
                </Reveal>
                <SectionIntro
                  id="member-title"
                  stacked
                  title="Their side of the counter."
                  description="One account finds gyms, books a free trial and holds every membership. At the door the member opens a short-lived entry QR, reception scans it, and the visit is on the record."
                />
                <ul className="mt-7 grid gap-3">
                  {[
                    "Membership status, expiry, visits and balance at a glance",
                    "An entry QR that expires on its own and refreshes in one tap",
                    "Receipts that survive a lost phone, in Arabic or English",
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
                <p className="mt-4 text-[13px] text-ink-3">
                  Already a member?{" "}
                  <Link href="/login/member" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                    Sign in
                  </Link>
                </p>
              </div>

              <MemberCard />
            </div>

            {/* Gyms that are live on RIVET, when there are any. The directory
                page carries the full loading, empty and error states; the
                landing simply does not advertise a listing it cannot show. */}
            {liveGyms.length > 0 ? (
              <Reveal still className={styles.gymsPanel}>
                {/* A stone panel framed at its corners, the way a QR carries its finders. */}
                <span className={cn(styles.gymsCorner, styles.gymsCornerTl)} aria-hidden />
                <span className={cn(styles.gymsCorner, styles.gymsCornerTr)} aria-hidden />
                <span className={cn(styles.gymsCorner, styles.gymsCornerBl)} aria-hidden />
                <span className={cn(styles.gymsCorner, styles.gymsCornerBr)} aria-hidden />
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <h3 className="text-[19px] font-semibold tracking-tight">Gyms on RIVET</h3>
                  <Link href="/customer/discover" className="text-[13.5px] font-medium text-ink-2 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                    See every gym
                  </Link>
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {liveGyms.map((gym, index) => (
                    <Reveal key={gym.id} delay={index * 80} className="h-full">
                      <Link
                        href={`/customer/gyms/${gym.id}`}
                        className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-[border-color,box-shadow] duration-300 ease-out hover:border-ink hover:shadow-pop"
                      >
                        <div className="relative h-24 overflow-hidden px-5 py-4 text-white" style={{ backgroundColor: gym.accent }}>
                          <div className="absolute inset-0 opacity-20 marketing-grid" />
                          <span className="relative flex items-center justify-between text-[12.5px] font-semibold tracking-[-0.01em]">
                            {gym.shortName}
                            <span className="flex items-center gap-1 text-[11.5px] font-medium">
                              <Dumbbell className="size-3" /> {gym.trainers?.length ?? 0} PT
                            </span>
                          </span>
                          <Dumbbell
                            className="absolute bottom-3 end-4 size-8 opacity-30 transition-transform duration-500 ease-out group-hover:-rotate-12 group-hover:scale-110"
                            strokeWidth={1.4}
                          />
                        </div>
                        <div className="flex flex-1 flex-col p-5">
                          <p className="text-[12px] font-medium text-ink-3">{gym.category}</p>
                          <h4 className="mt-1.5 text-[19px] font-semibold tracking-tight">{gym.name}</h4>
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
              </Reveal>
            ) : null}
          </div>
        </section>

        {/* ------------------------------------------------------------- Pricing */}
        <section
          id="pricing"
          data-landing-theme="paper"
          aria-labelledby="pricing-title"
          className={`${styles.coverSheet} ${styles.paperSheet} ${styles.layer8} bg-sunken px-5 py-20 sm:px-8 lg:px-12 lg:py-24`}
        >
          <div className="mx-auto max-w-[1344px]">
            <StoryMarker label="Pricing" />
            <div className="mt-8">
              <SectionIntro
                id="pricing-title"
                title="One branch or every branch. Same system."
                description="Every plan includes the member app, staff permissions, audit history and the full revenue loop. Pay monthly, or once a year at 20% off."
              />
            </div>
            {experienceStatus === "error" && saasPlans.length === 0 ? (
              <div className="mt-8">
                <ExperienceDataState status={experienceStatus} error={experienceError} onRetry={retryExperience} emptyTitle="Showing launch pricing" emptyDescription="The live catalog is temporarily unavailable. These prices are the approved launch defaults." />
              </div>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-semibold tracking-[-0.01em]">Billing</p>
                <p className="mt-1 text-[12px] text-ink-3">Same features either way. Annual is paid once and saves {ANNUAL_DISCOUNT_PERCENT}%.</p>
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
                      className={`min-h-10 rounded px-4 py-2 text-[12.5px] font-medium transition-colors ${selected ? "bg-ink text-paper" : "text-ink-3 hover:text-ink"}`}
                    >
                      {interval === "monthly" ? "Monthly" : "Annual · Save 20%"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div id="pricing-plans" role="tabpanel" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {pricingPlans.map((plan, index) => {
                  const price = calculatePlanPrice(plan, billingInterval);
                  const features = publicPlanFeatures(plan);
                  const isEnterprise = plan.name === "Enterprise";
                  const isNight = plan.tone === "night";
                  const isSignal = plan.tone === "signal";
                  return (
                <Reveal key={plan.name} delay={index * 90} className="h-full">
                  <div
                    className={cn(
                      "rounded-lg",
                      styles.tier,
                      isNight ? styles.tierNight : isSignal ? styles.tierSignal : styles.tierPaper,
                      isNight && "night-surface",
                    )}
                    onPointerEnter={anchorBloom}
                  >
                    {/* The liquid that blooms from where the pointer came in — see `.tierBloom`. */}
                    <span className={styles.tierLiquid} aria-hidden>
                      <span className={styles.tierBloom} data-bloom />
                      <span className={cn(styles.tierBloom, styles.tierBloomEcho)} />
                    </span>
                    <div className={styles.tierBody}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-semibold tracking-[-0.01em]">{plan.name}</p>
                        {isSignal ? (
                          <span className="rounded-sm bg-signal px-2 py-1 text-[11px] font-medium leading-none text-white">
                            Most popular
                          </span>
                        ) : isEnterprise ? (
                          <span className="rounded-sm border border-night-line px-2 py-1 text-[11px] font-medium leading-none text-night-ink-2">
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
                      <div className="mt-auto pt-8">
                        <Button
                          asChild
                          variant={isNight ? "night" : isSignal ? "signal" : "secondary"}
                          size="lg"
                          className="w-full"
                        >
                          <Link href={pricingSignupHref(plan.name, billingInterval)}>Send gym application</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Reveal>
                  );
                })}
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------- Next step */}
        <SheetUnder tone="sunken" />
        <section
          id="contact"
          data-landing-theme="dark"
          aria-labelledby="contact-title"
          className={`${styles.coverSheet} ${styles.inkSheet} ${styles.layer9} night-surface relative overflow-hidden bg-night px-5 py-20 text-night-ink sm:px-8 lg:px-12 lg:py-24`}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.06]" aria-hidden>
            <div className="absolute inset-y-0 start-[68%] w-px bg-night-ink" />
            <div className="absolute inset-y-0 start-[72%] w-px bg-night-ink" />
            <div className="absolute inset-y-0 start-[76%] w-px bg-night-ink" />
          </div>
          <div className="relative mx-auto max-w-[1344px]">
            <StoryMarker label="Next step" dark />
            <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
              <Reveal>
                <div>
                  <h2 id="contact-title" className="max-w-xl text-[clamp(2.4rem,4.6vw,4.1rem)] font-semibold leading-[0.95] tracking-[-0.03em] text-night-ink [font-family:var(--font-marketing-display)]">
                    Bring RIVET to your gym.
                  </h2>
                  <p className="mt-6 max-w-md text-[15px] leading-[1.7] text-night-ink-2">
                    Send an application with your branches and how you run the desk. We review it, then set up your workspace with you.
                  </p>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="flex flex-wrap items-center gap-5 lg:justify-end">
                  <Button asChild variant="signal" size="lg" className="group">
                    <Link href="/signup">
                      Send a gym application{" "}
                      <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Link href="/login" className="py-2 text-[13.5px] font-medium text-night-ink-2 underline decoration-night-line underline-offset-8 transition-colors hover:text-night-ink hover:decoration-night-ink-2">
                    Already have access? Sign in
                  </Link>
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <div data-landing-theme="dark">
        <PublicFooter />
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The member's Entry QR, exactly as the app shows it at reception — the
 * product's own dialog at reading size, with a sample code in place of a
 * signed pass.
 */
function MemberCard() {
  return (
    <Reveal className="flex justify-center lg:justify-end">
      <div className="w-full max-w-sm" aria-hidden>
        <EntryPassCard />
      </div>
    </Reveal>
  );
}

function SectionIntro({
  id,
  title,
  description,
  stacked = false,
}: {
  id?: string;
  title: string;
  description: string;
  stacked?: boolean;
}) {
  return (
    <Reveal className={stacked ? "mt-7 max-w-xl" : "grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end"}>
      <h2
        id={id}
        className="text-[clamp(2rem,3.4vw,3.1rem)] font-semibold leading-[1.02] tracking-[-0.025em] text-ink [font-family:var(--font-marketing-display)]"
      >
        {title}
      </h2>
      <p className={`text-[14.5px] leading-[1.7] text-ink-2 ${stacked ? "mt-5" : "lg:pb-2"}`}>
        {description}
      </p>
    </Reveal>
  );
}
