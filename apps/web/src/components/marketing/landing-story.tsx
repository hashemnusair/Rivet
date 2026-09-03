"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";

const STACK_ITEMS = [
  {
    label: "Sales",
    copy: "The first walk-in, trial, call, and follow-up all carry the name of the person who handled them.",
    caps: ["Leads, trials, follow-ups", "Conversion by staff member", "Nothing lives in a chat"],
  },
  {
    label: "Memberships",
    copy: "Plans, renewals, freezes, upgrades, and family memberships, with expiries the desk actually sees.",
    caps: ["Plans and renewals", "Freezes and transfers", "Access follows the plan"],
  },
  {
    label: "Payments",
    copy: "Cash, card, CliQ, and installments, with a receipt for every dinar and a balance for every member.",
    caps: ["Cash, card, CliQ", "Receipts and balances", "Drawer reconciled every shift"],
  },
  {
    label: "Reception",
    copy: "Check-in, who is inside right now, front-desk sales, and a proper handover between shifts.",
    caps: ["Check-in and access", "Front-desk sales", "Shift open and close"],
  },
  {
    label: "Operations",
    copy: "Staff, shifts, classes, trainers, maintenance, and the daily close live in one operating record.",
    caps: ["Staff, shifts, roles", "Classes and capacity", "The daily close"],
  },
  {
    label: "Member activity",
    copy: "Attendance and engagement per member, so a lapse becomes a conversation before it becomes a cancellation.",
    caps: ["Attendance history", "Inactivity flags", "Renewals at the right time"],
  },
] as const;

const MODULES = [
  {
    name: "Sales",
    summary: "From walk-in to member, with a name on every sale.",
    caps: [
      "Leads, walk-ins, and trials logged to the staff member who handled them",
      "Follow-ups with due dates instead of memory",
      "Conversion by person, day, and branch",
      "Every sale carries a name and a time",
    ],
  },
  {
    name: "Memberships",
    summary: "Plans, renewals, and freezes, with expiries the desk can see.",
    caps: [
      "Plans, renewals, freezes, upgrades, and transfers",
      "Family and group memberships",
      "Expiry lists at reception",
      "Access ends when the membership ends",
    ],
  },
  {
    name: "Payments",
    summary: "Cash, card, CliQ, and installments. A receipt for every dinar.",
    caps: [
      "Cash, card, CliQ, and installment plans",
      "A receipt for every payment, including partial ones",
      "Outstanding balances by member",
      "End-of-shift reconciliation against the drawer",
    ],
  },
  {
    name: "Reception",
    summary: "Check-in, who is inside, and a proper shift handover.",
    caps: [
      "Check-in by card, code, or phone number",
      "Who is inside right now",
      "Front-desk sales and top-ups",
      "Shift open, close, and handover notes",
    ],
  },
  {
    name: "Operations",
    summary: "Staff, shifts, classes, and the daily close, in one place.",
    caps: [
      "Staff, shifts, and roles",
      "Classes, trainers, and capacity",
      "Daily tasks and maintenance logs",
      "The daily close on one screen",
    ],
  },
  {
    name: "Member activity",
    summary: "Attendance and engagement, so lapses are seen before they happen.",
    caps: [
      "Attendance history per member",
      "Inactivity flags before members disappear",
      "Class bookings and no-shows",
      "Renewal conversations at the right time",
    ],
  },
] as const;

const DAY_EVENTS = [
  {
    time: "06:00",
    where: "Reception",
    title: "Doors open.",
    copy: "Members check in. The desk sees who is active, who expires this week, and who still owes a balance, before anyone asks.",
    tag: "Reception · Memberships",
  },
  {
    time: "09:30",
    where: "Sales desk",
    title: "A walk-in asks about prices.",
    copy: "The trial is logged to the staff member who handled it. If they join next week, the sale is theirs, on record.",
    tag: "Sales",
  },
  {
    time: "13:15",
    where: "Reception",
    title: "Half now, half next month.",
    copy: "An installment plan is created, a receipt is issued, and the balance is visible to everyone who needs to see it.",
    tag: "Payments",
  },
  {
    time: "17:30",
    where: "The floor",
    title: "Peak hour.",
    copy: "Class capacity, the trainer schedule, and the number of people inside sit on one screen at reception.",
    tag: "Operations · Member activity",
  },
  {
    time: "21:00",
    where: "Reception",
    title: "Shift handover.",
    copy: "The cash in the drawer is counted against what the system says was collected. Any difference has a name.",
    tag: "Reception · Payments",
  },
  {
    time: "23:00",
    where: "The office",
    title: "Daily close.",
    copy: "The owner sees revenue by method, new members, renewals due, and who did what, exactly as the day happened.",
    tag: "Operations",
  },
] as const;

const REGIONAL_SPECS = [
  ["Currency", "JOD, to the fils. Three decimals wherever a number appears."],
  ["Payments", "Cash, card, CliQ, and installments, with a receipt for each."],
  ["Language", "English and Arabic, with RTL-ready layouts."],
  ["Calendar", "Ramadan hours, Friday schedules, and public holidays."],
  ["Memberships", "Family plans, women's hours, freezes, and transfers."],
  ["Branches", "One account across branches, in Amman or anywhere in the region."],
] as const;

const CHAIN = [
  ["Member pays", "Who · amount · method"],
  ["Reception records", "Name · time · shift"],
  ["Shift closes", "Drawer vs. system"],
  ["Owner sees", "The day, as it happened"],
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

export function StoryMarker({ index, label, dark = false }: { index: string; label: string; dark?: boolean }) {
  return (
    <div className={`group flex items-center gap-3 border-t pt-4 ${dark ? "border-night-line" : "border-ink/10"}`}>
      <span className={`font-mono text-[10px] uppercase tracking-[0.16em] ${dark ? "text-night-ink-3" : "text-ink-3"}`}>{index}</span>
      <span className="h-[3px] w-7 origin-left rounded-sm bg-signal transition-transform duration-500 group-hover:scale-x-150" aria-hidden />
      <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.17em] ${dark ? "text-night-ink" : "text-ink"}`}>{label}</span>
    </div>
  );
}

export function ScrollStackStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeState, setActiveState] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduced = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    let frame = 0;

    const render = () => {
      frame = 0;
      if (reduced.matches) {
        setActiveState(7);
        section.style.setProperty("--stack-progress", "100%");
        section.style.setProperty("--stack-pin-y", "85.0875%");
        section.style.setProperty("--stack-pin-x", "0px");
        section.style.setProperty("--stack-pin-opacity", "1");
        section.style.setProperty("--stack-lift", "-22px");
        return;
      }

      const rect = section.getBoundingClientRect();
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = clamp(-rect.top / range, 0, 1);
      const sequenceStart = 0.09;
      const sequenceEnd = 0.87;
      const sequenceProgress = clamp((progress - sequenceStart) / (sequenceEnd - sequenceStart), 0, 0.99999);
      const platePosition = sequenceProgress * STACK_ITEMS.length;
      const plateIndex = Math.min(STACK_ITEMS.length - 1, Math.floor(platePosition));
      const phase = platePosition - plateIndex;
      const pullDistance = phase < 0.18
        ? 0
        : phase < 0.42
          ? smoothstep((phase - 0.18) / 0.24) * 34
          : phase < 0.62
            ? 34
            : phase < 0.86
              ? (1 - smoothstep((phase - 0.62) / 0.24)) * 34
              : 0;
      const nextState = progress < sequenceStart ? 0 : progress >= sequenceEnd ? 7 : plateIndex + 1;
      const pinCenter = 37.8125 + plateIndex * 9.455;
      const stackLift = -22 * smoothstep((progress - 0.9) / 0.08);

      setActiveState((current) => (current === nextState ? current : nextState));
      section.style.setProperty("--stack-progress", `${(progress * 100).toFixed(2)}%`);
      section.style.setProperty("--stack-pin-y", `${pinCenter.toFixed(4)}%`);
      section.style.setProperty("--stack-pin-x", `${pullDistance.toFixed(1)}px`);
      section.style.setProperty("--stack-pin-opacity", progress < sequenceStart ? "0" : "1");
      section.style.setProperty("--stack-lift", `${stackLift.toFixed(1)}px`);
    };

    const requestRender = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
    };

    render();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", requestRender, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", requestRender);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const activeCount = activeState === 7 ? STACK_ITEMS.length : Math.max(0, activeState);

  return (
    <section ref={sectionRef} id="product" data-stack-state={activeState} data-landing-theme="dark" className={styles.stackStory}>
      <div className={styles.stackTrack}>
        <div className={styles.stackStage}>
          <div className={styles.stackGrid}>
            <div className={styles.stackHeader}>
              <StoryMarker index="02" label="The stack" dark />
            </div>

            <div className={styles.stackFigure} aria-hidden>
              <div className={styles.rig}>
                <span className={styles.rigRod} />
                <span className={styles.rigBar} />
                <span className={styles.rigReturn} />
                <ol className={styles.rigPlates}>
                  {STACK_ITEMS.map((item, index) => (
                    <li
                      key={item.label}
                      data-stack-plate={index}
                      className={cn(styles.rigPlate, index < 3 && styles.rigPlateShort, index < activeCount && styles.rigPlateActive)}
                      style={{ "--plate-index": index } as CSSProperties}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ol>
                <span className={styles.rigPin} data-stack-pin>
                  <span className={styles.rigPinRod} />
                  <span className={styles.rigPinRing} />
                </span>
                <span className={styles.stackReadout}>
                  {activeState === 0
                    ? "Loose · 00 / 06"
                    : activeState === 7
                      ? "Full stack · 06 / 06"
                      : `Plate ${String(activeState).padStart(2, "0")} / 06 · ${STACK_ITEMS[activeState - 1]?.label}`}
                </span>
              </div>
            </div>

            <div className={styles.stackCopy} aria-live="polite">
              <div className={cn(styles.stackState, activeState === 0 && styles.stackStateActive)}>
                <h2>Six plates.<br />One pin.</h2>
                <p>A weight stack works because one pin turns loose plates into a single load. RIVET does that to a gym.</p>
              </div>
              {STACK_ITEMS.map((item, index) => (
                <div key={item.label} className={cn(styles.stackState, activeState === index + 1 && styles.stackStateActive)}>
                  <span className={styles.stackStateMeta}>Plate {String(index + 1).padStart(2, "0")} / 06</span>
                  <h3>{item.label}</h3>
                  <p>{item.copy}</p>
                  <ul className={styles.stackCaps}>
                    {item.caps.map((cap) => <li key={cap}>{cap}</li>)}
                  </ul>
                </div>
              ))}
              <div className={cn(styles.stackState, activeState === 7 && styles.stackStateActive)}>
                <h2>The full stack,<br />lifted together.</h2>
                <p>Every module reads and writes the same record. A payment at reception is already on the member, already in the ledger, and already in the daily close.</p>
              </div>
            </div>
          </div>
          <div className={styles.stackProgress} aria-hidden><span /></div>
        </div>
      </div>
    </section>
  );
}

export function ModulesShowcase() {
  const [openModule, setOpenModule] = useState(0);

  return (
    <section
      id="modules"
      data-landing-cover
      data-landing-theme="dark"
      aria-labelledby="modules-title"
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer4, styles.modulesSection)}
    >
      <div className={styles.modulesInner}>
        <StoryMarker index="03" label="Modules" dark />
        <div className={styles.modulesIntro}>
          <Reveal>
            <h2 id="modules-title" className={styles.modulesTitle}>What each<br />plate carries.</h2>
          </Reveal>
          <Reveal delay={140}>
            <p className={styles.modulesLead}>Six modules, one record. Everything a gym does between opening the door and counting the drawer.</p>
          </Reveal>
        </div>

        <ol className={styles.modulesList}>
          {MODULES.map((module, index) => {
            const open = openModule === index;
            const panelId = `landing-module-${index + 1}`;
            return (
              <li key={module.name} className={cn(styles.moduleItem, open && styles.moduleItemOpen)}>
                <Reveal delay={index * 55}>
                  <button
                    type="button"
                    className={styles.moduleButton}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenModule(open ? -1 : index)}
                  >
                    <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.moduleName}>{module.name}</span>
                    <span className={styles.moduleSummary}>{module.summary}</span>
                    <span className={styles.moduleToggle} aria-hidden />
                  </button>
                  <div id={panelId} className={styles.modulePanel} aria-hidden={!open}>
                    <div className={styles.modulePanelInner}>
                      <ul className={styles.moduleCaps}>
                        {module.caps.map((cap) => <li key={cap}>{cap}</li>)}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

export function OperationalDay() {
  const [active, setActive] = useState(0);
  const momentRefs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const moments = momentRefs.current.filter((moment): moment is HTMLLIElement => Boolean(moment));
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.dayIndex ?? 0);
          setActive(index);
        }
      },
      { rootMargin: "-42% 0px -48% 0px", threshold: 0 },
    );
    for (const moment of moments) observer.observe(moment);
    return () => observer.disconnect();
  }, []);

  const current = DAY_EVENTS[active] ?? DAY_EVENTS[0];

  return (
    <section
      id="day"
      data-landing-theme="paper"
      aria-labelledby="day-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer5, styles.daySection)}
    >
      <div className={styles.dayGrid}>
        <aside className={styles.dayAside}>
          <div className={styles.daySticky}>
            <StoryMarker index="04" label="A day on RIVET" />
            <h2 id="day-title" className="sr-only">A day on RIVET</h2>
            <p className={styles.dayClock} aria-live="polite" aria-atomic="true">
              <span className={styles.dayTimeMask}>
                <span key={current.time} className={styles.dayTime}>{current.time}</span>
              </span>
              <span key={current.where} className={styles.dayWhere}>{current.where}</span>
            </p>
          </div>
        </aside>

        <ol className={styles.dayList}>
          {DAY_EVENTS.map((event, index) => (
            <li
              key={event.time}
              ref={(node) => { momentRefs.current[index] = node; }}
              data-day-index={index}
              className={cn(styles.dayMoment, active === index && styles.dayMomentActive)}
              onMouseEnter={() => setActive(index)}
            >
              <time className={styles.dayMomentTime}>{event.time}</time>
              <h3>{event.title}</h3>
              <p>{event.copy}</p>
              <span className={styles.dayMomentTag}>{event.tag}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function AccountabilityLedger() {
  return (
    <section
      id="accountability"
      data-landing-cover
      data-landing-theme="dark"
      aria-labelledby="accountability-title"
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer6, styles.accountSection)}
    >
      <div className={styles.accountInner}>
        <StoryMarker index="05" label="Accountability" dark />
        <Reveal>
          <h2 id="accountability-title" className={styles.accountTitle}>Nothing gets<br />edited quietly.</h2>
        </Reveal>
        <Reveal delay={120}>
          <p className={styles.accountLead}>Every sale, payment, check-in, and shift change is recorded under the person who did it. Corrections are allowed. Silent ones are not. The owner sees the day as it happened.</p>
        </Reveal>
        <Reveal delay={180} className={styles.chainReveal}>
          <div className={styles.chain} role="img" aria-label="A payment's chain of custody from member payment to owner review">
            <span className={styles.chainRod} aria-hidden />
            {CHAIN.map(([title, detail], index) => (
              <div key={title} className={styles.chainNode} style={{ "--chain-delay": `${220 + index * 150}ms` } as CSSProperties}>
                <span className={styles.chainPlate}>{title}</span>
                <span className={styles.chainSub}>{detail}</span>
              </div>
            ))}
            <span className={styles.chainPin} aria-hidden><span /><span /></span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function RegionProof() {
  return (
    <section
      id="region"
      data-landing-theme="paper"
      aria-labelledby="region-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer7, styles.regionSection)}
    >
      <div className={styles.regionInner}>
        <StoryMarker index="06" label="Built for here" />
        <div className={styles.regionBilingual}>
          <Reveal>
            <h2 id="region-title" className={styles.regionEnglish}>Built in<br />Amman.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p lang="ar" dir="rtl" className={styles.regionArabic}>مبنيّ في عمّان.</p>
          </Reveal>
        </div>
        <div className={styles.regionBody}>
          <Reveal>
            <p className={styles.regionLead}>For the way gyms run here, not the way a template assumes they do.</p>
          </Reveal>
          <Reveal delay={120}>
            <dl className={styles.regionSpecs}>
              {REGIONAL_SPECS.map(([term, detail]) => (
                <div key={term} className={styles.regionSpec}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
