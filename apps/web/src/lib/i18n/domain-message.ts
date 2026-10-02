import { createTranslator } from "./core";
import { defaultErrorDescriptor, legacyErrorDescriptor, parseErrorDescriptor, type ErrorMessageDescriptor } from "./error-messages";
import { localizeErrorParameters } from "./error-parameters";
import type { Locale } from "./locale";

export function renderDomainMessage(source: string, locale: Locale, descriptor?: ErrorMessageDescriptor): string {
  if (locale === "en") return source;
  const message = parseErrorDescriptor(descriptor) ?? legacyErrorDescriptor(source) ?? defaultErrorDescriptor("VALIDATION_ERROR");
  return createTranslator(locale)(message.key, localizeErrorParameters(message.params, locale));
}
