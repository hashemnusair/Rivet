import { TERMS_OF_SERVICE_VERSION } from "@/lib/legal/legal-versions";
import { ContactBlock, LegalDocument, LegalList, LegalTable, type LegalSection } from "./legal-document";

const SECTIONS: LegalSection[] = [
  {
    id: "the-agreement",
    title: "The agreement",
    body: (
      <>
        <p>These terms are a contract between RIVET, Amman, Jordan (“RIVET”, “we”, “us”) and you. If you use the website, they apply to that use. If you subscribe to the RIVET platform on behalf of a gym, they apply to the gym and to everyone the gym lets use its account, together with the subscription agreement the gym signs and the privacy policy.</p>
        <p>If the subscription agreement and these terms conflict, the subscription agreement wins for the plan, fees, dates and anything else it sets out expressly; these terms win for everything else.</p>
      </>
    ),
  },
  {
    id: "definitions",
    title: "Definitions",
    body: (
      <LegalTable headers={["Term", "Meaning"]} rows={[
        ["Platform", "The RIVET software service for running a gym, including its web and mobile applications, reminders and reports."],
        ["Customer", "The gym, company or sole trader that signs a subscription agreement."],
        ["Users", "The owners, managers and staff the Customer authorises to use its account."],
        ["Members", "The people whose details the Customer keeps in the Platform: members, trial visitors and leads."],
        ["Customer Data", "Everything the Customer and its Users put into the Platform, including Member records."],
        ["Plan", "The service level the Customer subscribes to: Starter, Growth or Pro, as described on the website and confirmed in the subscription agreement."],
        ["Fees", "The amounts payable for the Plan, in Jordanian dinars, as set out in the subscription agreement or RIVET’s written quote."],
      ]} />
    ),
  },
  {
    id: "website",
    title: "Using the website",
    body: <p>You may use this website to learn about RIVET and to contact us. You may not copy its content for commercial use, attempt to interfere with it, or use automated tools to extract data from it. Content on the website describes the Platform in general terms; the features included in a Plan are those confirmed in writing in the subscription agreement.</p>,
  },
  {
    id: "accounts",
    title: "Accounts and eligibility",
    body: (
      <>
        <p>The Platform is for businesses. To subscribe, the Customer must be a legally registered business or sole trader in a country where we offer the service, and the person signing must be authorised to bind it. We may ask for proof of registration and identity before activating an account.</p>
        <p>The Customer creates and manages its Users, assigns roles, and is responsible for everything done under its account, including by Users who have since left. Credentials must not be shared. The Customer must tell us at once if it suspects unauthorised access.</p>
      </>
    ),
  },
  {
    id: "fees",
    title: "Plans, fees and payment",
    body: (
      <>
        <p>Fees are quoted and invoiced in Jordanian dinars. Sales tax and any other applicable taxes are added at the rate in force.</p>
        <p>Fees are billed in advance, monthly or yearly as chosen in the subscription agreement, from the contract start date. Onboarding is included; hardware such as computers, card readers and printers is not.</p>
        <p>Invoices are payable within 14 days by bank transfer, CliQ, card or another method we agree in writing. If an invoice is more than 14 days overdue we may suspend access after giving 7 days’ written notice, and restore it once payment is received. Suspension does not shorten the term or reduce the Fees.</p>
        <p>Limits attached to a Plan, such as the number of branches or staff accounts, are those stated in the subscription agreement. If usage exceeds them, we will offer the appropriate Plan; the higher Fees apply from the next billing period after the Customer agrees or continues to exceed the limits.</p>
        <p>Message costs for WhatsApp and SMS reminders are included or passed through as stated in the subscription agreement.</p>
        <p>We may change Fees for a renewal term by giving at least 60 days’ written notice before the current term ends. Fees do not change during a term.</p>
      </>
    ),
  },
  {
    id: "term",
    title: "Term, renewal and cancellation",
    body: (
      <>
        <p>The subscription starts on the contract start date in the subscription agreement and runs for the initial term stated there, which is twelve months unless the agreement says otherwise.</p>
        <p>It renews automatically for further terms of the same length unless either party gives written notice at least 30 days before the end of the current term.</p>
        <p>The Customer may end the subscription early by written notice. Fees for the remainder of the current term remain payable, unless the Customer ends it because RIVET is in material breach and has not fixed the breach within 30 days of written notice.</p>
        <p>On termination, the Customer can export its data for 30 days, after which we delete it as described in the privacy policy.</p>
      </>
    ),
  },
  {
    id: "customer-responsibilities",
    title: "Customer responsibilities",
    body: (
      <>
        <p>The Customer is responsible for:</p>
        <LegalList items={[
          "the accuracy of the details it gives us and of Customer Data;",
          "using the Platform lawfully, including under the Personal Data Protection Law No. 24 of 2023 as the controller of its Members’ data;",
          "having a lawful basis, and consent where required, for the messages it sends Members through the Platform, and honouring opt-outs;",
          "obtaining a parent’s or guardian’s consent before recording a Member under 18;",
          "the acts and omissions of its Users;",
          "its own equipment, internet connection and the security of its devices.",
        ]} />
      </>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <>
        <p>The Platform may not be used to:</p>
        <LegalList items={[
          "send unsolicited, misleading or unlawful messages;",
          "store data the Customer has no right to hold;",
          "access another customer’s data, probe or overload our systems, or bypass security or usage limits;",
          "copy, reverse engineer or resell the Platform, or build a competing product from it;",
          "let anyone other than authorised Users use the account.",
        ]} />
      </>
    ),
  },
  {
    id: "data-processing",
    title: "Data and the processing addendum",
    body: (
      <>
        <p>Customer Data belongs to the Customer. We use it only to provide the Platform, support the Customer, keep the service secure, and meet legal obligations. This section is the data processing addendum between the Customer, as controller of Member data, and RIVET, as processor.</p>
        <LegalList items={[
          "We process Member data only on the Customer’s documented instructions, which include the settings the Customer chooses in the Platform, and this agreement.",
          "Everyone at RIVET with access to Customer Data is bound by confidentiality.",
          "We apply the security measures described in the privacy policy: encryption in transit and at rest, role-based access, audit logging, backups and incident response.",
          "We use sub-processors for hosting, identity, messaging, email and payments. A current list is available on request. We tell customers before adding a sub-processor that will handle Member data, and the Customer may object on reasonable grounds.",
          "We help the Customer respond to Members exercising their rights, and to its own security and compliance obligations, to the extent we reasonably can.",
          "We notify the Customer of a personal data breach affecting its data without undue delay after becoming aware of it, with the information we have at the time.",
          "At the end of the subscription we return Customer Data on request and delete it as set out in the privacy policy, unless the law requires us to keep it.",
          "Once a year, on reasonable notice, the Customer may ask for information showing how we meet these obligations.",
          "We may use aggregated, anonymised statistics derived from use of the Platform to improve it, provided no Customer or person can be identified.",
        ]} />
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and support",
    body: (
      <>
        <p>We aim to keep the Platform available at least 99.5% of the time in any calendar month, excluding planned maintenance, which we announce at least 48 hours ahead and schedule outside gym peak hours where we can. The Platform depends on third-party networks, including WhatsApp and mobile carriers, whose availability we do not control.</p>
        <p>Support is available on WhatsApp and by phone during the hours published on the website, currently 09:00 to 21:00 Amman time, Saturday to Thursday. Issues that stop a gym’s front desk from working are treated first.</p>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual property",
    body: <p>RIVET owns the Platform, the website, its design, code and content, and the RIVET name and mark. The Customer receives a non-exclusive, non-transferable right to use the Platform for its own gyms during the subscription. Feedback the Customer gives us may be used to improve the Platform without obligation.</p>,
  },
  {
    id: "confidentiality",
    title: "Confidentiality",
    body: <p>Each party keeps the other’s non-public business information confidential and uses it only for this agreement, during the subscription and for three years after it ends. This does not apply to information that is public, already known, independently developed, or that must be disclosed by law, in which case the disclosing party gives notice where it can.</p>,
  },
  {
    id: "warranties",
    title: "Warranties",
    body: (
      <>
        <p>We warrant that the Platform will perform materially as described in the subscription agreement and that we will provide it with reasonable skill and care. If it does not, the Customer’s remedy is for us to fix the problem within a reasonable time, and if we cannot, to end the subscription and refund Fees paid for the period after the failure.</p>
        <p>Otherwise the Platform is provided as is. We do not promise that it will be uninterrupted or error-free, or that it will produce any particular business result. Nothing in these terms limits rights that cannot be limited by law.</p>
      </>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: (
      <>
        <p>Neither party is liable to the other for lost profits, lost revenue, lost data caused by the other party’s failure to keep backups it was responsible for, or indirect or consequential loss. RIVET’s total liability under this agreement in any twelve-month period is limited to the Fees the Customer paid for that period. These limits do not apply to death or personal injury caused by negligence, fraud, a party’s breach of confidentiality, or anything the law does not allow to be limited.</p>
        <p>The Customer will compensate RIVET for claims by third parties, including Members and authorities, arising from Customer Data or from the Customer’s use of the Platform in breach of the law or these terms.</p>
      </>
    ),
  },
  {
    id: "suspension",
    title: "Suspension and termination",
    body: <p>We may suspend access, after notice where practical, if the account is used in breach of section 08, if Fees are overdue as described in section 05, or if suspension is needed to protect the Platform or other customers. Either party may end the agreement immediately by written notice if the other commits a material breach and fails to fix it within 30 days of being told, or becomes insolvent.</p>,
  },
  {
    id: "changes",
    title: "Changes",
    body: <p>We improve the Platform continuously and may add, change or retire features, provided the Platform continues to do materially what the subscription agreement describes. We may update these terms; the current version is always on this page with its date. Changes that reduce the Customer’s rights take effect at the start of the next renewal term, and we give notice at least 30 days before then.</p>,
  },
  {
    id: "governing-law",
    title: "Governing law and disputes",
    body: (
      <>
        <p>This agreement is governed by the laws of the Hashemite Kingdom of Jordan. If a dispute arises, the parties will first try to resolve it in good faith between senior representatives within 30 days of written notice. Failing that, the courts of Amman have exclusive jurisdiction.</p>
        <p>The parties agree that the subscription agreement may be signed electronically and that an electronic signature captured through RIVET’s signing page, with its record of the signatory, time, and the fingerprint of the document signed, has the same effect as a handwritten signature, as provided by the Electronic Transactions Law No. 15 of 2015.</p>
      </>
    ),
  },
  {
    id: "general",
    title: "General",
    body: (
      <LegalList items={[
        "Notices are given in writing by email or WhatsApp to the contacts in the subscription agreement, or to RIVET at the details in section 19.",
        "Neither party may transfer this agreement without the other’s consent, except that RIVET may transfer it to a successor that takes over its business, with notice.",
        "Neither party is liable for delay caused by events outside its reasonable control, other than payment obligations.",
        "If a provision is unenforceable, the rest of the agreement continues.",
        "These terms, the subscription agreement and the privacy policy are the entire agreement between the parties on this subject.",
        "These terms are written in English. If a translation is provided and there is a conflict, the English version applies unless the law requires otherwise.",
      ]} />
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: <ContactBlock />,
  },
];

export function TermsOfService() {
  return (
    <LegalDocument
      title="Terms of service"
      summary="The terms on which RIVET provides this website and the RIVET platform. Gyms that subscribe also sign a subscription agreement, which sets the plan, fees and dates and incorporates these terms and the data processing addendum in section 09."
      version={TERMS_OF_SERVICE_VERSION}
      sections={SECTIONS}
      related={[{ label: "Privacy policy", href: "/privacy" }]}
    />
  );
}
