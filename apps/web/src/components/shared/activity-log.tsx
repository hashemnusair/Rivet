"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { activityTextParts, isOpaqueActivityLabel } from "@/lib/i18n/activity-log";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";

/**
 * One row design for every activity log: the gym's Activity log, the member
 * timeline, the owner dashboard feed and the platform console's histories.
 *
 *   Plain label · what it was about   [badges]
 *   The stored sentence, wrapping freely, with long ids shortened
 *   Who did it · Role · 27 Sep, 19:35
 *
 * Text wraps instead of sitting in fixed columns, so a long label or a long
 * unbroken reference can never print over its neighbour, at any width or in
 * either direction.
 */

/** Receipt, agreement and invoice numbers ("R-2479", "RVT-20260927-CU4U6"): kept on one line. */
const REFERENCE_TOKEN = /([A-Z]{1,6}-[A-Z0-9]+(?:-[A-Z0-9]+)*)/;

function TextWithReferences({ text }: { text: string }) {
  return text.split(REFERENCE_TOKEN).map((piece, index) => index % 2 === 1
    ? <bdi key={index} dir="ltr" className="whitespace-nowrap">{piece}</bdi>
    : piece);
}

/** Stored text with long ids shown short; the full id stays on hover. */
export function ActivityText({ text }: { text: string }) {
  const t = useT();
  return (
    <>
      {activityTextParts(text).map((part, index) => part.kind === "text"
        ? <span key={index}><TextWithReferences text={part.text} /></span>
        : <bdi key={index} dir="ltr" className="whitespace-nowrap" title={t("activityLog.fullReference", { reference: part.full })}>{part.text}</bdi>)}
    </>
  );
}

export interface ActivityEntryProps {
  /** The plain label, usually from `activityActionLabel`. */
  title: string;
  /** What the action was about (a member, a receipt). Hidden when it is only an id. */
  subject?: string;
  /** Small status badges after the title, such as "Waiting for approval". */
  badges?: ReactNode;
  /** The stored sentence, or several lines of it. Shown as written, ids shortened. */
  description?: string | readonly string[];
  /** A small link at the end of the who-and-when line, such as "View receipt". */
  action?: ReactNode;
  actor?: string;
  /** The actor's role, already translated. */
  role?: string;
  occurredAt?: string;
  /** Formats the time in this zone instead of the screen's own (the platform console uses Amman). */
  timeZone?: string;
  dense?: boolean;
  className?: string;
}

/** The text block of an activity row, without padding or dividers. */
export function ActivityEntry({ title, subject, badges, description, action, actor, role, occurredAt, timeZone, dense, className }: ActivityEntryProps) {
  const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
  // A stored sentence that only repeats the label ("Member archived") adds nothing.
  const lines = description === undefined ? [] : (typeof description === "string" ? [description] : description).filter((line) => line.trim() && !same(line, title));
  const showSubject = subject !== undefined && !isOpaqueActivityLabel(subject) && !lines.some((line) => line.toLocaleLowerCase().includes(subject.trim().toLocaleLowerCase()));
  return (
    <div className={cn("min-w-0 flex-1 text-start [overflow-wrap:anywhere]", className)} data-slot="activity-entry">
      <p className={cn("leading-snug text-ink", dense ? "text-[12.5px]" : "text-[13px]")}>
        <span className="font-medium"><ActivityText text={title} /></span>
        {showSubject ? <span className="text-ink-2"> · <bdi><ActivityText text={subject} /></bdi></span> : null}
        {badges ? <>{" "}<span className="ms-1 inline-flex flex-wrap gap-1.5 align-middle">{badges}</span></> : null}
      </p>
      {lines.map((line, index) => (
        <p key={index} className="mt-0.5 text-[12.5px] leading-snug text-ink-2"><span dir="auto"><ActivityText text={line} /></span></p>
      ))}
      <ActivityMeta actor={actor} role={role} occurredAt={occurredAt} timeZone={timeZone} extra={action} className="mt-0.5" />
    </div>
  );
}

/** "Hashem Nusair · Owner · 27 Sep, 19:35": quiet, one line, wraps on a phone. */
export function ActivityMeta({ actor, role, occurredAt, timeZone, extra, className }: { actor?: string; role?: string; occurredAt?: string; timeZone?: string; extra?: ReactNode; className?: string }) {
  const format = useFormat(timeZone);
  const time = occurredAt && Number.isFinite(Date.parse(occurredAt)) ? format.dateTime(occurredAt) : undefined;
  const facts: ReactNode[] = [];
  if (actor?.trim()) facts.push(<bdi key="actor">{actor.trim()}</bdi>);
  if (role?.trim()) facts.push(<span key="role">{role.trim()}</span>);
  if (time) facts.push(<time key="time" dateTime={occurredAt} dir="auto" className="tabular">{time}</time>);
  if (extra) facts.push(<span key="extra">{extra}</span>);
  if (facts.length === 0) return null;
  return (
    <p className={cn("text-[12px] leading-snug text-ink-3", className)}>
      {facts.flatMap((fact, index) => index === 0 ? [fact] : [<span key={`sep-${index}`}> · </span>, fact])}
    </p>
  );
}

/** A divided list of activity rows, for panels and pages. */
export function ActivityLog({ children, className, ...rest }: { children: ReactNode; className?: string; "aria-label"?: string; "aria-labelledby"?: string }) {
  return <ol className={cn("divide-y divide-line", className)} {...rest}>{children}</ol>;
}

/** One row of an `ActivityLog`. */
export function ActivityRow({ className, trailing, children, id, ...entry }: ActivityEntryProps & { trailing?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <li id={id} className={cn("px-4 py-3 sm:px-5", className)}>
      <div className="flex items-start gap-3">
        <ActivityEntry {...entry} />
        {trailing}
      </div>
      {children}
    </li>
  );
}
