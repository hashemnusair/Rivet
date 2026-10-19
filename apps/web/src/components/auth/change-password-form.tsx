"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { Check, Info } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/switch";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { renderAuthMessage } from "@/lib/auth/messages";
import {
  passwordChangeFailure,
  passwordChangeRequest,
  validatePasswordChange,
  type PasswordChangeField,
  type PasswordChangeRequest,
  type PasswordChangeValues,
} from "@/lib/auth/password-change";
import type { MessageDescriptor } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/provider";
import { CONVEX_ENABLED } from "@/lib/providers/convex-client-provider";

/** The account menus link to `#password` on the page that holds this form. */
export const PASSWORD_ANCHOR = "password";

const EMPTY: PasswordChangeValues = { current: "", next: "", confirm: "" };
const FIELD_ORDER: readonly PasswordChangeField[] = ["current", "next", "confirm"];
/** Touch-sized on phones, like the member profile's other fields. */
const INPUT_CLASS = "h-11 sm:h-9";

/**
 * The signed-in person's own password, for staff, members and RIVET
 * administrators alike. Clerk holds the password; RIVET never stores or sees
 * it beyond this form.
 *
 * This sits on a page rather than in a dialog on purpose: Clerk may ask the
 * person to confirm who they are before it accepts the change, in its own
 * modal, and a dialog's focus trap would stop them from typing into it.
 *
 * The demo has no Clerk account and so no password to change; it says so
 * instead of collecting one, like the demo sign-up page. "Demo" is the same
 * test as the topbar's preview controls: a real account needs both Clerk and
 * Convex, and a keyless build (CI) never loads Clerk at all.
 */
export function ChangePasswordForm({ idPrefix = "change-password" }: { idPrefix?: string }) {
  if (DEMO_AUTH_BYPASS || !CONVEX_ENABLED) return <PreviewPasswordNotice />;
  return <ClerkChangePasswordForm idPrefix={idPrefix} />;
}

/**
 * Scrolls the password section into view when the page opened at
 * `#password`. The section can mount after the page's own data loads, which
 * is too late for the browser's and the router's own hash scrolling.
 */
export function usePasswordAnchor<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (window.location.hash === `#${PASSWORD_ANCHOR}`) ref.current?.scrollIntoView({ block: "start" });
  }, []);
  return ref;
}

function ClerkChangePasswordForm({ idPrefix }: { idPrefix: string }) {
  const t = useT();
  const { isLoaded, user } = useUser();
  // An older sign-in makes Clerk ask for the password, a code or a second
  // factor again before the change; the hook shows that step and retries.
  const updatePassword = useReverification((request: PasswordChangeRequest) =>
    user ? user.updatePassword(request) : Promise.reject(new Error("signed_out")));

  if (!isLoaded) {
    return (
      <div role="status" aria-label={t("auth.changePassword.loading")} className="grid max-w-md gap-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (!user) return <p className="text-[13px] text-ink-2">{t("auth.changePassword.signedOut")}</p>;
  return (
    <PasswordChangeFields
      idPrefix={idPrefix}
      hasPassword={user.passwordEnabled}
      username={user.primaryEmailAddress?.emailAddress}
      onSubmit={updatePassword}
    />
  );
}

/** The form itself, separate from Clerk so it can be tested on its own. */
export function PasswordChangeFields({
  idPrefix,
  hasPassword,
  username,
  onSubmit,
}: {
  idPrefix: string;
  hasPassword: boolean;
  /** Lets a password manager file the new password under the right account. */
  username?: string;
  onSubmit: (request: PasswordChangeRequest) => Promise<unknown>;
}) {
  const t = useT();
  const [values, setValues] = useState<PasswordChangeValues>(EMPTY);
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [errors, setErrors] = useState<Partial<Record<PasswordChangeField, MessageDescriptor>>>({});
  const [formError, setFormError] = useState<MessageDescriptor>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"saved" | "savedSignedOut">();
  const fieldInputs = useRef<Partial<Record<PasswordChangeField, HTMLInputElement | null>>>({});
  const [focusField, setFocusField] = useState<PasswordChangeField>();

  // Focus after the error renders, so a screen reader reads the field with it.
  useEffect(() => {
    if (!focusField) return;
    fieldInputs.current[focusField]?.focus();
    setFocusField(undefined);
  }, [focusField]);

  const update = (field: PasswordChangeField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
    setFormError(undefined);
    setSaved(undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setFormError(undefined);
    setSaved(undefined);
    const invalid = validatePasswordChange(values, { hasPassword });
    const fieldErrors = Object.fromEntries(Object.entries(invalid).map(([field, key]) => [field, { key }])) as Partial<Record<PasswordChangeField, MessageDescriptor>>;
    setErrors(fieldErrors);
    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    if (firstInvalid) {
      setFocusField(firstInvalid);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(passwordChangeRequest(values, { hasPassword, signOutOfOtherSessions: signOutOthers }));
      setValues(EMPTY);
      setSaved(signOutOthers ? "savedSignedOut" : "saved");
    } catch (error) {
      const failure = passwordChangeFailure(error);
      if (failure.kind === "cancelled") setFormError({ key: "auth.changePassword.errors.cancelled" });
      else if (failure.kind === "form") setFormError(failure.message);
      else {
        setErrors({ [failure.field]: failure.message });
        setFocusField(failure.field);
      }
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (field: PasswordChangeField) => (errors[field] ? renderAuthMessage(errors[field], t) : undefined);
  const describedBy = (field: PasswordChangeField, hint = false) =>
    errors[field] ? `${idPrefix}-${field}-error` : hint ? `${idPrefix}-${field}-hint` : undefined;

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="max-w-md space-y-4" data-testid="change-password-form">
      {username ? <input type="email" name="username" autoComplete="username" value={username} readOnly hidden /> : null}
      {hasPassword ? null : <p className="text-[13px] leading-relaxed text-ink-2">{t("auth.changePassword.noPasswordYet")}</p>}
      {hasPassword ? (
        <Field label={t("auth.changePassword.currentLabel")} htmlFor={`${idPrefix}-current`} error={fieldError("current")}>
          <PasswordInput
            id={`${idPrefix}-current`}
            ref={(element) => { fieldInputs.current.current = element; }}
            name="current-password"
            autoComplete="current-password"
            value={values.current}
            onChange={(event) => update("current", event.target.value)}
            className={INPUT_CLASS}
            required
            aria-invalid={errors.current ? true : undefined}
            aria-describedby={describedBy("current")}
          />
        </Field>
      ) : null}
      <Field label={t("auth.changePassword.newLabel")} htmlFor={`${idPrefix}-next`} hint={t("auth.changePassword.newHint")} error={fieldError("next")}>
        <PasswordInput
          id={`${idPrefix}-next`}
          ref={(element) => { fieldInputs.current.next = element; }}
          name="new-password"
          autoComplete="new-password"
          value={values.next}
          onChange={(event) => update("next", event.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={describedBy("next", true)}
        />
      </Field>
      <Field label={t("auth.changePassword.confirmLabel")} htmlFor={`${idPrefix}-confirm`} error={fieldError("confirm")}>
        <PasswordInput
          id={`${idPrefix}-confirm`}
          ref={(element) => { fieldInputs.current.confirm = element; }}
          name="confirm-password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(event) => update("confirm", event.target.value)}
          className={INPUT_CLASS}
          required
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={describedBy("confirm")}
        />
      </Field>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id={`${idPrefix}-sign-out-others`}
          checked={signOutOthers}
          onCheckedChange={(checked) => { setSignOutOthers(checked === true); setSaved(undefined); }}
          aria-describedby={`${idPrefix}-sign-out-others-hint`}
          className="mt-0.5"
        />
        <div className="min-w-0">
          <label htmlFor={`${idPrefix}-sign-out-others`} className="cursor-pointer text-[13px] font-medium text-ink">{t("auth.changePassword.signOutOthers")}</label>
          <p id={`${idPrefix}-sign-out-others-hint`} className="mt-0.5 text-[12px] text-ink-3">{t("auth.changePassword.signOutOthersHint")}</p>
        </div>
      </div>
      {formError ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-2.5 text-[13px] text-danger">{renderAuthMessage(formError, t)}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={saving} className="w-full sm:w-auto">
          {hasPassword ? t("auth.changePassword.submit") : t("auth.changePassword.submitFirst")}
        </Button>
        {saved ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-[13px] text-success-deep">
            <Check className="size-4 shrink-0" aria-hidden /> {t(`auth.changePassword.${saved}`)}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function PreviewPasswordNotice() {
  const t = useT();
  return (
    <div className="flex max-w-md items-start gap-3 rounded-lg border border-line-2 bg-sunken px-4 py-3.5" data-testid="change-password-preview">
      <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink">{t("auth.changePassword.preview.title")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t("auth.changePassword.preview.body")}</p>
      </div>
    </div>
  );
}
