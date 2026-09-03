"use client";

import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  Inbox,
  LayoutDashboard,
  Lock,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { DataPagination, PageHeader, Stat } from "@/components/shared/chrome";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatePanel } from "@/components/ui/states";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContextLabel, TechnicalLabel } from "@/components/ui/typography";
import { cn } from "@/lib/utils/cn";

const COLORS = [
  ["Paper", "#F5F4EF", "bg-paper"],
  ["Surface", "#FFFFFF", "bg-surface"],
  ["Sunken", "#EDECE5", "bg-sunken"],
  ["Ink", "#1B1A15", "bg-ink"],
  ["Night", "#15140F", "bg-night"],
  ["Signal", "#D9232B", "bg-signal"],
  ["Success", "#176E44", "bg-success"],
  ["Warning", "#96620A", "bg-warning"],
] as const;

const SAMPLE_PAGE = {
  items: [{ id: "member-1" }, { id: "member-2" }],
  page: 2,
  pageSize: 20,
  totalItems: 101,
  totalPages: 6,
};

export function DesignSystemGallery() {
  const [page, setPage] = useState(2);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-5">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={122} height={31} priority />
            <span className="h-8 w-px bg-line" aria-hidden />
            <div>
              <ContextLabel>Product interface reference</ContextLabel>
              <p className="mt-0.5 text-[13.5px] font-semibold">Preview only</p>
            </div>
          </div>
          <TechnicalLabel>Local / Vercel Preview</TechnicalLabel>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] space-y-12 px-5 py-8 sm:px-8 lg:py-12">
        <PageHeader
          sectionLabel="Quiet operations ledger"
          title="RIVET product system"
          description="A restrained operational language for gym teams, members, and platform operators. Human context stays readable; mono is reserved for records and codes."
          actions={<Button variant="secondary">Review checklist <ArrowRight /></Button>}
        />

        <GallerySection title="Foundations" description="Existing product colors, practical type roles, and restrained geometry.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COLORS.map(([name, value, color]) => (
              <article key={name} className="overflow-hidden rounded-md border border-line bg-surface">
                <div className={cn("h-20 border-b border-line", color)} />
                <div className="flex items-center justify-between gap-3 p-3">
                  <ContextLabel className="text-ink-2">{name}</ContextLabel>
                  <TechnicalLabel className="text-[9.5px]">{value}</TechnicalLabel>
                </div>
              </article>
            ))}
          </div>

          <section className="mt-5 grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface sm:grid-cols-4 sm:divide-y-0" aria-label="Example metrics">
            <Stat label="Collected today" value="JOD 767.750" className="p-4" />
            <Stat label="Open leads" value="24" context="6 need contact" className="p-4" />
            <Stat label="Renewals due" value="5" tone="warning" context="next 7 days" className="p-4" />
            <Stat label="Check-ins" value="16" context="today" className="p-4" />
          </section>

          <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-[1.4fr_1fr]">
            <article className="bg-surface p-5 sm:p-6">
              <ContextLabel>Page title</ContextLabel>
              <h1 className="mt-2 font-display text-[30px] font-semibold tracking-tight">Revenue that stays accountable.</h1>
              <h2 className="mt-6 text-[18px] font-semibold">Section heading</h2>
              <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-2">Normal interface copy is Manrope, comfortably readable, and direct enough for a busy front desk.</p>
              <p className="mt-2 text-[12px] text-ink-3">Helper text explains what happens without competing with the task.</p>
            </article>
            <article className="bg-surface p-5 sm:p-6">
              <ContextLabel>Allowed label roles</ContextLabel>
              <div className="mt-4 space-y-4">
                <div><ContextLabel>Membership summary</ContextLabel><p className="mt-1 text-[12px] text-ink-2">Human-facing section context</p></div>
                <div><TechnicalLabel>RV-001006 · TXN-A51D</TechnicalLabel><p className="mt-1 text-[12px] text-ink-2">Identifier and transaction reference</p></div>
              </div>
            </article>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <TokenSpec title="Spacing" detail="4 / 8 / 12 / 16 / 20 / 24 / 32" specimen={<div className="flex items-end gap-2">{[8, 12, 16, 24, 32].map((size) => <span key={size} className="block bg-ink" style={{ width: size, height: size }} />)}</div>} />
            <TokenSpec title="Radius" detail="3 / 4 / 6 / 8px" specimen={<div className="flex gap-2">{[3, 4, 6, 8].map((radius) => <span key={radius} className="size-9 border border-line-3 bg-surface" style={{ borderRadius: radius }} />)}</div>} />
            <TokenSpec title="Elevation" detail="Flat at rest · shadow-pop for floating UI" specimen={<div className="flex gap-3"><span className="size-12 rounded-md border border-line bg-surface" /><span className="size-12 rounded-md border border-line bg-surface shadow-pop" /></div>} />
          </div>
        </GallerySection>

        <GallerySection title="Actions and fields" description="One obvious safe action, quieter alternatives, and labels that remain visible.">
          <div className="panel grid gap-6 p-5 lg:grid-cols-2 lg:p-6">
            <div>
              <ContextLabel>Button hierarchy</ContextLabel>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button>Tenant primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="signal">RIVET signal</Button>
                <Button variant="danger">Destructive</Button>
                <Button disabled>Disabled</Button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Button size="xs">Extra small</Button>
                <Button size="sm">Small</Button>
                <Button>Default</Button>
                <Button size="lg">Large touch action</Button>
              </div>
            </div>
            <FieldGrid className="sm:grid-cols-2" alignFrom="sm">
              <Field label="Member name" required><Input defaultValue="Rana Haddad" /></Field>
              <Field label="Home branch"><Select defaultValue="abdoun"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="abdoun">Abdoun</SelectItem><SelectItem value="sweifieh">Sweifieh</SelectItem></SelectContent></Select></Field>
              <Field label="Phone" hint="Jordan is the default; international numbers remain supported."><Input defaultValue="+962 79 123 4567" dir="ltr" /></Field>
              <Field label="Reference" error="Use a valid transfer reference."><Input aria-invalid defaultValue="CLIQ-" /></Field>
              <Field label="Desk note" className="sm:col-span-2"><Textarea placeholder="Add only the context the next employee needs." /></Field>
              <Field label="Disabled field"><Input disabled defaultValue="Managed by the gym" /></Field>
              <label className="flex items-center justify-between gap-4 rounded-md border border-line px-3 py-2.5 text-[13px] font-medium"><span>Class booking enabled</span><Switch defaultChecked aria-label="Class booking enabled" /></label>
            </FieldGrid>
          </div>
        </GallerySection>

        <GallerySection title="Filters, status, and records" description="Compact controls and stable row patterns for high-frequency work.">
          <Tabs defaultValue="members">
            <TabsList aria-label="Example record views"><TabsTrigger value="members">Members</TabsTrigger><TabsTrigger value="activity">Activity</TabsTrigger></TabsList>
            <TabsContent value="members" className="mt-4">
          <div className="panel overflow-hidden">
            <header className="flex flex-wrap items-center gap-2 border-b border-line p-3">
              <div className="relative min-w-[220px] flex-1"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden /><Input className="ps-9" placeholder="Search members" aria-label="Search example members" /></div>
              <Button size="sm">Active <span className="tabular opacity-70">38</span></Button>
              <Button size="sm" variant="secondary">Expiring <span className="tabular opacity-70">5</span></Button>
              <Button size="sm" variant="secondary">Has balance <span className="tabular opacity-70">3</span></Button>
            </header>
            <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3">
              <StatusChip tone="green">Active</StatusChip>
              <StatusChip tone="amber">Needs attention</StatusChip>
              <StatusChip tone="red">Blocked</StatusChip>
              <StatusChip tone="neutral">Frozen</StatusChip>
              <StatusChip tone="outline">Cancelled</StatusChip>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Branch</TableHead><TableHead>Status</TableHead><TableHead className="text-end">Balance</TableHead><TableHead>Last visit</TableHead></TableRow></TableHeader>
              <TableBody>
                <ExampleMemberRow name="Rana Haddad" number="ABD-1042" branch="Abdoun" balance="JOD 0.000" status="Active" />
                <ExampleMemberRow name="Yousef Nasser" number="SWF-1097" branch="Sweifieh" balance="JOD 42.750" status="Expiring" />
              </TableBody>
            </Table>
            <DataPagination page={{ ...SAMPLE_PAGE, page }} onPage={setPage} className="border-t border-line px-4 py-3" />
          </div>
            </TabsContent>
            <TabsContent value="activity"><StatePanel layout="section" title="No activity selected" description="Choose a member to inspect their chronological record." /></TabsContent>
          </Tabs>
        </GallerySection>

        <GallerySection title="Panels and hierarchy" description="Frame meaningful groups once; use dividers and spacing inside them.">
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="panel overflow-hidden">
              <header className="border-b border-line px-4 py-3"><h3 className="text-[15px] font-semibold">Member activity</h3><p className="mt-1 text-[12.5px] text-ink-3">Valid: one panel, stable header, divided records.</p></header>
              <div className="divide-y divide-line">
                {["Membership renewed", "JOD 120.000 collected", "Checked in · Abdoun"].map((item, index) => <div key={item} className="flex items-center gap-3 px-4 py-3"><span className="flex size-7 items-center justify-center rounded-md bg-sunken text-ink-2"><Check className="size-3.5" /></span><span className="min-w-0 flex-1 text-[13px] font-medium">{item}</span><span className="text-[11.5px] text-ink-3">{index + 1}h ago</span></div>)}
              </div>
            </article>
            <article className="border border-dashed border-danger/40 bg-danger-bg/20 p-5">
              <ContextLabel className="text-danger">Avoid</ContextLabel>
              <h3 className="mt-1 text-[15px] font-semibold">Card inside card inside card</h3>
              <p className="mt-1 text-[12.5px] text-ink-2">Do not repeat a framed icon, label, heading, explanation, and another frame when spacing and dividers already establish the group.</p>
              <div className="mt-4 rounded-lg border border-line bg-surface p-3 opacity-65"><div className="rounded-lg border border-line bg-sunken/40 p-3"><div className="rounded-lg border border-line bg-surface p-3 text-[12px] line-through">Redundant inner container</div></div></div>
            </article>
          </div>
        </GallerySection>

        <GallerySection title="Feedback states" description="States scale to their container instead of turning every absence into a landing page.">
          <div className="space-y-4">
            <StatePanel layout="inline" icon={AlertTriangle} title="Connection interrupted" description="The last loaded member list is still visible." action={<Button size="sm" variant="secondary">Retry</Button>} />
            <div className="grid gap-4 lg:grid-cols-2">
              <StatePanel layout="section" icon={Inbox} title="No payments in this range" description="Change the dates or clear the filters." action={<Button size="sm" variant="secondary">Clear filters</Button>} />
              <StatePanel layout="section" icon={Lock} title="Owner approval required" description="Ask an owner to approve this discount before collecting." />
            </div>
            <StatePanel layout="page" icon={Building2} title="Choose a branch to open Reception" description="Reception works one branch at a time." action={<Button variant="secondary">Choose branch</Button>} />
          </div>
        </GallerySection>

        <GallerySection title="Navigation and product modes" description="One quiet active state across the light workspace, night workspace, and member mobile shell.">
          <div className="grid gap-5 xl:grid-cols-3">
            <NavigationSpec title="Settings rail" tone="light" items={["Organization", "Roles & permissions", "Payments", "Operational rules"]} active="Roles & permissions" />
            <NavigationSpec title="Night workspace" tone="night" items={["Dashboard", "Reception", "Members", "Classes"]} active="Reception" />
            <article className="overflow-hidden rounded-lg border border-line bg-surface">
              <div className="border-b border-line px-4 py-3"><ContextLabel>Member mobile</ContextLabel><h3 className="mt-1 text-[16px] font-semibold">Membership</h3></div>
              <div className="space-y-3 p-4"><div className="rounded-md border border-line p-4"><StatusChip tone="green">Active</StatusChip><p className="mt-3 text-[20px] font-semibold">Annual access</p><p className="mt-1 text-[12px] text-ink-3">Renews 18 October · Abdoun</p></div><Button className="w-full" size="lg">Show entry pass</Button></div>
              <nav className="grid grid-cols-4 border-t border-line bg-paper px-2 py-2" aria-label="Example member navigation">{[{ icon: LayoutDashboard, label: "Home" }, { icon: CalendarDays, label: "Classes" }, { icon: CircleDollarSign, label: "Payments" }, { icon: Users, label: "Account" }].map(({ icon: MemberIcon, label }) => <span key={label} className={cn("flex flex-col items-center gap-1 py-1 text-[10px]", label === "Payments" ? "font-semibold text-ink" : "text-ink-3")}><MemberIcon className="size-4" />{label}</span>)}</nav>
            </article>
          </div>
        </GallerySection>

        <GallerySection title="Loading and motion" description="Short, interruptible transitions explain state. Reduced-motion users receive an immediate equivalent.">
          <div className="panel grid gap-6 p-5 md:grid-cols-2">
            <div><ContextLabel>Loading</ContextLabel><div className="mt-3 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div></div>
            <div><ContextLabel>Meaningful transition</ContextLabel><div className="mt-3 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-md bg-success-bg text-success transition-[transform,opacity] duration-150 hover:scale-[1.03]"><ShieldCheck className="size-4" /></span><div><p className="text-[13px] font-semibold">Saved</p><p className="text-[12px] text-ink-3">Opacity and transform only; no layout shift.</p></div></div></div>
          </div>
        </GallerySection>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-[12px] text-ink-3">
          <span>RIVET product UI checkpoint · synthetic data only</span>
          <TechnicalLabel>DS-PREVIEW-01</TechnicalLabel>
        </footer>
      </div>
    </main>
  );
}

function GallerySection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><header className="mb-5 max-w-3xl"><h2 className="text-[20px] font-semibold tracking-tight">{title}</h2><p className="mt-1 text-[13.5px] text-ink-2">{description}</p></header>{children}</section>;
}

function TokenSpec({ title, detail, specimen }: { title: string; detail: string; specimen: React.ReactNode }) {
  return <article className="panel p-4"><ContextLabel>{title}</ContextLabel><div className="mt-4 min-h-12">{specimen}</div><TechnicalLabel className="mt-3 text-[9.5px]">{detail}</TechnicalLabel></article>;
}

function ExampleMemberRow({ name, number, branch, balance, status }: { name: string; number: string; branch: string; balance: string; status: "Active" | "Expiring" }) {
  return <TableRow><TableCell><div className="flex items-center gap-2.5"><Monogram name={name} size="sm" /><div><p className="font-medium">{name}</p><p className="font-mono text-[11px] text-ink-3">{number}</p></div></div></TableCell><TableCell>{branch}</TableCell><TableCell><StatusChip tone={status === "Active" ? "green" : "amber"}>{status}</StatusChip></TableCell><TableCell className="text-end font-medium tabular">{balance}</TableCell><TableCell className="text-ink-3">2 days ago</TableCell></TableRow>;
}

function NavigationSpec({ title, tone, items, active }: { title: string; tone: "light" | "night"; items: string[]; active: string }) {
  const night = tone === "night";
  return <article className={cn("overflow-hidden rounded-lg border", night ? "night-surface border-night-line bg-night text-night-ink" : "border-line bg-surface")}><header className={cn("border-b px-4 py-3", night ? "border-night-line" : "border-line")}><ContextLabel tone={night ? "night" : "default"}>{title}</ContextLabel></header><nav className="space-y-1 p-3" aria-label={`${title} example`}>{items.map((item, index) => { const Icon = [Settings, ShieldCheck, CircleDollarSign, Clock3][index] ?? Settings; const selected = item === active; return <span key={item} className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px]", night ? selected ? "bg-night-3 font-semibold text-night-ink" : "text-night-ink-2" : selected ? "bg-sunken font-semibold text-ink" : "text-ink-2")}><Icon className={cn("size-4", night && !selected ? "text-night-ink-3" : "text-ink-3")} />{item}</span>; })}</nav></article>;
}
