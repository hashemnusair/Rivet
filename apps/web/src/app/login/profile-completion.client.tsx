"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ReactNode } from "react";
import { LoginLoading } from "./login-chrome";

export const profileCompletionSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name").max(80, "Use 80 characters or fewer"),
  lastName: z.string().trim().min(1, "Enter your last name").max(80, "Use 80 characters or fewer"),
});

type ProfileCompletionValues = z.infer<typeof profileCompletionSchema>;

/** Prevents a newly created Clerk account from entering any portal unnamed. */
export function ProfileCompletionGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) return <LoginLoading />;
  if (!isSignedIn || !user) return null;
  if (user.firstName?.trim() && user.lastName?.trim()) return children;

  return <ProfileCompletionForm />;
}

function ProfileCompletionForm() {
  const { user } = useUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ProfileCompletionValues>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    if (!user) return;
    try {
      await user.update({ firstName: values.firstName, lastName: values.lastName });
      toast.success("Your profile is ready.");
    } catch (error) {
      // Surface Clerk's own reason so a stuck sign-in is diagnosable instead
      // of a dead end behind a generic message.
      const clerkMessage = (error as { errors?: Array<{ longMessage?: string; message?: string }> })?.errors?.[0];
      setError("root", { message: clerkMessage?.longMessage ?? clerkMessage?.message ?? (error instanceof Error ? error.message : "We could not save your name. Please try again.") });
    }
  });

  return (
    <div className="mt-7">
      <div className="rounded-lg border border-line-2 bg-surface p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <UserRound className="size-4 text-signal" /> Finish setting up your profile
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          You are signed in{user?.primaryEmailAddress ? <> as <span className="font-medium">{user.primaryEmailAddress.emailAddress}</span></> : null}, but this account has no name yet. Enter the name your gym team or membership should display — you only do this once.
        </p>

        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label="First name" htmlFor="profile-first-name" error={errors.firstName?.message} required>
            <Input
              id="profile-first-name"
              autoComplete="given-name"
              autoFocus
              aria-invalid={Boolean(errors.firstName)}
              {...register("firstName")}
            />
          </Field>
          <Field label="Last name" htmlFor="profile-last-name" error={errors.lastName?.message} required>
            <Input
              id="profile-last-name"
              autoComplete="family-name"
              aria-invalid={Boolean(errors.lastName)}
              {...register("lastName")}
            />
          </Field>
          {errors.root?.message ? (
            <p className="text-[12px] text-danger sm:col-span-2" role="alert">
              {errors.root.message}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="sm:col-span-2" loading={isSubmitting}>
            Save and continue <ArrowRight className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
