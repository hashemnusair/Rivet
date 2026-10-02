"use client";

import { authMessage, authErrorText, renderAuthMessage } from "@/lib/auth/messages";
import type { MessageDescriptor } from "@/lib/i18n/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useUser } from "@clerk/nextjs";
import { ArrowRight, UserRound } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useState, type ReactNode } from "react";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import { englishT } from "./english-t";
import { LoginLoading } from "./login-chrome";

/** Field messages come from the reader's language; the exported default is English. */
export function createProfileCompletionSchema(t: TFunction) {
  return z.object({
    firstName: z.string().trim().min(1, t("auth.validation.firstName")).max(80, t("auth.validation.max80")),
    lastName: z.string().trim().min(1, t("auth.validation.lastName")).max(80, t("auth.validation.max80")),
  });
}

export const profileCompletionSchema = createProfileCompletionSchema(englishT);

type ProfileCompletionValues = z.infer<typeof profileCompletionSchema>;

/** Stands in for the email while the sentence is translated, so the email can be set in bold. */
const EMAIL_SLOT = "\uE000";

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
  const { t } = useLocale();
  const [beforeEmail = "", afterEmail = ""] = t("auth.profile.introWithEmail", { email: EMAIL_SLOT }).split(EMAIL_SLOT);
  const schema = profileCompletionSchema;
  const [serverError, setServerError] = useState<MessageDescriptor>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileCompletionValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user?.firstName ?? "",
      lastName: user?.lastName ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    if (!user) return;
    setServerError(undefined);
    try {
      await user.update({ firstName: values.firstName, lastName: values.lastName });
      toast.success(t("auth.profile.ready"));
    } catch (error) {
      setServerError(authMessage(error, "auth.profile.saveFailed"));
    }
  });

  return (
    <div className="mt-7">
      <div className="rounded-lg border border-line-2 bg-surface p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <UserRound className="size-4 text-signal" /> {t("auth.profile.title")}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          {user?.primaryEmailAddress ? (
            <>
              {beforeEmail}
              <span className="font-medium"><bdi>{user.primaryEmailAddress.emailAddress}</bdi></span>
              {afterEmail}
            </>
          ) : t("auth.profile.intro")}
        </p>

        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <Field label={t("auth.profile.firstName")} htmlFor="profile-first-name" error={errors.firstName ? authErrorText({ message: errors.firstName.message }, "auth.validation.firstName", t) : undefined} required>
            <Input
              id="profile-first-name"
              autoComplete="given-name"
              dir="auto"
              autoFocus
              aria-invalid={Boolean(errors.firstName)}
              {...register("firstName")}
            />
          </Field>
          <Field label={t("auth.profile.lastName")} htmlFor="profile-last-name" error={errors.lastName ? authErrorText({ message: errors.lastName.message }, "auth.validation.lastName", t) : undefined} required>
            <Input
              id="profile-last-name"
              autoComplete="family-name"
              dir="auto"
              aria-invalid={Boolean(errors.lastName)}
              {...register("lastName")}
            />
          </Field>
          {serverError ? (
            <p className="text-[12px] text-danger sm:col-span-2" role="alert">
              {renderAuthMessage(serverError, t)}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="sm:col-span-2" loading={isSubmitting}>
            {t("auth.profile.submit")} <ArrowRight className="size-4 rtl:rotate-180" />
          </Button>
        </form>
      </div>
    </div>
  );
}
