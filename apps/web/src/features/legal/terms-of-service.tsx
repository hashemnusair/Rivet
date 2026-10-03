"use client";
import { useT } from "@/lib/i18n/provider";
import type { TFunction } from "@/lib/i18n/core";
import { TERMS_OF_SERVICE_VERSION } from "@/lib/legal/legal-versions";
import { ContactBlock, LegalDocument, LegalList, LegalTable, type LegalSection } from "./legal-document";

const sectionsFor = (t: TFunction): LegalSection[] => [
  {
    id: "the-agreement",
    title: t("publicTerms.text001"),
    body: (
      <>
        <p>{t("publicTerms.text002")}</p>
        <p>{t("publicTerms.text003")}</p>
      </>
    ),
  },
  {
    id: "definitions",
    title: t("publicTerms.text004"),
    body: (
      <LegalTable headers={[t("publicTerms.text005"), t("publicTerms.text006")]} rows={[
        [t("publicTerms.text007"), t("publicTerms.text008")],
        [t("publicTerms.text009"), t("publicTerms.text010")],
        [t("publicTerms.text011"), t("publicTerms.text012")],
        [t("publicTerms.text013"), t("publicTerms.text014")],
        [t("publicTerms.text015"), t("publicTerms.text016")],
        [t("publicTerms.text017"), t("publicTerms.text018")],
        [t("publicTerms.text019"), t("publicTerms.text020")],
      ]} />
    ),
  },
  {
    id: "website",
    title: t("publicTerms.text021"),
    body: <p>{t("publicTerms.text022")}</p>,
  },
  {
    id: "accounts",
    title: t("publicTerms.text023"),
    body: (
      <>
        <p>{t("publicTerms.text024")}</p>
        <p>{t("publicTerms.text025")}</p>
      </>
    ),
  },
  {
    id: "fees",
    title: t("publicTerms.text026"),
    body: (
      <>
        <p>{t("publicTerms.text027")}</p>
        <p>{t("publicTerms.text028")}</p>
        <p>{t("publicTerms.text029")}</p>
        <p>{t("publicTerms.text030")}</p>
        <p>{t("publicTerms.text031")}</p>
        <p>{t("publicTerms.text032")}</p>
      </>
    ),
  },
  {
    id: "term",
    title: t("publicTerms.text033"),
    body: (
      <>
        <p>{t("publicTerms.text034")}</p>
        <p>{t("publicTerms.text035")}</p>
        <p>{t("publicTerms.text036")}</p>
        <p>{t("publicTerms.text037")}</p>
      </>
    ),
  },
  {
    id: "customer-responsibilities",
    title: t("publicTerms.text038"),
    body: (
      <>
        <p>{t("publicTerms.text039")}</p>
        <LegalList items={[
          t("publicTerms.text040"),
          t("publicTerms.text041"),
          t("publicTerms.text042"),
          t("publicTerms.text043"),
          t("publicTerms.text044"),
          t("publicTerms.text045"),
        ]} />
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: t("publicTerms.text046"),
    body: (
      <>
        <p>{t("publicTerms.text047")}</p>
        <LegalList items={[
          t("publicTerms.text048"),
          t("publicTerms.text049"),
          t("publicTerms.text050"),
          t("publicTerms.text051"),
          t("publicTerms.text052"),
        ]} />
      </>
    ),
  },
  {
    id: "data-processing",
    title: t("publicTerms.text053"),
    body: (
      <>
        <p>{t("publicTerms.text054")}</p>
        <LegalList items={[
          t("publicTerms.text055"),
          t("publicTerms.text056"),
          t("publicTerms.text057"),
          t("publicTerms.text058"),
          t("publicTerms.text059"),
          t("publicTerms.text060"),
          t("publicTerms.text061"),
          t("publicTerms.text062"),
          t("publicTerms.text063"),
        ]} />
      </>
    ),
  },
  {
    id: "availability",
    title: t("publicTerms.text064"),
    body: (
      <>
        <p>{t("publicTerms.text065")}</p>
        <p>{t("publicTerms.text066")}</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: t("publicTerms.text067"),
    body: <p>{t("publicTerms.text068")}</p>,
  },
  {
    id: "confidentiality",
    title: t("publicTerms.text069"),
    body: <p>{t("publicTerms.text070")}</p>,
  },
  {
    id: "warranties",
    title: t("publicTerms.text071"),
    body: (
      <>
        <p>{t("publicTerms.text072")}</p>
        <p>{t("publicTerms.text073")}</p>
      </>
    ),
  },
  {
    id: "liability",
    title: t("publicTerms.text074"),
    body: (
      <>
        <p>{t("publicTerms.text075")}</p>
        <p>{t("publicTerms.text076")}</p>
      </>
    ),
  },
  {
    id: "suspension",
    title: t("publicTerms.text077"),
    body: <p>{t("publicTerms.text078")}</p>,
  },
  {
    id: "changes",
    title: t("publicTerms.text079"),
    body: <p>{t("publicTerms.text080")}</p>,
  },
  {
    id: "governing-law",
    title: t("publicTerms.text081"),
    body: (
      <>
        <p>{t("publicTerms.text082")}</p>
        <p>{t("publicTerms.text083")}</p>
      </>
    ),
  },
  {
    id: "general",
    title: t("publicTerms.text084"),
    body: (
      <LegalList items={[
        t("publicTerms.text085"),
        t("publicTerms.text086"),
        t("publicTerms.text087"),
        t("publicTerms.text088"),
        t("publicTerms.text089"),
        t("publicTerms.text090"),
      ]} />
    ),
  },
  {
    id: "contact",
    title: t("publicTerms.text091"),
    body: <ContactBlock />,
  },
];

export function TermsOfService() {
  const t = useT();
  return (
    <LegalDocument
      label={t("publicTerms.text092")}
      title={t("publicTerms.text092")}
      summary={t("publicTerms.text093")}
      version={TERMS_OF_SERVICE_VERSION}
      sections={sectionsFor(t)}
      documentId="terms-of-service"
      related={[{ label: t("publicTerms.text094"), href: "/privacy" }]}
    />
  );
}
