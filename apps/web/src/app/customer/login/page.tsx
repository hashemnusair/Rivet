"use client";

import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CUSTOMER_PERSONAS } from "@/lib/public/experience-data";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

export default function CustomerLoginPage() {
  const router = useRouter();
  const { signInCustomer } = useExperience();
  const [selected, setSelected] = useState(CUSTOMER_PERSONAS[0]!.id);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    signInCustomer(selected);
    const hasMembership = selected === "customer-lina";
    router.push(hasMembership ? "/customer/my-gyms" : "/customer/discover");
  };

  return (
    <main className="marketing-grid min-h-[calc(100vh-76px)] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
      <div className="mx-auto grid max-w-5xl overflow-hidden border border-ink/10 bg-surface shadow-pop lg:grid-cols-[0.9fr_1.1fr]">
        <div className="night-surface flex flex-col justify-between bg-night p-7 text-night-ink sm:p-10">
          <div>
            <p className="eyebrow-night">RIVET Member</p>
            <h1 className="marketing-display mt-5 text-[52px] leading-[0.9]">Your gyms.<br />Your history.<br /><span className="text-signal">Your entry.</span></h1>
            <p className="mt-6 text-[14px] leading-relaxed text-night-ink-2">Discover gyms, book a free trial, and carry every active membership in one place.</p>
          </div>
          <div className="mt-14 flex items-start gap-3 border-t border-night-line pt-5 text-[11px] leading-relaxed text-night-ink-3">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" /> Your QR and membership details are visible only inside your signed-in account.
          </div>
        </div>
        <div className="p-7 sm:p-10">
          <p className="eyebrow">Customer preview</p>
          <h2 className="mt-2 text-[25px] font-semibold tracking-tight">Sign in to RIVET Member</h2>
          <p className="mt-2 text-[13px] text-ink-2">Choose a customer scenario. Any password works in this frontend preview.</p>

          <div className="mt-7 grid gap-3" role="radiogroup" aria-label="Customer persona">
            {CUSTOMER_PERSONAS.map((persona) => (
              <button key={persona.id} type="button" role="radio" aria-checked={selected === persona.id} onClick={() => setSelected(persona.id)} className={cn("flex items-center gap-4 border p-4 text-start transition-colors", selected === persona.id ? "border-ink bg-sunken" : "border-line hover:border-line-3")}>
                <span className="flex size-11 items-center justify-center rounded-full bg-ink font-mono text-[11px] text-paper">{persona.initials}</span>
                <span className="min-w-0 flex-1"><strong className="block text-[14px]">{persona.name}</strong><span className="mt-0.5 block text-[12px] text-ink-3">{persona.context}</span></span>
                <span className={cn("flex size-5 items-center justify-center rounded-full border", selected === persona.id ? "border-ink bg-ink text-paper" : "border-line-3")}>{selected === persona.id ? <Check className="size-3" /> : null}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium">Email</span><Input type="email" value={CUSTOMER_PERSONAS.find((persona) => persona.id === selected)?.email ?? ""} readOnly /></label>
            <label className="block"><span className="mb-1.5 block text-[12px] font-medium">Password</span><Input type="password" defaultValue="demo-password" /></label>
            <Button type="submit" variant="signal" size="lg" className="w-full">Continue to RIVET Member <ArrowRight /></Button>
          </form>
          <p className="mt-5 text-center text-[11px] text-ink-3">Not a member yet? You can still browse participating gyms and book a free trial.</p>
        </div>
      </div>
    </main>
  );
}
