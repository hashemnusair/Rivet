"use client";

import { ArrowLeft, ArrowRight, Check, Lock } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Monogram } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import type { RoleKey } from "@/lib/domain/types";
import { CUSTOMER_PERSONAS } from "@/lib/public/experience-data";
import { useApp } from "@/lib/providers/app-providers";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const STAFF_PERSONAS: Array<{ role: RoleKey; name: string; email: string; context: string }> = [
  { role: "owner", name: "Omar Al-Khatib", email: "omar@forgefitness.jo", context: "Revenue, branches, staff, audit" },
  { role: "manager", name: "Layla Haddad", email: "layla@forgefitness.jo", context: "Approvals, reconciliation, queues" },
  { role: "salesperson", name: "Sara Abuhamdan", email: "sara@forgefitness.jo", context: "Pipeline, follow-ups, conversions" },
  { role: "receptionist", name: "Hala Qasem", email: "hala@forgefitness.jo", context: "Lookup, check-in, collect, renew" },
];

/** Which sign-in the portal is showing. `admin` is reachable only from the footer link. */
type Audience = "staff" | "member" | "admin";

const AUDIENCE_FROM_HASH: Record<string, Audience> = { "#member": "member", "#admin": "admin", "#staff": "staff" };

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signedIn } = useApp();
  const { customers, signInCustomer, signInPlatformAdmin } = useExperience();

  const [audience, setAudience] = useState<Audience>("staff");
  const [staffRole, setStaffRole] = useState<RoleKey>("owner");
  const [customerId, setCustomerId] = useState(CUSTOMER_PERSONAS[0]!.id);
  const [email, setEmail] = useState(STAFF_PERSONAS[0]!.email);
  const [loading, setLoading] = useState(false);

  const staff = STAFF_PERSONAS.find((p) => p.role === staffRole)!;
  const customer = customers.find((p) => p.id === customerId) ?? customers[0]!;

  // Deep links (/login#member, /login#admin) open the portal on the right tab.
  // A hash keeps this working under `output: export`, where search params would
  // force a Suspense boundary around the whole page.
  useEffect(() => {
    const apply = () => {
      const next = AUDIENCE_FROM_HASH[window.location.hash];
      if (next) setAudience(next);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  // Sign-in picks its own landing route, so the already-signed-in redirect
  // below must not race it.
  const submitting = useRef(false);

  useEffect(() => {
    if (signedIn && !submitting.current) router.replace("/dashboard");
  }, [signedIn, router]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    submitting.current = true;

    if (audience === "member") {
      signInCustomer(customer.id);
      router.push(customer.id === "customer-lina" ? "/customer/my-gyms" : "/customer/discover");
      return;
    }

    if (audience === "admin") {
      signInPlatformAdmin();
      router.push("/platform");
      return;
    }

    setLoading(true);
    try {
      await signIn(staffRole);
      router.push(staffRole === "receptionist" ? "/reception" : "/dashboard");
    } catch {
      submitting.current = false;
      toast.error("Could not start the demo session.");
    } finally {
      setLoading(false);
    }
  };

  const selectAudience = (next: Audience) => {
    setAudience(next);
    window.history.replaceState(null, "", next === "staff" ? "/login" : `/login#${next}`);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[42%_58%]">
      <BrandPanel />

      <div className="flex flex-col bg-paper px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-[12px] text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" /> rivet.jo
          </Link>
          <Link
            href={audience === "member" ? "/customer/signup" : "/signup"}
            className="text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            {audience === "member" ? "Create a member account" : "Create a gym account"}
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={126} height={32} priority />
          </div>

          {audience === "admin" ? (
            <AdminForm onBack={() => selectAudience("staff")} onSubmit={submit} />
          ) : (
            <>
              <h1 className="font-display text-[26px] font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1.5 text-[13.5px] text-ink-2">
                One portal for everyone on RIVET. Choose who you are, then pick a preview account.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-line-2 bg-sunken p-1" role="tablist" aria-label="Sign-in type">
                {(
                  [
                    ["staff", "Gym staff"],
                    ["member", "Gym member"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={audience === value}
                    onClick={() => selectAudience(value)}
                    className={cn(
                      "h-9 cursor-pointer rounded-md text-[13px] font-medium transition-colors",
                      audience === value ? "bg-surface text-ink shadow-[0_1px_2px_rgb(27_26_21/0.08)]" : "text-ink-3 hover:text-ink-2",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={submit} className="mt-6">
                <div className="space-y-2" role="radiogroup" aria-label={audience === "staff" ? "Staff account" : "Member account"}>
                  {audience === "staff"
                    ? STAFF_PERSONAS.map((persona) => (
                        <AccountOption
                          key={persona.role}
                          selected={staffRole === persona.role}
                          name={persona.name}
                          badge={ROLE_LABELS[persona.role]}
                          detail={persona.context}
                          onSelect={() => {
                            setStaffRole(persona.role);
                            setEmail(persona.email);
                          }}
                        />
                      ))
                    : customers.map((persona) => (
                        <AccountOption
                          key={persona.id}
                          selected={customer.id === persona.id}
                          name={persona.name}
                          badge="Member"
                          detail={persona.context}
                          onSelect={() => setCustomerId(persona.id)}
                        />
                      ))}
                </div>

                <div className="mt-5 space-y-3.5">
                  <Field label="Email" htmlFor="login-email">
                    <Input
                      id="login-email"
                      type="email"
                      value={audience === "staff" ? email : customer.email}
                      onChange={(event) => setEmail(event.target.value)}
                      readOnly={audience !== "staff"}
                      autoComplete="username"
                    />
                  </Field>
                  <Field label="Password" htmlFor="login-password" hint="Any password works — this is a local preview.">
                    <Input id="login-password" type="password" defaultValue="demo-password" autoComplete="current-password" />
                  </Field>
                </div>

                <Button type="submit" className="mt-5 w-full" size="lg" loading={loading} data-testid="sign-in-button">
                  {audience === "staff" ? `Sign in as ${staff.name.split(" ")[0]}` : `Continue as ${customer.name.split(" ")[0]}`}
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              <p className="mt-5 text-center text-[12px] text-ink-3">
                No account?{" "}
                <Link
                  href={audience === "member" ? "/customer/signup" : "/signup"}
                  className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink"
                >
                  {audience === "member" ? "Create a member account" : "Start a gym trial"}
                </Link>{" "}
                or{" "}
                <Link href="/customer/discover" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
                  browse gyms
                </Link>
                .
              </p>
            </>
          )}
        </div>

        {/* Platform administration is deliberately the quietest thing on the page. */}
        <div className="mx-auto w-full max-w-md border-t border-line pt-4">
          {audience === "admin" ? (
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4">
              RIVET internal · restricted access
            </p>
          ) : (
            <button
              type="button"
              onClick={() => selectAudience("admin")}
              className="mx-auto flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-4 transition-colors hover:text-ink-2"
            >
              <Lock className="size-3" /> Platform administrator
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AccountOption({
  selected,
  name,
  badge,
  detail,
  onSelect,
}: {
  selected: boolean;
  name: string;
  badge: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg border bg-surface p-3 text-start transition-colors",
        selected ? "border-ink" : "border-line-2 hover:border-line-3",
      )}
    >
      <Monogram name={name} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-ink">{name}</span>
          <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2">
            {badge}
          </span>
        </span>
        <span className="block truncate text-[12px] text-ink-3">{detail}</span>
      </span>
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-ink bg-ink text-paper" : "border-line-3",
        )}
        aria-hidden
      >
        {selected ? <Check className="size-3" /> : null}
      </span>
    </button>
  );
}

function AdminForm({ onBack, onSubmit }: { onBack: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return (
    <div className="animate-fade-up">
      <button
        type="button"
        onClick={onBack}
        className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to gym & member sign-in
      </button>
      <span className="mt-6 flex size-10 items-center justify-center rounded-lg border border-line-2 bg-surface text-signal">
        <Lock className="size-4" />
      </span>
      <h1 className="mt-4 font-display text-[26px] font-semibold tracking-tight">Platform administration</h1>
      <p className="mt-1.5 text-[13.5px] text-ink-2">
        RIVET staff only. Manage gym tenants, subscriptions, billing, and support across the network.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3.5">
        <Field label="Work email" htmlFor="admin-email">
          <Input id="admin-email" type="email" defaultValue="elias@rivet.jo" autoComplete="username" />
        </Field>
        <Field label="Password" htmlFor="admin-password" hint="Any password works — this is a local preview.">
          <Input id="admin-password" type="password" defaultValue="demo-password" autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="signal" className="w-full" size="lg">
          Enter platform console <ArrowRight className="size-4" />
        </Button>
      </form>
    </div>
  );
}

function BrandPanel() {
  return (
    <div className="night-surface relative hidden flex-col justify-between bg-night p-10 text-night-ink lg:flex">
      <Link href="/" aria-label="RIVET home">
        <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={149} height={38} priority />
      </Link>

      <div className="max-w-md">
        <p className="eyebrow-night mb-4">Gym revenue & operations</p>
        <h2 className="font-display text-[38px] font-semibold leading-[1.08] tracking-tight">
          Never lose a renewal, a lead, or a dinar again.
        </h2>
        <p className="mt-5 text-[15px] leading-relaxed text-night-ink-2">
          Members, sales follow-up, reception, payments and cash — one chronological record per member, full
          accountability per staff action.
        </p>
        <p className="mt-4 font-['var(--font-plex-arabic)'] text-[15px] leading-relaxed text-night-ink-3" dir="rtl">
          نظام الإيرادات والعمليات للنوادي الرياضية — من العضو المحتمل إلى التجديد والتحصيل.
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-night-line pt-5 font-mono text-[11px] tracking-[0.12em] text-night-ink-3">
        <span>DEMO TENANT — FORGE FITNESS CLUB</span>
        <span>AMMAN · JOD</span>
      </div>
    </div>
  );
}
