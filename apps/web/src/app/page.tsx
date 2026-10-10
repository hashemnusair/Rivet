"use client";
import { useLocale } from "@/lib/i18n/provider";


import {
  ArrowRight,
  Check,
  Dumbbell,
  MapPin,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CinematicHeader } from "@/components/marketing/cinematic-header";
import { HeroFilm } from "@/components/marketing/hero-film";
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
import { satoshi } from "@/components/marketing/satoshi";
import { PublicFooter } from "@/components/public/public-footer";
import { ExperienceDataState } from "@/components/public/experience-data-state";
import { SignedInGuard } from "@/components/public/signed-in-guard";
import { useNightChrome } from "@/components/public/use-night-chrome";
import { Button } from "@/components/ui/button";
import { SheetLink } from "@/components/motion/page-sheet";
import { usePublicViewer } from "@/lib/auth/public-viewer";
import { cn } from "@/lib/utils/cn";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { useFormat } from "@/lib/i18n/format";
import {
  ANNUAL_DISCOUNT_PERCENT,
  calculatePlanPrice,
  pricingSignupHref,
  resolvePublicPricingPlans,
  type BillingInterval,
} from "@/lib/public/pricing";
import { formatPublicJod, localizedPublicPlanFeatures, publicDestinationCopy } from "@/components/public/public-plan-copy";

export default function LandingPage() {
  const { t, locale, isolateLtr } = useLocale();
  const f = useFormat();
  const { saasPlans, experienceError, experienceStatus, retryExperience } = useExperience();
  const marketplaceGyms = useMarketplaceGyms();
  const pricingPlans = resolvePublicPricingPlans(saasPlans);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>("monthly");
  const liveGyms = experienceStatus === "ready" ? marketplaceGyms : [];
  useNightChrome();

  // Signed in, every call to action on the page leads to the visitor's own
  // area and nothing offers them a sign-in or an application. Above the fold
  // the buttons wait for the answer; further down the signed-out set stands
  // in until it arrives.
  const viewer = usePublicViewer();
  const signedIn = viewer.status === "signed-in" ? viewer.destination : null;
  const signedInCopy = signedIn ? publicDestinationCopy(signedIn.area, t) : null;
  const signedOut = viewer.status === "signed-out";

  return (
    <div data-night-page className={cn(styles.pageShell, styles.nightPage, locale === "en" && [satoshi.variable, styles.satoshiLanding], "night-tokens marketing-body min-h-screen bg-paper text-ink")}>
      <SignedInGuard />
      <LandingMotionController />
      <ScrollProgress />
      <CinematicHeader />

      <div data-landing-sheet className={styles.pageSheet}>
      <main>
        {/* ---------------------------------------------------------------- Film */}
        <HeroFilm />

        {/* ------------------------------------------------------------- The stack */}
        <SheetUnder tone="film" />
        <StackStory />

        {/* --------------------------------------------------------- A day on RIVET */}
        <SheetUnder tone="stack" />
        <OperationalDay />

        {/* ---------------------------------- Accountability, then where it is built
            The region sheet slides over the pinned accountability sheet; the pair
            shares one wrapper so the pin releases once the region has passed. */}
        <div data-landing-snap="start" className={styles.coverPair}>
          <AccountabilityLedger />
          <RegionProof />
        </div>

        {/* ------------------------------------------------------------- Members */}
        <section
          id="member"
          data-landing-snap="start"
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
                  <StoryMarker label={t("marketing.nav.forMembers")} drawn />
                </Reveal>
                <SectionIntro
                  id="member-title"
                  stacked
                  title={t("marketing.member.title")}
                  description={t("publicCompletion.landing.member.description")}
                />
                <ul className="mt-7 grid gap-3">
                  {[
                    t("publicCompletion.landing.member.benefits.status"),
                    t("publicCompletion.landing.member.benefits.qr"),
                    t("publicCompletion.landing.member.benefits.receipts"),
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
                <div className="mt-8 flex min-h-12 flex-wrap gap-3">
                  {signedIn ? (
                    <Button asChild size="lg" className="group">
                      <Link href={signedIn.href}>
                        {signedInCopy?.action}{" "}
                        <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                      </Link>
                    </Button>
                  ) : signedOut ? (
                    <Button asChild size="lg" className="group">
                      <Link href="/login/member/create">{t("marketing.actions.createFreeAccount")}{" "}
                        <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                      </Link>
                    </Button>
                  ) : null}
                  {!signedIn || signedIn.area === "member" ? (
                    <Button asChild variant="secondary" size="lg">
                      <Link href="/customer/discover">{t("marketing.actions.findGym")}</Link>
                    </Button>
                  ) : null}
                </div>
                {signedOut ? (
                  <p className="mt-4 text-[13px] text-ink-3">
                    {t("publicCompletion.landing.member.alreadyMember")}{" "}
                    <Link href="/login/member" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">{t("marketing.footer.signIn")}</Link>
                  </p>
                ) : null}
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
                  <h3 className="text-[19px] font-semibold tracking-tight">{t("publicCompletion.landing.member.liveGyms")}</h3>
                  <Link href="/customer/discover" className="text-[13.5px] font-medium text-ink-2 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                    {t("publicCompletion.landing.member.seeEveryGym")}
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
                            <bdi dir="auto">{gym.shortName}</bdi>
                            <span className="flex items-center gap-1 text-[11.5px] font-medium">
                              <Dumbbell className="size-3" /> {t("publicCompletion.landing.pricing.trainerCount", { count: gym.trainers?.length ?? 0, formatted: f.number(gym.trainers?.length ?? 0) })}</span>
                          </span>
                          <Dumbbell
                            className="absolute bottom-3 end-4 size-8 opacity-30 transition-transform duration-500 ease-out group-hover:-rotate-12 group-hover:scale-110"
                            strokeWidth={1.4}
                          />
                        </div>
                        <div className="flex flex-1 flex-col p-5">
                          <p className="text-[12px] font-medium text-ink-3" dir="auto">{gym.category}</p>
                          <h4 className="mt-1.5 text-[19px] font-semibold tracking-tight" dir="auto">{gym.name}</h4>
                          <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-ink-2" dir="auto">{gym.tagline}</p>
                          <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                            <span className="flex items-center gap-1.5 text-[11px] text-ink-3">
                              <MapPin className="size-3.5" /> {gym.areas.join(" · ")}
                            </span>
                            <span className="flex items-center gap-1.5 text-[12px] font-medium">
                              {t("publicCompletion.landing.pricing.fromPrice", { amount: formatPublicJod(gym.fromPriceMinor, f, locale) })}
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
          data-landing-snap="start"
          data-landing-theme="paper"
          aria-labelledby="pricing-title"
          className={`${styles.coverSheet} ${styles.paperSheet} ${styles.layer8} bg-sunken px-5 py-20 sm:px-8 lg:px-12 lg:py-24`}
        >
          <div className="mx-auto max-w-[1344px]">
            <StoryMarker label={t("marketing.pricing.eyebrow")} />
            <div className="mt-8">
              <SectionIntro
                id="pricing-title"
                title={t("publicCompletion.landing.pricing.title")}
                description={t("publicCompletion.landing.pricing.description", { percent: f.number(ANNUAL_DISCOUNT_PERCENT) })}
              />
            </div>
            {experienceStatus === "error" && saasPlans.length === 0 ? (
              <div className="mt-8">
                <ExperienceDataState status={experienceStatus} error={experienceError} onRetry={retryExperience} emptyTitle={t("publicCompletion.landing.pricing.launchTitle")} emptyDescription={t("publicCompletion.landing.pricing.launchDescription")} />
              </div>
            ) : null}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-semibold tracking-[-0.01em]">{t("publicCompletion.landing.pricing.billing")}</p>
                <p className="mt-1 text-[12px] text-ink-3">{t("publicCompletion.landing.pricing.sameFeatures", { percent: f.number(ANNUAL_DISCOUNT_PERCENT) })}</p>
              </div>
              <div role="tablist" aria-label={t("publicCompletion.landing.pricing.billingInterval")} className="inline-flex rounded-md border border-line bg-surface p-1 shadow-sm">
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
                      {interval === "monthly" ? t("publicCompletion.landing.pricing.monthly") : t("publicCompletion.landing.pricing.annualSave", { percent: f.number(ANNUAL_DISCOUNT_PERCENT) })}
                    </button>
                  );
                })}
              </div>
            </div>
            <div id="pricing-plans" role="tabpanel" className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {pricingPlans.map((plan, index) => {
                  const price = calculatePlanPrice(plan, billingInterval);
                  const features = localizedPublicPlanFeatures(plan, f, t);
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
                  >
                    <div className={styles.tierBody}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[15px] font-semibold tracking-[-0.01em]">{plan.name}</p>
                        {isSignal ? (
                          <span className="rounded-sm bg-signal px-2 py-1 text-[11px] font-medium leading-none text-white">{t("marketing.pricing.mostPopular")}</span>
                        ) : isEnterprise ? (
                          <span className="rounded-sm border border-night-line px-2 py-1 text-[11px] font-medium leading-none text-night-ink-2">
                            {t("publicCompletion.landing.pricing.customQuote")}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-6">
                        {isEnterprise ? (
                          <span className="text-[25px] font-semibold">{t("publicCompletion.landing.pricing.customQuote")}</span>
                        ) : (
                          <>
                            <span className="text-[34px] font-semibold tabular"><bdi dir="ltr">{isolateLtr(formatPublicJod(price.effectiveMonthlyMinor, f, locale))}</bdi></span>
                            <span className={isNight ? "text-night-ink-3" : "text-ink-3"}>{" "}{t("marketing.pricing.perMonth")}</span>
                          </>
                        )}
                      </p>
                      {isEnterprise ? (
                        <div className={isNight ? "mt-1 text-[11px] text-night-ink-3" : "mt-1 text-[11px] text-ink-3"}>
                          {t("publicCompletion.landing.pricing.customQuoteCadence", { cadence: t(billingInterval === "annual" ? "publicCompletion.signup.annualCadence" : "publicCompletion.signup.monthlyCadence") })}. {t("publicCompletion.landing.pricing.customQuotePriceDetails")}
                        </div>
                      ) : billingInterval === "annual" ? (
                        <div className={isNight ? "mt-1 text-[11px] text-night-ink-3" : "mt-1 text-[11px] text-ink-3"}>
                          <bdi dir="ltr">{isolateLtr(formatPublicJod(price.annualTotalMinor, f, locale))}</bdi> {t("publicCompletion.landing.pricing.billedAnnually")} · <strong className={isNight ? "text-night-ink-2" : "text-ink-2"}>{t("publicCompletion.landing.pricing.savePercent", { percent: f.number(ANNUAL_DISCOUNT_PERCENT) })}</strong>
                        </div>
                      ) : (
                        <div className={isNight ? "mt-1 text-[11px] text-night-ink-3" : "mt-1 text-[11px] text-ink-3"}>{t("publicCompletion.landing.pricing.billedMonthlyCancel")}</div>
                      )}
                      {!isEnterprise ? (
                        <div className={isNight ? "mt-2 space-y-1 text-[11px] text-night-ink-3" : "mt-2 space-y-1 text-[11px] text-ink-3"}>
                          <p>{t("publicCompletion.landing.pricing.oneTimeOnboarding", { amount: isolateLtr(formatPublicJod(price.onboardingFeeMinor ?? 0, f, locale)) })}</p>
                          <p className={isNight ? "font-medium text-night-ink-2" : "font-medium text-ink-2"}>{t("publicCompletion.landing.pricing.firstPayment", { amount: isolateLtr(formatPublicJod(price.firstPaymentMinor, f, locale)) })}</p>
                        </div>
                      ) : null}
                      <ul className={`mt-7 grid gap-2.5 text-[13px] ${isNight ? "text-night-ink-2" : "text-ink-2"}`}>
                        {features.map((line) => (
                          <li key={line} className="flex items-start gap-2.5">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                            {line}
                          </li>
                        ))}
                      </ul>
                      {signedIn ? null : (
                        <div className="mt-auto pt-8">
                          <Button
                            asChild
                            variant={isSignal ? "primary" : "secondary"}
                            size="lg"
                            className="w-full"
                          >
                            <SheetLink href={pricingSignupHref(plan.name, billingInterval)}>{t("marketing.actions.applyShort")}</SheetLink>
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Reveal>
                  );
                })}
            </div>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{t("publicCompletion.landing.pricing.activeMemberAllowanceNote")}</p>
          </div>
        </section>

        {/* ----------------------------------------------------------- Next step */}
        <SheetUnder tone="sunken" />
        <section
          id="contact"
          data-landing-snap="start"
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
            <StoryMarker label={t("publicCompletion.landing.contact.nextStep")} dark />
            <div className="mt-10 grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end lg:gap-20">
              <Reveal>
                <div>
                  <h2 id="contact-title" className="max-w-xl text-[clamp(2.4rem,4.6vw,4.1rem)] font-normal leading-[0.95] tracking-[-0.04em] text-night-ink [font-family:var(--font-marketing-display)]">
                    {t("publicCompletion.landing.contact.title")}
                  </h2>
                  <p className="mt-6 max-w-md text-[15px] leading-[1.7] text-night-ink-2">
                    {t("publicCompletion.landing.contact.body")}
                  </p>
                </div>
              </Reveal>
              <Reveal delay={120}>
                <div className="flex flex-wrap items-center gap-5 lg:justify-end">
                  {signedIn ? (
                    <Button asChild size="lg" className="group">
                      <Link href={signedIn.href}>
                        {signedInCopy?.action}{" "}
                        <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="lg" className="group">
                      <SheetLink href="/signup">{t("publicCompletion.header.applyAccess")}{" "}
                        <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
                      </SheetLink>
                    </Button>
                  )}
                </div>
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <div data-landing-theme="dark" data-landing-snap="end">
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
      <div className="light-tokens w-full max-w-sm" aria-hidden>
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
        className="text-[clamp(2rem,3.4vw,3.1rem)] font-normal leading-[1.02] tracking-[-0.035em] text-ink [font-family:var(--font-marketing-display)]"
      >
        {title}
      </h2>
      <p className={`text-[14.5px] leading-[1.7] text-ink-2 ${stacked ? "mt-5" : "lg:pb-2"}`}>
        {description}
      </p>
    </Reveal>
  );
}
