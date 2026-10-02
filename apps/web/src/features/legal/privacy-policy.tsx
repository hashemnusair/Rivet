"use client";
import { useT } from "@/lib/i18n/provider";
import type { TFunction } from "@/lib/i18n/core";
import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/legal-versions";
import { ContactBlock, LegalDocument, LegalList, LegalTable, type LegalSection } from "./legal-document";

const sectionsFor = (t: TFunction): LegalSection[] => [
  {
    id: "who-we-are",
    title: t("publicPrivacy.text001"),
    body: (
      <>
        <p>{t("publicPrivacy.text002")}</p>
        <p>{t("publicPrivacy.text003")}</p>
      </>
    ),
  },
  {
    id: "who-this-covers",
    title: t("publicPrivacy.text004"),
    body: (
      <>
        <p>{t("publicPrivacy.text005")}</p>
        <LegalList items={[
          <><strong>{t("publicPrivacy.text006")}</strong> {" "}{t("publicPrivacy.text007")}</>,
          <><strong>{t("publicPrivacy.text008")}</strong> {" "}{t("publicPrivacy.text009")}</>,
          <><strong>{t("publicPrivacy.text010")}</strong> {" "}{t("publicPrivacy.text011")}</>,
        ]} />
        <p>{t("publicPrivacy.text012")}</p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: t("publicPrivacy.text013"),
    body: (
      <>
        <h3 className="font-semibold text-ink">{t("publicPrivacy.text014")}</h3>
        <LegalList items={[
          t("publicPrivacy.text015"),
          t("publicPrivacy.text016"),
        ]} />
        <h3 className="font-semibold text-ink">{t("publicPrivacy.text017")}</h3>
        <LegalList items={[
          t("publicPrivacy.text018"),
          t("publicPrivacy.text019"),
          t("publicPrivacy.text020"),
          t("publicPrivacy.text021"),
        ]} />
        <h3 className="font-semibold text-ink">{t("publicPrivacy.text022")}</h3>
        <LegalList items={[
          t("publicPrivacy.text023"),
          t("publicPrivacy.text024"),
          t("publicPrivacy.text025"),
        ]} />
        <h3 className="font-semibold text-ink">{t("publicPrivacy.text026")}</h3>
        <LegalList items={[
          t("publicPrivacy.text027"),
          t("publicPrivacy.text028"),
          t("publicPrivacy.text029"),
          t("publicPrivacy.text030"),
        ]} />
      </>
    ),
  },
  {
    id: "why-we-use-it",
    title: t("publicPrivacy.text031"),
    body: (
      <LegalTable headers={[t("publicPrivacy.text032"), t("publicPrivacy.text033"), t("publicPrivacy.text034")]} rows={[
        [t("publicPrivacy.text035"), t("publicPrivacy.text036"), t("publicPrivacy.text037")],
        [t("publicPrivacy.text038"), t("publicPrivacy.text039"), t("publicPrivacy.text040")],
        [t("publicPrivacy.text041"), t("publicPrivacy.text042"), t("publicPrivacy.text043")],
        [t("publicPrivacy.text044"), t("publicPrivacy.text045"), t("publicPrivacy.text046")],
        [t("publicPrivacy.text047"), t("publicPrivacy.text048"), t("publicPrivacy.text049")],
        [t("publicPrivacy.text050"), t("publicPrivacy.text051"), t("publicPrivacy.text052")],
        [t("publicPrivacy.text053"), t("publicPrivacy.text054"), t("publicPrivacy.text055")],
        [t("publicPrivacy.text056"), t("publicPrivacy.text057"), t("publicPrivacy.text058")],
        [t("publicPrivacy.text059"), t("publicPrivacy.text060"), t("publicPrivacy.text061")],
        [t("publicPrivacy.text062"), t("publicPrivacy.text063"), t("publicPrivacy.text064")],
      ]} />
    ),
  },
  {
    id: "national-id",
    title: t("publicPrivacy.text065"),
    body: (
      <>
        <p>{t("publicPrivacy.text066")}</p>
        <p>{t("publicPrivacy.text067")}</p>
        <p>{t("publicPrivacy.text068")}</p>
      </>
    ),
  },
  {
    id: "messages",
    title: t("publicPrivacy.text069"),
    body: (
      <>
        <p>{t("publicPrivacy.text070")}</p>
        <p>{t("publicPrivacy.text071")}</p>
        <p>{t("publicPrivacy.text072")}</p>
        <p>{t("publicPrivacy.text073")}</p>
        <p>{t("publicPrivacy.text074")}</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: t("publicPrivacy.text075"),
    body: (
      <>
        <p>{t("publicPrivacy.text076")}</p>
        <LegalList items={[
          t("publicPrivacy.text077"),
          t("publicPrivacy.text078"),
          t("publicPrivacy.text079"),
          t("publicPrivacy.text080"),
        ]} />
        <p>{t("publicPrivacy.text081")}</p>
      </>
    ),
  },
  {
    id: "storage",
    title: t("publicPrivacy.text082"),
    body: (
      <>
        <p>{t("publicPrivacy.text083")}</p>
        <p>{t("publicPrivacy.text084")}</p>
      </>
    ),
  },
  {
    id: "retention",
    title: t("publicPrivacy.text085"),
    body: (
      <LegalTable headers={[t("publicPrivacy.text086"), t("publicPrivacy.text087")]} rows={[
        [t("publicPrivacy.text088"), t("publicPrivacy.text089")],
        [t("publicPrivacy.text090"), t("publicPrivacy.text091")],
        [t("publicPrivacy.text092"), t("publicPrivacy.text093")],
        [t("publicPrivacy.text094"), t("publicPrivacy.text095")],
        [t("publicPrivacy.text096"), t("publicPrivacy.text097")],
        [t("publicPrivacy.text098"), t("publicPrivacy.text099")],
        [t("publicPrivacy.text100"), t("publicPrivacy.text101")],
      ]} />
    ),
  },
  {
    id: "security",
    title: t("publicPrivacy.text102"),
    body: (
      <>
        <p>{t("publicPrivacy.text103")}</p>
        <p>{t("publicPrivacy.text104")}</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: t("publicPrivacy.text105"),
    body: (
      <>
        <p>{t("publicPrivacy.text106")}</p>
        <LegalList items={[
          t("publicPrivacy.text107"),
          t("publicPrivacy.text108"),
          t("publicPrivacy.text109"),
          t("publicPrivacy.text110"),
          t("publicPrivacy.text111"),
          t("publicPrivacy.text112"),
        ]} />
        <p>{t("publicPrivacy.text113")}</p>
        <p>{t("publicPrivacy.text114")}</p>
      </>
    ),
  },
  {
    id: "children",
    title: t("publicPrivacy.text115"),
    body: <p>{t("publicPrivacy.text116")}</p>,
  },
  {
    id: "cookies",
    title: t("publicPrivacy.text117"),
    body: (
      <>
        <p>{t("publicPrivacy.text118")}</p>
        <p>{t("publicPrivacy.text119")}</p>
      </>
    ),
  },
  {
    id: "changes",
    title: t("publicPrivacy.text120"),
    body: <p>{t("publicPrivacy.text121")}</p>,
  },
  {
    id: "contact",
    title: t("publicPrivacy.text122"),
    body: (
      <>
        <p>{t("publicPrivacy.text123")}</p>
        <ContactBlock />
      </>
    ),
  },
];

export function PrivacyPolicy() {
  const t = useT();
  return (
    <LegalDocument
      label={t("publicPrivacy.text124")}
      title={t("publicPrivacy.text124")}
      summary={t("publicPrivacy.text125")}
      version={PRIVACY_POLICY_VERSION}
      sections={sectionsFor(t)}
      documentId="privacy-policy"
      related={[{ label: t("publicPrivacy.text126"), href: "/terms" }]}
    />
  );
}

export function PrivacyPolicyLink({ className }: { className?: string }) {
  const t = useT();
  return <Link href="/privacy" className={className}>{t("publicPrivacy.text124")}</Link>;
}
