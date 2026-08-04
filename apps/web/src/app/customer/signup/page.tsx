"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, QrCode, Search, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { useExperience } from "@/lib/providers/experience-provider";

const schema = z
  .object({
    fullName: z.string().trim().min(3, "Enter your full name"),
    email: z.string().trim().email("Enter a valid email"),
    phone: z
      .string()
      .trim()
      .min(9, "Enter your mobile number")
      .regex(/^\+?[\d\s()-]{9,18}$/, "Enter a valid mobile number"),
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;


export default function MemberSignupPage() {
  const router = useRouter();
  const { registerCustomer, emailTaken, experienceReady } = useExperience();
  const [submitting, setSubmitting] = useState(false);

  // Real accounts are created by Clerk in the member portal. This local form
  // only exists for the preview build, which has no Clerk instance — keeping
  // both live would give members two different "sign up" buttons.
  useEffect(() => {
    if (!DEMO_AUTH_BYPASS) router.replace("/login/member/create");
  }, [router]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: "", email: "", phone: "", password: "", confirm: "" },
  });

  const submit = handleSubmit(async (values) => {
    if (emailTaken(values.email)) {
      setError("email", { message: "An account already uses this email" });
      return;
    }
    setSubmitting(true);
    try {
      await registerCustomer({ fullName: values.fullName, email: values.email, phone: values.phone });
      router.push("/customer/discover");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="mx-auto grid max-w-[1080px] gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_0.85fr] lg:gap-14 lg:px-8 lg:py-16">
      <div className="order-2 lg:order-1">
        <p className="eyebrow">RIVET Member</p>
        <h1 className="mt-2 font-display text-[28px] font-semibold tracking-tight">Create your member account</h1>
        <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-ink-2">
          Free, and separate from any gym. Book trials, then hold every membership you take out in one place.
        </p>

        <form onSubmit={submit} className="mt-7 max-w-md space-y-4" noValidate>
          <Field label="Full name" htmlFor="signup-name" error={errors.fullName?.message} required>
            <Input id="signup-name" autoComplete="name" placeholder="Lina Haddad" {...register("fullName")} />
          </Field>
          <Field label="Email" htmlFor="signup-email" error={errors.email?.message} required>
            <Input id="signup-email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
          </Field>
          <Field label="Mobile number" htmlFor="signup-phone" error={errors.phone?.message} required hint="Gyms use this to confirm your trial booking.">
            <Input id="signup-phone" type="tel" autoComplete="tel" placeholder="+962 79 000 0000" {...register("phone")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Password" htmlFor="signup-password" error={errors.password?.message} required>
              <Input id="signup-password" type="password" autoComplete="new-password" {...register("password")} />
            </Field>
            <Field label="Confirm password" htmlFor="signup-confirm" error={errors.confirm?.message} required>
              <Input id="signup-confirm" type="password" autoComplete="new-password" {...register("confirm")} />
            </Field>
          </div>

          <Button type="submit" size="lg" className="w-full" loading={submitting || !experienceReady}>
            Create account <ArrowRight className="size-4" />
          </Button>
        </form>

        <p className="mt-5 max-w-md text-[12px] text-ink-3">
          Already have an account?{" "}
          <Link href="/login/member" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
            Sign in
          </Link>
          . Running a gym?{" "}
          <Link href="/signup" className="font-medium text-ink-2 underline decoration-line-3 underline-offset-4 hover:text-ink">
            Start a gym trial
          </Link>
          .
        </p>
        <p className="mt-3 max-w-md text-[11.5px] leading-relaxed text-ink-3">
          Frontend preview — the account lives in this browser session only. No email is sent and no password is stored.
        </p>
      </div>

      <aside className="order-1 h-fit rounded-lg border border-line bg-surface p-6 lg:order-2 lg:sticky lg:top-24">
        <p className="eyebrow">What you get</p>
        <ul className="mt-5 grid gap-5">
          <Benefit icon={<Search />} title="One account, every gym" body="Compare gyms on RIVET and book a free trial without filling the same form twice." />
          <Benefit icon={<QrCode />} title="A single entry identity" body="One QR at the desk, whichever RIVET gym you are walking into." />
          <Benefit icon={<Wallet />} title="Your money, on record" body="Renewal dates, balance, visits and receipts stay with you, not with a WhatsApp thread." />
        </ul>
        <div className="mt-6 border-t border-line pt-5">
          {["No card required", "No app to install", "Arabic or English"].map((item) => (
            <p key={item} className="flex items-center gap-2 py-1 text-[12.5px] text-ink-2">
              <Check className="size-3.5 text-success" /> {item}
            </p>
          ))}
        </div>
      </aside>
    </main>
  );
}

function Benefit({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2 [&_svg]:size-4">{icon}</span>
      <span>
        <strong className="block text-[13.5px] font-semibold">{title}</strong>
        <span className="mt-1 block text-[12.5px] leading-relaxed text-ink-3">{body}</span>
      </span>
    </li>
  );
}
