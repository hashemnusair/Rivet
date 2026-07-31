import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CalendarCheck,
  Check,
  Dumbbell,
  MapPin,
  QrCode,
  ScanLine,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { MARKETPLACE_GYMS, SAAS_PLANS } from "@/lib/public/experience-data";

const LOOP = ["Lead", "Contact", "Free trial", "Offer", "Membership", "Payment", "Check-in", "Renewal"];

export default function LandingPage() {
  return (
    <div id="top" className="marketing-body min-h-screen bg-paper text-ink">
      <PublicHeader />

      <main>
        <section className="marketing-grid relative overflow-hidden border-b border-ink/10">
          <div className="mx-auto grid min-h-[760px] max-w-[1440px] lg:grid-cols-[1.06fr_0.94fr]">
            <div className="flex flex-col justify-center px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
              <p className="flex items-center gap-4 font-mono text-[10.5px] font-medium uppercase tracking-[0.19em] text-ink-2">
                <span className="h-px w-14 bg-signal" /> Revenue & operations OS · Built in Amman
              </p>
              <h1 className="marketing-display mt-9 max-w-[880px] text-[clamp(4rem,8.2vw,8.3rem)] leading-[0.87]">
                Every member.<br />Every dinar.<br /><span className="text-signal">Every shift.</span>
              </h1>
              <p className="mt-8 max-w-2xl text-[16px] leading-[1.7] text-ink-2 sm:text-[18px]">
                RIVET connects the gym floor, sales desk, cash drawer, and member phone. One commercial record from the first free trial to the tenth renewal.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild variant="signal" size="lg">
                  <Link href="/signup">Run your gym on RIVET <ArrowRight /></Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/customer/discover">Find a gym near you</Link>
                </Button>
              </div>
              <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden border border-ink/10 bg-ink/10 sm:grid-cols-4">
                {[
                  ["Cash · Card · CliQ", "every tender, receipted"],
                  ["Multi-branch", "one ledger, every floor"],
                  ["Arabic / RTL", "native from day one"],
                  ["Member QR", "one scan, clear verdict"],
                ].map(([term, detail]) => (
                  <div key={term} className="bg-paper p-4">
                    <dt className="font-mono text-[9px] uppercase tracking-[0.13em] text-ink">{term}</dt>
                    <dd className="mt-1 text-[11.5px] text-ink-3">{detail}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="night-surface relative flex min-h-[640px] items-center bg-night px-5 py-16 text-night-ink sm:px-8 lg:px-10">
              <div className="w-full border border-night-line bg-night-2 shadow-[0_24px_80px_rgb(0_0_0/0.32)]">
                <div className="flex items-center justify-between border-b border-night-line px-5 py-4 font-mono text-[9px] uppercase tracking-[0.16em] text-night-ink-3">
                  <span>RIVET OPS — ABDOUN DESK</span>
                  <span className="flex items-center gap-2 text-success"><span className="size-1.5 rounded-full bg-success" /> Live</span>
                </div>
                <div className="grid gap-px bg-night-line sm:grid-cols-[1.25fr_0.75fr]">
                  <div className="bg-night-2 p-5">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="eyebrow-night">Check-ins today</p>
                        <p className="mt-2 text-[44px] font-semibold leading-none tabular">215</p>
                      </div>
                      <div className="text-end">
                        <p className="eyebrow-night">Inside now</p>
                        <p className="mt-2 text-[24px] font-semibold tabular">67</p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-2">
                      {[
                        ["14:18", "Omar H.", "renews in 41d", "VALID", "text-success"],
                        ["14:17", "Tariq M.", "3 days left", "EXPIRING", "text-warning"],
                        ["14:16", "Noor S.", "until 12 Aug", "FROZEN", "text-[#86a7d5]"],
                        ["14:14", "Fadi K.", "sent to renewal", "EXPIRED", "text-signal"],
                      ].map(([time, name, note, verdict, tone]) => (
                        <div key={time} className="grid grid-cols-[42px_1fr_auto] items-center gap-3 border border-night-line bg-night px-3 py-3">
                          <span className="font-mono text-[9px] text-night-ink-3">{time}</span>
                          <span><strong className="block text-[12px] font-medium">{name}</strong><span className="block text-[10px] text-night-ink-3">{note}</span></span>
                          <span className={`font-mono text-[9px] font-semibold tracking-[0.12em] ${tone}`}>{verdict}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-px bg-night-line">
                    <OpsMetric label="Renewals due · 7 days" value="23" detail="JD 805 at stake" />
                    <OpsMetric label="Free trials today" value="08" detail="3 awaiting confirmation" />
                    <OpsMetric label="Drawer" value="OPEN" detail="Closes 22:00" small />
                  </div>
                </div>
                <div className="overflow-hidden border-t border-night-line py-3">
                  <p className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">
                    <span className="text-night-ink">Trial booked · 18:00</span> · Receipt #4412 · Cash JD 35 · Renewal WhatsApp sent · Shift variance JD 0.00 · <span className="text-night-ink">New marketplace lead · Lina H.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="loop" className="border-b border-ink/10 px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro number="01" eyebrow="The full commercial loop" title="One record. From discovery to renewal." description="The public marketplace, customer portal, and gym operating system write to the same timeline. No copy-paste between a booking form, a spreadsheet, and the front desk." />
            <div className="mt-14 grid gap-px overflow-hidden border border-ink/10 bg-ink/10 md:grid-cols-4 lg:grid-cols-8">
              {LOOP.map((stage, index) => (
                <div key={stage} className="group bg-paper p-5 transition-colors hover:bg-surface">
                  <span className="font-mono text-[9px] tracking-[0.16em] text-signal">{String(index + 1).padStart(2, "0")}</span>
                  <p className="mt-8 text-[14px] font-semibold">{stage}</p>
                  <div className="mt-4 h-px w-7 bg-ink/20 transition-all group-hover:w-full group-hover:bg-signal" />
                </div>
              ))}
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              <ValueCard icon={<CalendarCheck />} title="Customers discover and book" body="Unsuscribed customers compare RIVET gyms and book a free trial. The selected gym receives a CRM lead immediately." />
              <ValueCard icon={<BadgeCheck />} title="The gym converts and operates" body="Staff follow up, sell the plan, collect payment, issue the receipt, and manage every visit from one member record." />
              <ValueCard icon={<QrCode />} title="Members carry their gym" body="My Gyms shows membership status, expiry, visits, receipts, messages, and a secure QR identity for entry." />
            </div>
          </div>
        </section>

        <section id="ops" className="night-surface bg-night px-5 py-24 text-night-ink sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro dark number="02" eyebrow="RIVET Ops" title="Depth where gyms actually bleed." description="Not a collection of dashboards. A working surface for sales, reception, cash, renewals, and accountability." />
            <div className="mt-14 grid gap-px overflow-hidden border border-night-line bg-night-line md:grid-cols-2 lg:grid-cols-4">
              <DarkFeature icon={<Users />} label="Member 360" title="The whole story" copy="Calls, trials, plans, payments, freezes, visits, messages, and renewals in one chronological record." />
              <DarkFeature icon={<ScanLine />} label="Reception" title="A verdict, not a vibe" copy="Valid, expiring, frozen, depleted, or blocked—with the next action already attached." />
              <DarkFeature icon={<Banknote />} label="Shift & drawer" title="Close in ninety seconds" copy="Expected versus counted cash with every variance named, explained, and routed for approval." />
              <DarkFeature icon={<ShieldCheck />} label="Accountability" title="Every override has a name" copy="Discounts, refunds, freezes, and voids are reasoned, tiered, and written to an immutable log." />
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild variant="night" size="lg"><Link href="/login">Open the gym demo <ArrowRight /></Link></Button>
              <Button asChild variant="night-outline" size="lg"><Link href="/platform">See platform administration</Link></Button>
            </div>
          </div>
        </section>

        <section id="member" className="border-b border-ink/10 px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto grid max-w-[1344px] gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <SectionIntro number="03" eyebrow="RIVET Member" title="Their side of the counter." description="One customer account can discover new gyms, book a free trial, and hold every active membership under My Gyms." />
              <ul className="mt-8 space-y-4">
                {[
                  "No app-store friction—works from any browser",
                  "Membership status, expiry, visits, balance, and receipts",
                  "A dedicated QR identity for fast gym entry",
                  "Arabic or English per customer",
                ].map((item) => <li key={item} className="flex items-start gap-3 text-[14px] text-ink-2"><Check className="mt-0.5 size-4 text-success" /> {item}</li>)}
              </ul>
              <Button asChild className="mt-8" size="lg"><Link href="/customer/login">Try the customer portal <ArrowRight /></Link></Button>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="night-surface bg-night p-5 text-night-ink shadow-[0_24px_70px_rgb(27_26_21/0.2)]">
                <div className="flex items-center justify-between border-b border-night-line pb-4 font-mono text-[9px] uppercase tracking-[0.15em] text-night-ink-3"><span>RIVET MEMBER</span><span>19:41</span></div>
                <p className="mt-7 eyebrow-night">Forge Fitness · Abdoun</p>
                <h3 className="mt-2 text-[30px] font-semibold">Lina Haddad</h3>
                <p className="font-mono text-[10px] text-night-ink-3">6-MONTH · #ABD-2214</p>
                <div className="mt-8 grid grid-cols-2 gap-px bg-night-line">
                  <div className="bg-night-2 p-4"><p className="eyebrow-night">Renews in</p><p className="mt-2 text-[27px] font-semibold text-warning">12 days</p></div>
                  <div className="bg-night-2 p-4"><p className="eyebrow-night">Visits · Jul</p><p className="mt-2 text-[27px] font-semibold">14</p></div>
                </div>
                <div className="mt-5 flex aspect-square max-h-[210px] items-center justify-center border border-night-line bg-night-ink text-night">
                  <QrCode className="size-24" strokeWidth={1.2} />
                </div>
                <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">Check-in identity · refreshes securely</p>
              </div>
              <div className="flex flex-col justify-between border border-line bg-surface p-6">
                <div>
                  <p className="eyebrow">One customer account</p>
                  <h3 className="marketing-display mt-3 text-[42px] leading-[0.95]">All your gyms. One place.</h3>
                  <p className="mt-5 text-[14px] leading-relaxed text-ink-2">Switch between active memberships without separate passwords, plastic cards, or screenshots of old receipts.</p>
                </div>
                <div className="mt-12 space-y-3">
                  {MARKETPLACE_GYMS.slice(0, 3).map((gym, index) => (
                    <div key={gym.id} className="flex items-center justify-between border-t border-line pt-3">
                      <span className="text-[13px] font-medium">{gym.name}</span>
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">{index === 0 ? "Active" : "Discover"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro number="04" eyebrow="RIVET network" title="Find the right gym. Book before you visit." description="Only gyms actively operating on RIVET appear in discovery, so trial requests, follow-ups, and eventual memberships stay connected." />
            <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {MARKETPLACE_GYMS.map((gym) => (
                <Link key={gym.id} href={`/customer/gyms/${gym.id}`} className="group flex min-h-[320px] flex-col border border-line bg-surface p-5 transition-all hover:-translate-y-1 hover:border-ink hover:shadow-pop">
                  <div className="flex items-start justify-between">
                    <span className="flex size-12 items-center justify-center rounded-full text-white" style={{ backgroundColor: gym.accent }}><Dumbbell className="size-5" /></span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">★ {gym.rating}</span>
                  </div>
                  <p className="mt-8 eyebrow">{gym.category}</p>
                  <h3 className="mt-2 text-[22px] font-semibold tracking-tight">{gym.name}</h3>
                  <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-ink-2">{gym.tagline}</p>
                  <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-3"><MapPin className="size-3.5" /> {gym.areas.join(" · ")}</span>
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-ink/10 bg-sunken px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="mx-auto max-w-[1344px]">
            <SectionIntro number="05" eyebrow="Straightforward pricing" title="Start with one branch. Keep the same system as you grow." description="Every plan includes the customer marketplace, Member portal, staff permissions, audit history, and the complete revenue loop." />
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {SAAS_PLANS.map((plan) => (
                <div key={plan.name} className={plan.tone === "night" ? "night-surface bg-night p-6 text-night-ink" : plan.tone === "signal" ? "border-2 border-signal bg-surface p-6" : "border border-line bg-surface p-6"}>
                  <div className="flex items-center justify-between">
                    <p className={plan.tone === "night" ? "eyebrow-night" : "eyebrow"}>{plan.name}</p>
                    {plan.tone === "signal" ? <span className="bg-signal px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-white">Most popular</span> : null}
                  </div>
                  <p className="mt-7"><span className="text-[40px] font-semibold tabular">JD {plan.priceMinor / 1000}</span><span className={plan.tone === "night" ? "text-night-ink-3" : "text-ink-3"}> / month</span></p>
                  <ul className={`mt-8 space-y-3 text-[13px] ${plan.tone === "night" ? "text-night-ink-2" : "text-ink-2"}`}>
                    <li>{plan.branches} {plan.branches === 1 ? "branch" : "branches"}</li>
                    <li>Up to {plan.staff} staff accounts</li>
                    <li>Up to {plan.members.toLocaleString()} members</li>
                    <li>RIVET Member and marketplace included</li>
                  </ul>
                  <Button asChild variant={plan.tone === "night" ? "night" : plan.tone === "signal" ? "signal" : "primary"} className="mt-9 w-full"><Link href="/signup">Start 14-day trial</Link></Button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-grid px-5 py-28 text-center sm:px-8 lg:px-12 lg:py-36">
          <div className="mx-auto max-w-5xl">
            <p className="eyebrow">First cohort onboarding in Amman now</p>
            <h2 className="marketing-display mt-5 text-[clamp(3.8rem,9vw,8.5rem)] leading-[0.87]">Put a rivet.<br /><span className="text-signal">In the leaks.</span></h2>
            <p className="mx-auto mt-7 max-w-2xl text-[16px] leading-relaxed text-ink-2">Bring your messiest month. We’ll show you how the landing page, customer portal, sales desk, gym floor, and cash drawer become one system.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild variant="signal" size="lg"><Link href="/signup">Start your gym trial <ArrowRight /></Link></Button>
              <Button asChild variant="secondary" size="lg"><Link href="/customer/discover">Explore member experience</Link></Button>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

function OpsMetric({ label, value, detail, small = false }: { label: string; value: string; detail: string; small?: boolean }) {
  return <div className="bg-night-2 p-5"><p className="eyebrow-night">{label}</p><p className={`mt-3 font-semibold ${small ? "text-[18px]" : "text-[32px]"}`}>{value}</p><p className="mt-1 text-[10px] text-night-ink-3">{detail}</p></div>;
}

function SectionIntro({ number, eyebrow, title, description, dark = false }: { number: string; eyebrow: string; title: string; description: string; dark?: boolean }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[130px_1fr_0.8fr] lg:items-start">
      <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${dark ? "text-signal" : "text-ink-3"}`}>{number} — {eyebrow}</p>
      <h2 className={`marketing-display text-[clamp(2.9rem,5vw,5.5rem)] leading-[0.92] ${dark ? "text-night-ink" : "text-ink"}`}>{title}</h2>
      <p className={`text-[14px] leading-[1.75] lg:pt-2 ${dark ? "text-night-ink-2" : "text-ink-2"}`}>{description}</p>
    </div>
  );
}

function ValueCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <div className="border border-line bg-surface p-6"><span className="flex size-10 items-center justify-center rounded-full bg-signal-bg text-signal [&_svg]:size-4">{icon}</span><h3 className="mt-7 text-[18px] font-semibold">{title}</h3><p className="mt-3 text-[13px] leading-relaxed text-ink-2">{body}</p></div>;
}

function DarkFeature({ icon, label, title, copy }: { icon: React.ReactNode; label: string; title: string; copy: string }) {
  return <div className="bg-night-2 p-6"><span className="flex size-10 items-center justify-center border border-night-line text-signal [&_svg]:size-4">{icon}</span><p className="mt-8 eyebrow-night">{label}</p><h3 className="mt-3 text-[22px] font-semibold">{title}</h3><p className="mt-4 text-[13px] leading-relaxed text-night-ink-2">{copy}</p></div>;
}
