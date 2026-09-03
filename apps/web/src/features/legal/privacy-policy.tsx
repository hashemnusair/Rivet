import Link from "next/link";
import { PRIVACY_POLICY_VERSION } from "@/lib/legal/legal-versions";
import { ContactBlock, LegalDocument, LegalList, LegalTable, type LegalSection } from "./legal-document";

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>RIVET is a revenue and operations platform for gyms, based in Amman, Jordan. In this policy, “RIVET”, “we” and “us” mean RIVET, Amman, Jordan, the operator of this website and the RIVET platform. “You” means the person reading this, whether you visit the website, run or work at a gym that uses RIVET, or are a member of such a gym.</p>
        <p>We are the data controller for the website and for the accounts of gyms that use RIVET. For the member records that gyms keep in RIVET, the gym is the controller and RIVET is a processor acting on the gym’s instructions.</p>
      </>
    ),
  },
  {
    id: "who-this-covers",
    title: "Who this policy covers",
    body: (
      <>
        <p>Three groups of people, with different relationships to RIVET.</p>
        <LegalList items={[
          <><strong>Visitors:</strong> anyone who uses this website, including people who ask for a walkthrough or send a gym application.</>,
          <><strong>Customers:</strong> gyms that subscribe to RIVET, and the owners, managers and staff who use it. This includes the people who sign the subscription agreement on a gym’s behalf.</>,
          <><strong>Members:</strong> people whose details a gym keeps in RIVET: its members, trial visitors and leads.</>,
        ]} />
        <p>If you are a member, your gym decides what it collects about you and why. Questions about that go to the gym first. We help gyms answer them, and we never use member data for our own marketing.</p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <h3 className="font-semibold text-ink">On the website</h3>
        <LegalList items={[
          "What you enter in the gym application form: gym name, your name, phone or WhatsApp number, email, and the plan you are interested in.",
          "Server logs: IP address, browser type, pages requested and timestamps, kept for security and to keep the site running.",
        ]} />
        <h3 className="font-semibold text-ink">When a gym joins RIVET</h3>
        <LegalList items={[
          "The gym’s legal details: registered name, trade name, commercial registration number, address, city and number of branches.",
          "The signatory’s details: full name, role, national ID or passport number, phone number and email address.",
          "The signature itself, as an image, with the date and time of signing, the device used, and the version and cryptographic fingerprint of the agreement that was signed. Together these form the evidence that the agreement was signed and by whom.",
          "Billing details: invoices, payment records and the bank or card details you choose to pay with, which are handled by our payment partners rather than stored by us.",
        ]} />
        <h3 className="font-semibold text-ink">On the platform, about customers and their staff</h3>
        <LegalList items={[
          "Account details for each staff user: name, role, phone number, email address and login records.",
          "The audit trail: what each user did in RIVET and when. This is a core part of the product and cannot be switched off.",
          "Support conversations on WhatsApp, phone or email.",
        ]} />
        <h3 className="font-semibold text-ink">On the platform, about members, on behalf of gyms</h3>
        <LegalList items={[
          "Identity and contact details the gym records: name, phone number, email, date of birth, gender, national ID or membership number, emergency contact and, if the gym uses it, a check-in photo.",
          "Membership and payment records: plans, start and end dates, freezes, invoices, payments and balances.",
          "Attendance: check-ins, class bookings and visit history.",
          "Messages the gym sends through RIVET, their delivery status and any opt-out requests.",
        ]} />
      </>
    ),
  },
  {
    id: "why-we-use-it",
    title: "Why we use it, and on what basis",
    body: (
      <LegalTable headers={["Purpose", "Data", "Basis"]} rows={[
        ["Answering a gym application or walkthrough request", "Application form", "Your request, and our legitimate interest in responding to it"],
        ["Entering into and performing the subscription agreement", "Gym details, signatory details, signature evidence, billing", "Performance of a contract; legal obligations for commercial records"],
        ["Confirming who signed on the gym’s behalf and preventing impersonation", "Signatory name and ID or passport number", "Legitimate interest in the validity of the contract; legal obligations"],
        ["Running the platform for a gym", "Staff accounts, member records, audit trail", "Performance of the contract with the gym; for member data, the gym’s instructions"],
        ["Sending reminders and notices to members for a gym", "Member name, phone number, membership details", "The gym’s instructions; the gym is responsible for having a lawful basis and any required consent"],
        ["Support", "Support conversations, account details", "Performance of the contract"],
        ["Security, fraud prevention and keeping records of who did what", "Logs, audit trail", "Legitimate interest; legal obligations"],
        ["Invoicing and tax", "Billing records", "Legal obligation"],
        ["Telling customers about RIVET updates and offers", "Customer contact details", "Consent, which you can withdraw at any time"],
        ["Improving the product", "Usage statistics, aggregated so that no person can be identified", "Legitimate interest"],
      ]} />
    ),
  },
  {
    id: "national-id",
    title: "National ID numbers",
    body: (
      <>
        <p>We ask the person signing the subscription agreement for their national ID number, or passport number if they are not Jordanian. We ask for one reason: so that a binding agreement is tied to an identifiable person authorised to act for the gym, and cannot later be disowned or forged.</p>
        <p>The number is stored in the contract record only, on infrastructure that encrypts data at rest. Access is limited to the RIVET staff who manage contracts, and every time one of them reveals it the access is written to RIVET’s audit trail. It is never used for marketing, never shown to gym staff, and never shared with anyone except where the law requires it. In the signed copy you receive, all but the last four characters are masked. It is deleted with the contract record at the end of the retention period in section 09.</p>
        <p>Gyms may also choose to record their members’ national ID numbers in RIVET, for example as a membership identifier. That is the gym’s decision as controller, and the same access controls apply.</p>
      </>
    ),
  },
  {
    id: "messages",
    title: "Messages we send for gyms",
    body: (
      <>
        <p>Gyms use RIVET to send operational messages to their own members over WhatsApp and SMS: renewal reminders, payment reminders, class booking confirmations and notices such as changed opening hours. When we send these, we do so on the gym’s instructions, using the numbers the gym has on record.</p>
        <p>Every message names the gym it comes from.</p>
        <p>We keep quiet hours. Each gym sets its own window (by default 22:00 to 08:00 Amman time); reminders that fall inside it wait until it ends, unless a member has explicitly asked for a message at a particular time.</p>
        <p>You can stop messages from a gym at any time by replying STOP or إيقاف, or by telling the gym. The gym sees the opt-out and RIVET enforces it.</p>
        <p>Marketing broadcasts are sent only to members who have given the gym consent to receive them, and always carry an opt-out.</p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share data with",
    body: (
      <>
        <p>We do not sell personal data. We share it only with:</p>
        <LegalList items={[
          "Service providers who work for us under contract and only on our instructions: cloud hosting and backups, WhatsApp and SMS delivery providers, email delivery, identity and sign-in, payment and invoicing partners, and secure storage for signed agreements.",
          "Professional advisers such as accountants, auditors and lawyers, where necessary.",
          "Authorities, where the law, a court order or a competent authority requires it.",
          "A successor, if RIVET is sold or merged, in which case this policy continues to apply and you will be told.",
        ]} />
        <p>Within the platform, a gym’s data is visible only to that gym’s users, according to the roles the gym sets. Owners see everything for their gym. Staff see what their role needs.</p>
      </>
    ),
  },
  {
    id: "storage",
    title: "Where data is stored",
    body: (
      <>
        <p>RIVET is operated from Amman. Our servers and backups may be located outside Jordan, with cloud providers that hold recognised security certifications. Where data leaves Jordan we rely on contracts with those providers that require them to protect it to at least the standard described in this policy, and we transfer only what the service needs.</p>
        <p>Gyms can export their own data from RIVET at any time.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <LegalTable headers={["Record", "Kept for"]} rows={[
        ["Gym applications and walkthrough enquiries", "Twelve months after our last contact with you, then deleted"],
        ["Subscription agreements and signature evidence, including ID numbers", "The life of the agreement, then the period Jordanian commercial and tax law requires for business records"],
        ["Invoices and payment records", "The period required by Jordanian tax law"],
        ["Staff user accounts and the audit trail", "While the gym’s subscription is active, then twelve months"],
        ["Member records held for a gym", "While the gym’s subscription is active. After it ends, the gym can export everything for 30 days; we delete it within 90 days unless the law requires otherwise"],
        ["Server logs", "90 days"],
        ["Support conversations", "24 months"],
      ]} />
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>Data is encrypted in transit and at rest. Access inside RIVET is by role, every action is logged, and RIVET staff can reach customer data only when support or operations require it. We keep backups, test restoring them, and require confidentiality from everyone who works with us.</p>
        <p>If a breach affects your data we will tell the affected gym without undue delay, tell members where the gym asks us to or the law requires, and notify the competent authority as the law requires.</p>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <LegalList items={[
          "tell you what personal data we hold about you and give you a copy;",
          "correct data that is wrong or incomplete;",
          "delete data, where we have no legal reason to keep it;",
          "restrict or object to how we use it;",
          "give you the data you provided in a usable format;",
          "withdraw consent, where consent is the basis, without affecting what was done before.",
        ]} />
        <p>To do any of these, contact us using section 15. We will confirm your identity first, and reply within 30 days. If you are a member of a gym, ask the gym; it holds your data and can act directly, and we will support it.</p>
        <p>You also have the right to complain to the competent data protection authority in Jordan established under the Personal Data Protection Law No. 24 of 2023.</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>RIVET is a business platform and this website is not directed at children. Gyms may register members under 18 with a parent’s or guardian’s consent; that consent is the gym’s responsibility to obtain and record. If you believe a child’s data has been given to us without consent, contact us and we will help remove it.</p>,
  },
  {
    id: "cookies",
    title: "Cookies and tracking",
    body: (
      <>
        <p>This website runs no advertising scripts and nothing on it tracks you across other sites. The platform uses only the cookies needed to keep you signed in and to remember choices such as your branch.</p>
        <p>Links to Instagram and WhatsApp take you to services with their own privacy policies.</p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>When this policy changes we publish the new version here with its date. If a change affects how we use customers’ or members’ data in a meaningful way, we tell customers directly by email or WhatsApp before it takes effect.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <p>For anything about this policy or your data:</p>
        <ContactBlock />
      </>
    ),
  },
];

export function PrivacyPolicy() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy policy"
      summary="What RIVET collects, why, who it is shared with, how long it is kept, and what you can do about it. This policy covers the RIVET website, the RIVET platform, and the messages RIVET sends on behalf of gyms."
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
      related={[{ label: "Terms of service", href: "/terms" }]}
    />
  );
}

export function PrivacyPolicyLink({ className }: { className?: string }) {
  return <Link href="/privacy" className={className}>Privacy policy</Link>;
}
