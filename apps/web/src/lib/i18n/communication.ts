/**
 * Which language an outgoing message is written in.
 *
 * A message follows its recipient: the language stored on the member,
 * consumer profile or lead it is addressed to, then the gym's chosen default,
 * then English. The person who triggered the send never enters into it; an
 * operator's interface language (users.uiLocale) is deliberately not an
 * input here, so switching the screen language cannot change what an
 * unrelated member receives.
 *
 * Pure: shared by Convex jobs, the preview adapter and tests.
 */
export type CommunicationLanguage = "en" | "ar";

/** Where the language came from, recorded beside queued deliveries. */
export type CommunicationLanguageSource = "recipient" | "organization" | "default";

export interface ResolvedCommunicationLanguage {
  language: CommunicationLanguage;
  source: CommunicationLanguageSource;
}

/** Only an exact stored "en" or "ar" counts as a choice; anything else is unset. */
export function communicationLanguageOf(value: unknown): CommunicationLanguage | undefined {
  return value === "ar" || value === "en" ? value : undefined;
}

export function resolveRecipientLanguage(recipientPreference: unknown, organizationDefault?: unknown): ResolvedCommunicationLanguage {
  const recipient = communicationLanguageOf(recipientPreference);
  if (recipient) return { language: recipient, source: "recipient" };
  const organization = communicationLanguageOf(organizationDefault);
  if (organization) return { language: organization, source: "organization" };
  return { language: "en", source: "default" };
}
