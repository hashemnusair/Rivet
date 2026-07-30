"use client";

import { ArrowRight, Check } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Monogram } from "@/components/ui/misc";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import type { RoleKey } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";

const PERSONAS: Array<{
  role: RoleKey;
  name: string;
  email: string;
  context: string;
  focus: string;
}> = [
  {
    role: "owner",
    name: "Omar Al-Khatib",
    email: "omar@forgefitness.jo",
    context: "Forge Fitness Club · both branches",
    focus: "Revenue, leakage, branch & staff performance, audit.",
  },
  {
    role: "manager",
    name: "Layla Haddad",
    email: "layla@forgefitness.jo",
    context: "General manager · both branches",
    focus: "Approvals, reconciliation, queues, staff accountability.",
  },
  {
    role: "salesperson",
    name: "Sara Abuhamdan",
    email: "sara@forgefitness.jo",
    context: "Sales · both branches",
    focus: "Pipeline, daily follow-up queues, conversions.",
  },
  {
    role: "receptionist",
    name: "Hala Qasem",
    email: "hala@forgefitness.jo",
    context: "Front desk · Forge — Abdoun",
    focus: "Member lookup, check-in, collect & renew fast.",
  },
];

export default function LoginPage() {
  const { signIn, signedIn } = useApp();
  const router = useRouter();
  const [selected, setSelected] = useState<RoleKey>("owner");
  const [email, setEmail] = useState(PERSONAS[0]!.email);
  const [password, setPassword] = useState("demo-password");
  const [loading, setLoading] = useState(false);

  const persona = PERSONAS.find((p) => p.role === selected)!;

  // Sign-in through this form picks its own landing route, so the
  // already-signed-in redirect below must not race it.
  const submitting = useRef(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    submitting.current = true;
    try {
      await signIn(selected);
      router.push(selected === "receptionist" ? "/reception" : "/dashboard");
    } catch {
      submitting.current = false;
      toast.error("Could not start the demo session.");
    } finally {
      setLoading(false);
    }
  };

  // Someone who is already signed in has no business on the login page.
  // Navigating during render warns and races the router — do it as an effect.
  useEffect(() => {
    if (signedIn && !submitting.current) router.replace("/dashboard");
  }, [signedIn, router]);

  return (
    <div className="grid min-h-screen lg:grid-cols-[44%_56%]">
      {/* Brand panel */}
      <div className="night-surface relative hidden flex-col justify-between bg-night p-10 text-night-ink lg:flex">
        <div className="flex items-center">
          {/* Lockup only — it already contains the glyph. */}
          <Image src="/brand/rivet-lockup-rev.png" alt="RIVET" width={149} height={38} priority />
        </div>

        <div className="max-w-md">
          <p className="eyebrow-night mb-4">Gym revenue & operations</p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.08] tracking-tight">
            Never lose a renewal, a lead, or a dinar again.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-night-ink-2">
            Members, memberships, sales follow-up, reception, payments and cash — one
            chronological record per member, full accountability per staff action.
          </p>
          <p className="mt-4 font-['var(--font-plex-arabic)'] text-[15px] leading-relaxed text-night-ink-3" dir="rtl">
            نظام الإيرادات والعمليات للنوادي الرياضية — من العضو المحتمل إلى التجديد والتحصيل.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-night-line pt-5 text-[12px] text-night-ink-3">
          <span className="font-mono tracking-[0.12em]">DEMO TENANT — FORGE FITNESS CLUB</span>
          <span className="font-mono tracking-[0.12em]">AMMAN · JOD</span>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex items-center justify-center bg-paper px-6 py-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Image src="/brand/rivet-lockup.png" alt="RIVET" width={126} height={32} priority />
          </div>

          <h2 className="font-display text-[22px] font-semibold tracking-tight">Sign in to the demo</h2>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Pick a persona — every area of the product adapts to the role&rsquo;s permissions.
          </p>

          <div className="mt-6 space-y-2" role="radiogroup" aria-label="Demo persona">
            {PERSONAS.map((p) => (
              <button
                key={p.role}
                type="button"
                role="radio"
                aria-checked={selected === p.role}
                onClick={() => {
                  setSelected(p.role);
                  setEmail(p.email);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border bg-surface p-3 text-start transition-colors cursor-pointer",
                  selected === p.role ? "border-ink" : "border-line-2 hover:border-line-3",
                )}
              >
                <Monogram name={p.name} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-ink">{p.name}</span>
                    <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2">
                      {ROLE_LABELS[p.role]}
                    </span>
                  </span>
                  <span className="block truncate text-[12px] text-ink-3">{p.context}</span>
                  <span className="block truncate text-[12px] text-ink-2">{p.focus}</span>
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    selected === p.role ? "border-ink bg-ink text-paper" : "border-line-3",
                  )}
                  aria-hidden
                >
                  {selected === p.role ? <Check className="size-3" /> : null}
                </span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email" htmlFor="login-email">
              <Input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password" htmlFor="login-password" hint="Any password works — this is a local preview.">
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" className="w-full" size="lg" loading={loading} data-testid="sign-in-button">
              Sign in as {persona.name.split(" ")[0]}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-3">
            Demo tenant: <span className="font-medium text-ink-2">Forge Fitness Club</span> — two Amman branches,
            seeded with realistic members, leads, payments and shifts. No external services.
          </p>
        </div>
      </div>
    </div>
  );
}
