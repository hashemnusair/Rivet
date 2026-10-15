/**
 * Pilot prospects: gyms RIVET plans to invite to a pilot, how far each
 * conversation has gone, who owns it, how to reach the gym and the Arabic
 * messages drafted for it. The Convex module, the preview adapter and the
 * console page all read this file, so they agree on stages and rules.
 *
 * Kept free of path aliases and framework imports: Convex bundles it too.
 */

export const PROSPECT_STAGES = [
  "not_contacted",
  "contacted",
  "replied",
  "demo_scheduled",
  "pilot_agreed",
  "pilot_active",
  "paid",
  "not_interested",
  "on_hold",
] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const PROSPECT_BATCHES = ["selected", "reserve", "hold"] as const;
export type ProspectBatch = (typeof PROSPECT_BATCHES)[number];

export const PROSPECT_DRAFT_STATUSES = ["needs_review", "approved", "needs_revision", "sent"] as const;
export type ProspectDraftStatus = (typeof PROSPECT_DRAFT_STATUSES)[number];

export const PROSPECT_EVIDENCE_LEVELS = ["official", "corroborated", "recheck"] as const;
export type ProspectEvidence = (typeof PROSPECT_EVIDENCE_LEVELS)[number];

/** The filter groups on the page. Every stage belongs to exactly one. */
export const PROSPECT_STAGE_GROUPS = {
  to_contact: ["not_contacted"],
  in_talks: ["contacted", "replied", "demo_scheduled"],
  pilot: ["pilot_agreed", "pilot_active", "paid"],
  closed: ["not_interested", "on_hold"],
} as const satisfies Record<string, readonly ProspectStage[]>;
export type ProspectStageGroup = keyof typeof PROSPECT_STAGE_GROUPS;

export function prospectStageGroup(stage: ProspectStage): ProspectStageGroup {
  for (const [group, stages] of Object.entries(PROSPECT_STAGE_GROUPS) as Array<[ProspectStageGroup, readonly ProspectStage[]]>) {
    if (stages.includes(stage)) return group;
  }
  return "closed";
}

/** The usual next step, offered as the one-click action. None once a deal is paid or closed. */
export function nextProspectStage(stage: ProspectStage): ProspectStage | undefined {
  const forward: Partial<Record<ProspectStage, ProspectStage>> = {
    not_contacted: "contacted",
    contacted: "replied",
    replied: "demo_scheduled",
    demo_scheduled: "pilot_agreed",
    pilot_agreed: "pilot_active",
    pilot_active: "paid",
  };
  return forward[stage];
}

/** Every field a person can change. Owner and dates use "" for "none". */
export interface ProspectFields {
  gymName: string;
  area: string;
  batch: ProspectBatch;
  stage: ProspectStage;
  ownerId: string;
  nextAction: string;
  followUpOn: string;
  notes: string;
  route: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  email: string;
  evidence: ProspectEvidence;
  checkedOn: string;
  contactNotes: string;
  sources: string[];
  draftStatus: ProspectDraftStatus;
  openingMessage: string;
  proposalMessage: string;
  draftNotes: string;
}
export type ProspectField = keyof ProspectFields;
export type ProspectChanges = Partial<ProspectFields>;

export interface PlatformProspectOwner {
  id: string;
  name: string;
}

export interface PlatformProspect extends Omit<ProspectFields, "ownerId"> {
  id: string;
  /** Short reference such as AMM-001, kept from the original sheet. */
  code: string;
  owner?: PlatformProspectOwner;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface PlatformProspectsView {
  prospects: PlatformProspect[];
  /** People a prospect can be assigned to: the platform administrators. */
  owners: PlatformProspectOwner[];
}

export interface ProspectChange {
  field: ProspectField;
  from?: string;
  to?: string;
}

export interface PlatformProspectHistoryEntry {
  id: string;
  action: "created" | "imported" | "updated";
  actorName: string;
  occurredAt: string;
  changes: ProspectChange[];
}

export interface CreatePlatformProspectInput {
  fields: ProspectChanges & { gymName: string };
}

export interface UpdatePlatformProspectInput {
  prospectId: string;
  changes: ProspectChanges;
}

export interface ImportPilotProspectsResult {
  added: number;
  skipped: number;
}

export type ProspectFieldError = "required" | "tooLong" | "invalidPhone" | "invalidUrl" | "invalidEmail" | "invalidDate" | "invalidChoice" | "tooMany" | "duplicate" | "unknownOwner";

export const PROSPECT_FIELD_ERRORS: readonly ProspectFieldError[] = ["required", "tooLong", "invalidPhone", "invalidUrl", "invalidEmail", "invalidDate", "invalidChoice", "tooMany", "duplicate", "unknownOwner"];

/** Same gym, ignoring case, spacing and punctuation. */
export function sameGymName(left: string, right: string): boolean {
  const key = (value: string) => value.toLocaleLowerCase("en").replace(/[^\p{L}\p{N}]+/gu, "");
  return key(left) === key(right);
}

const LIMITS: Partial<Record<ProspectField, number>> = {
  gymName: 120,
  area: 160,
  nextAction: 200,
  notes: 2000,
  route: 120,
  phone: 40,
  whatsapp: 40,
  instagram: 300,
  facebook: 300,
  email: 200,
  contactNotes: 2000,
  openingMessage: 2000,
  proposalMessage: 2000,
  draftNotes: 1000,
};
const MAX_SOURCES = 6;
const MAX_SOURCE_LENGTH = 500;

const TEXT_FIELDS = ["gymName", "area", "nextAction", "notes", "route", "phone", "whatsapp", "instagram", "facebook", "email", "contactNotes", "openingMessage", "proposalMessage", "draftNotes", "ownerId"] as const satisfies readonly ProspectField[];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Trims and checks a set of changes. Only the keys present are checked, so
 * the same rules serve a one-field update and a full new prospect. Errors are
 * codes; the page turns them into words.
 */
export function normalizeProspectChanges(input: unknown): { values: ProspectChanges; fieldErrors: Partial<Record<ProspectField, ProspectFieldError>> } {
  const source = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const values: ProspectChanges = {};
  const fieldErrors: Partial<Record<ProspectField, ProspectFieldError>> = {};

  for (const field of TEXT_FIELDS) {
    if (!(field in source) || source[field] === undefined) continue;
    const raw = source[field];
    if (raw !== null && typeof raw !== "string") {
      fieldErrors[field] = "invalidChoice";
      continue;
    }
    const value = (raw ?? "").trim();
    const limit = LIMITS[field];
    if (limit && value.length > limit) fieldErrors[field] = "tooLong";
    else if (field === "gymName" && !value) fieldErrors[field] = "required";
    else if ((field === "phone" || field === "whatsapp") && value && !/^\+?[0-9][0-9 ()-]{5,}$/.test(value)) fieldErrors[field] = "invalidPhone";
    else if ((field === "instagram" || field === "facebook") && value && !isWebUrl(value)) fieldErrors[field] = "invalidUrl";
    else if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fieldErrors[field] = "invalidEmail";
    else values[field] = value;
  }

  for (const field of ["followUpOn", "checkedOn"] as const) {
    if (!(field in source) || source[field] === undefined) continue;
    const value = typeof source[field] === "string" ? (source[field] as string).trim() : source[field] === null ? "" : undefined;
    if (value === undefined || (value && !isValidCalendarDate(value))) fieldErrors[field] = "invalidDate";
    else values[field] = value;
  }

  const choices = [
    ["batch", PROSPECT_BATCHES],
    ["stage", PROSPECT_STAGES],
    ["evidence", PROSPECT_EVIDENCE_LEVELS],
    ["draftStatus", PROSPECT_DRAFT_STATUSES],
  ] as const;
  for (const [field, allowed] of choices) {
    if (!(field in source) || source[field] === undefined) continue;
    if (isOneOf(allowed as readonly string[], source[field])) (values as Record<string, unknown>)[field] = source[field];
    else fieldErrors[field] = "invalidChoice";
  }

  if ("sources" in source && source.sources !== undefined) {
    const raw: unknown = source.sources;
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) fieldErrors.sources = "invalidUrl";
    else {
      const sources = [...new Set((raw as string[]).map((item) => item.trim()).filter(Boolean))];
      if (sources.length > MAX_SOURCES) fieldErrors.sources = "tooMany";
      else if (sources.some((item) => item.length > MAX_SOURCE_LENGTH || !isWebUrl(item))) fieldErrors.sources = "invalidUrl";
      else values.sources = sources;
    }
  }

  return { values, fieldErrors };
}

/** Defaults for a prospect added by hand. */
export function emptyProspectFields(): Omit<ProspectFields, "gymName"> {
  return {
    area: "",
    batch: "selected",
    stage: "not_contacted",
    ownerId: "",
    nextAction: "",
    followUpOn: "",
    notes: "",
    route: "",
    phone: "",
    whatsapp: "",
    instagram: "",
    facebook: "",
    email: "",
    evidence: "recheck",
    checkedOn: "",
    contactNotes: "",
    sources: [],
    draftStatus: "needs_review",
    openingMessage: "",
    proposalMessage: "",
    draftNotes: "",
  };
}

/** The next free reference with the same prefix, e.g. AMM-013 after AMM-012. */
export function nextProspectCode(existing: readonly string[], prefix = "AMM"): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = existing.reduce((max, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

/** How a single value reads in history: lists become one line. */
export function prospectValueText(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

/** The fields that actually change, with before and after, for history. */
export function prospectChangeList(before: Partial<Record<ProspectField, unknown>>, after: ProspectChanges): ProspectChange[] {
  const changes: ProspectChange[] = [];
  for (const [field, next] of Object.entries(after) as Array<[ProspectField, unknown]>) {
    const from = prospectValueText(before[field]);
    const to = prospectValueText(next);
    if (from !== to) changes.push({ field, from: from || undefined, to: to || undefined });
  }
  return changes;
}

export type FollowUpState = "overdue" | "today" | "upcoming";

/** Compares two YYYY-MM-DD dates in the same (Amman) calendar. */
export function followUpState(followUpOn: string | undefined, today: string): FollowUpState | undefined {
  if (!followUpOn) return undefined;
  if (followUpOn < today) return "overdue";
  return followUpOn === today ? "today" : "upcoming";
}

/** Digits a WhatsApp link accepts: country code first, no plus or spaces. */
export function whatsappDigits(number: string): string {
  const digits = number.replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  // A Jordanian mobile written locally (07…) gets the country code.
  if (digits.startsWith("07") && digits.length === 10) return `962${digits.slice(1)}`;
  return digits;
}

export function whatsappHref(number: string, text?: string): string {
  const base = `https://wa.me/${whatsappDigits(number)}`;
  return text?.trim() ? `${base}?text=${encodeURIComponent(text.trim())}` : base;
}

export function phoneHref(number: string): string {
  const digits = whatsappDigits(number);
  return `tel:+${digits}`;
}

/** "@onyxgym.jo" from an Instagram profile address. */
export function instagramHandle(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean)[0];
    return path ? `@${path}` : url;
  } catch {
    return url;
  }
}

/** "onyxgym.net" from a source address, for a short link label. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type SeedProspect = { code: string } & Omit<ProspectFields, "ownerId" | "followUpOn">;

const UNVERIFIED_NOTE = "No outreach sent. Size and member count unverified.";
const DRAFT_NOTE = "Not sent. The 30-day proposal is suggested wording, not an approved offer. Agree pilot duration, setup-fee waiver, scope and post-pilot price before using. No automatic paid conversion. Request actual use and weekly 15-minute feedback.";
const RESERVE_NOTE = "Reserve: original research only; recheck first-party contact before outreach.";
const CHECKED_ON = "2026-10-15";

/**
 * The Amman pilot list from "RIVET — Amman Pilot Prospects & Outreach"
 * (checked 15 Oct 2026). Loaded once into an empty list with the import
 * action; after that the list in RIVET is the one people edit.
 */
export const AMMAN_PILOT_PROSPECTS: readonly SeedProspect[] = [
  {
    code: "AMM-001", gymName: "Onyx Gym", area: "Sweifieh · Paris Street", batch: "selected", stage: "not_contacted",
    nextAction: "Review and approve draft", notes: UNVERIFIED_NOTE, route: "WhatsApp",
    phone: "+962 79 097 9998", whatsapp: "+962 79 097 9998", instagram: "https://www.instagram.com/onyxgym.jo/", facebook: "", email: "",
    evidence: "official", checkedOn: CHECKED_ON,
    contactNotes: "Official site explicitly advertises WhatsApp and links Instagram. Published details verified; no delivery or call test.",
    sources: ["https://onyxgym.net/contact"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Onyx، أنا هاشم من RIVET، نظام لإدارة النوادي عم نطوّره هون بعمّان. شفت إن باقاتكم فيها جلسات تدريب شخصي وخيار تجميد الاشتراك. حاب أفرجيكم كيف بتجتمع تفاصيل الاشتراك والدفعات والجلسات بسجل واحد. عم ندور على نادي نشتغل معه بتجربة مجانية مع متابعة مباشرة منّا. مين الأنسب نحكي معه 15 دقيقة؟",
    proposalMessage: "بنقترح نبدأ مع Onyx بتجربة مجانية لمدة 30 يوم على متابعة الاشتراكات والتجميد وجلسات التدريب الشخصي. بنجهّز الإعدادات معكم وبنشرحها للشخص المسؤول عن الاستقبال، ومنبلّش بعدد محدود من المشتركين. بنراجع معكم كل أسبوع شو سهّل الشغل وشو احتاج تعديل. وقبل نهاية التجربة بنحكي إذا حابين تكملوا باشتراك مدفوع وبسعر متفق عليه؛ الاستمرار اختياري.",
  },
  {
    code: "AMM-002", gymName: "Keep Gym Fitness", area: "Sweifieh · Park Plaza, 1st floor", batch: "selected", stage: "not_contacted",
    nextAction: "Review and approve draft", notes: UNVERIFIED_NOTE, route: "WhatsApp",
    phone: "+962 79 080 8028", whatsapp: "+962 79 080 8028", instagram: "https://www.instagram.com/keep_gym_fitness/", facebook: "https://www.facebook.com/Keepgymjo/", email: "",
    evidence: "official", checkedOn: CHECKED_ON,
    contactNotes: "Official Facebook About lists phone, WhatsApp, Instagram and Park Plaza address. Published details verified; no delivery or call test.",
    sources: ["https://www.facebook.com/Keepgymjo/about"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Keep Gym، معكم هاشم من RIVET. شفت النادي بالصويفية وعروض الاشتراكات اللي بتنزلوا عنها. عم نطوّر نظام بيساعد الاستقبال يتابع مدة كل اشتراك، الدفعات والتجديدات، وبدنا نجربه مع نادي بعمّان استخدام يومي فعلي. التجربة مجانية ومعها متابعة منّا. بناسبكم نرتب عرض سريع مع المسؤول عن النادي؟",
    proposalMessage: "فكرة التجربة مع Keep Gym تكون على الاشتراكات والتجديدات: نرتب الباقات ومددها، نسجل الدفعات، ونتابع مين قرب اشتراكه يخلص. بنقترح 30 يوم مجاناً مع إعداد وشرح للفريق، وبنبدأ بنطاق صغير متفق عليه. بنخصص 15 دقيقة كل أسبوع لملاحظاتكم، وبنهاية التجربة بنراجع إذا النظام مناسب لشغلكم وإذا حابين تكملوا بالسعر اللي منتفق عليه مسبقاً.",
  },
  {
    code: "AMM-003", gymName: "Body Life Gym and Boxing", area: "Jubeiha · Ahmad Al Tarawneh St.", batch: "selected", stage: "not_contacted",
    nextAction: "Review and approve draft", notes: UNVERIFIED_NOTE, route: "WhatsApp (separate number)",
    phone: "+962 78 542 4553", whatsapp: "+962 78 177 3917", instagram: "https://www.instagram.com/bodylife_gym_amman/", facebook: "https://www.facebook.com/BodyLifeGymJordan/", email: "",
    evidence: "official", checkedOn: CHECKED_ON,
    contactNotes: "Official Facebook About lists mobile 0785424553 and a DIFFERENT WhatsApp number 0781773917; Instagram linked there. Ignore older directory numbers 0798917674 / 0777904153.",
    sources: ["https://www.facebook.com/BodyLifeGymJordan/about", "https://www.tipntag.com/place/s/body-life-gym-Jubeiha"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية، معكم هاشم من RIVET. شفت عروض Body Life بالجبيهة وباقات الشهر والشهرين والثلاثة. حاب أفرجيكم نظام بنشتغل عليه لتنظيم الاشتراكات والدفعات ومتابعة التجديد، بحيث تفاصيل كل مشترك تكون واضحة للاستقبال. عم ندور على نادي يجربه مجاناً ويعطينا ملاحظاته من الشغل اليومي، وإحنا بنتابع معكم مباشرة. ممكن نحكي مع المسؤول؟",
    proposalMessage: "بنقترح تجربة 30 يوم مجاناً مع Body Life، نركز فيها على الباقات الحالية ومواعيد انتهائها والدفعات المسجلة لكل مشترك. منرتبها مع الشخص المسؤول وبنمشي بأول مجموعة اشتراكات مع بعض. بالمقابل بدنا استخدام فعلي وملاحظات قصيرة كل أسبوع. بنراجع معكم التجربة قبل نهايتها، وأي استمرار مدفوع بكون باختياركم وبعد الاتفاق على السعر.",
  },
  {
    code: "AMM-004", gymName: "Blue Gym", area: "Tabarbour", batch: "selected", stage: "not_contacted",
    nextAction: "Verify contact, then approve draft", notes: UNVERIFIED_NOTE, route: "Call to verify / Facebook",
    phone: "+962 78 862 1900", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/2132172113533207/", email: "",
    evidence: "corroborated", checkedOn: CHECKED_ON,
    contactNotes: "0788621900 agrees across the social mirror and Wow Jordan. Live official contact page could not be checked. WhatsApp and Instagram not verified. Confirm identity/operation before pitching.",
    sources: ["https://www.localgymsandfitness.com/JO/Amman/2132172113533207/BLUE-GYM", "https://wowjordan.com/ar/listing/blue-gym/"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Blue Gym، أنا هاشم من RIVET. حاب أتواصل مع المسؤول عن ناديكم بطبربور بخصوص تجربة مجانية لنظام إدارة الاشتراكات والدفعات والتجديدات. بنساعدكم بالإعداد وبنتابع معكم الاستخدام، وبالمقابل بناخد ملاحظاتكم من الشغل اليومي. بناسبكم نرتب عرض 15 دقيقة ونشوف إذا بناسب طريقة شغلكم؟",
    proposalMessage: "بنقترح نجرّب مع Blue Gym متابعة الاشتراكات والدفعات والتجديدات لمدة 30 يوم مجاناً. بنجهّز الإعدادات معكم وبنشرحها للموظفين اللي رح يستخدموا النظام، ومنراجع أسبوعياً إذا الوصول لمعلومات المشترك صار أسهل. منبلش بعدد محدود متفق عليه، وبعدها منقرر سوا إذا مناسب نوسع التجربة. الاستمرار المدفوع اختياري وبسعر واضح قبل القرار.",
  },
  {
    code: "AMM-005", gymName: "La Vie Gym", area: "Jubeiha · Hamed Center, 5th floor", batch: "selected", stage: "not_contacted",
    nextAction: "Review and approve draft", notes: UNVERIFIED_NOTE, route: "Instagram DM",
    phone: "+962 78 788 7880", whatsapp: "", instagram: "https://www.instagram.com/lavie_gym/", facebook: "https://www.facebook.com/laviegym/", email: "",
    evidence: "official", checkedOn: CHECKED_ON,
    contactNotes: "Live Instagram October promotions repeatedly publish 0787887880 and Hamed Center address. Official Facebook About still lists 0798190156. Start via Instagram DM; WhatsApp not verified.",
    sources: ["https://www.instagram.com/lavie_gym/reel/DeZFOFqMwUG/", "https://www.facebook.com/laviegym/about"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق La Vie، معكم هاشم من RIVET. شفت عروض أكتوبر عندكم بالجبيهة، وفيها أشهر إضافية مع الاشتراك. حابين نجرّب معكم نظام يجمع مدة الاشتراك والدفعات ومتابعة التجديد بسجل واضح لكل مشتركة. التجربة مجانية ومعها مساعدة مباشرة منّا بالإعداد والاستخدام، وبالمقابل بناخد ملاحظاتكم من الشغل اليومي. مين الأنسب نرتب معه عرض 15 دقيقة؟",
    proposalMessage: "بنقترح تجربة 30 يوم مجاناً لاشتراكات السيدات في La Vie. نبدأ بتسجيل الاستفسارات والتجارب، وبعد الاشتراك نتابع مدته ودفعاته وتجديده. بنرتب الإعدادات وبنشرحها للفريق، وبناخد ملاحظاتكم كل أسبوع من الاستخدام الفعلي. برامج الأطفال بتضل خارج نطاق البداية. قبل انتهاء التجربة منراجع النتيجة ومنحكي بالاستمرار المدفوع إذا لقيتوه مناسب.",
  },
  {
    code: "AMM-006", gymName: "Shape Lab", area: "Khalda · location to confirm", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify current contact",
    phone: "+962 79 603 4445", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/171775810374609/", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `One-to-one training studio; July 2026 post offers 12/24 PT-session packages and a free trial session. ${RESERVE_NOTE}`,
    sources: ["https://www.findglocal.com/JO/Amman/171775810374609/SHAPE-LAB", "https://www.fitlynk.com/shape-lab-al-jubayhah-jordan"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Shape Lab، أنا هاشم من RIVET. شفت إن شغلكم مركز على التدريب الشخصي وباقات 12 و24 جلسة. حاب أفرجيكم طريقة تجمع باقة المشترك والجلسات المستخدمة والمتبقية والدفعات بسجل واحد. عم نبحث عن ستوديو نجرب معه النظام مجاناً مع متابعة مباشرة منّا. بناسبكم عرض 15 دقيقة؟",
    proposalMessage: "مقترحنا لـ Shape Lab تجربة مجانية لمدة 30 يوم على باقات التدريب الشخصي. بنعرّف الباقات معكم، ومنمشي على تسجيل الجلسات والدفعات ومتابعة قرب انتهاء الباقة. بنبدأ بمجموعة صغيرة من العملاء، ومعها شرح للفريق ومراجعة أسبوعية قصيرة. الهدف نعرف إذا النظام مناسب لطريقة شغلكم؛ وإذا حابين تكملوا بعد التجربة، منتفق على اشتراك مدفوع بشكل واضح.",
  },
  {
    code: "AMM-007", gymName: "The Avengers Gym Men", area: "Abu Nseir", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify current contact",
    phone: "+962 78 626 5581", whatsapp: "", instagram: "", facebook: "", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `Men's gym with monthly and multi-month offers; search snapshot includes a 10 August 2026 promotion; opened cache shows a similar April 2026 offer and May updates. Multiple historical pages exist, so confirm current identity. ${RESERVE_NOTE}`,
    sources: ["https://www.localgymsandfitness.com/JO/Amman/285610445244163/The-Avengers-Gym-men", "https://jo.near-place.com/the-avengers-gym-amman/es"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Avengers، معكم هاشم من RIVET. شفت عروضكم بأبو نصير، من اشتراك الشهر لحد الستة أشهر. عم نطوّر نظام يساعدكم تتابعوا مدة كل اشتراك ودفعاته ومين صار موعد تجديده. بدنا نادي نجرب معه النظام مجاناً على شغل فعلي، ومعنا متابعة مباشرة. ممكن نرتب عرض سريع مع المسؤول؟",
    proposalMessage: "بنقترح تجربة مجانية 30 يوم مع Avengers على تسجيل الاشتراكات والدفعات ومتابعة التجديد. منرتب الباقات الموجودة عندكم، وبنشرح الاستخدام للشخص المسؤول، وبنبلش بعدد محدود من المشتركين. كل أسبوع منراجع الملاحظات والعوائق معكم. قبل نهاية الشهر منقرر إذا مناسب تكملوا، وبنوضح سعر الاشتراك المدفوع قبل أي التزام.",
  },
  {
    code: "AMM-008", gymName: "Gymna", area: "Marj Al Hamam", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify current contact",
    phone: "+962 79 736 2332", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/1880361418932271/", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `Ladies-only club, 30-minute workouts, PT and Pilates offerings. Search snapshot includes July 2026; opened cache contains August 2025 posts. Do not present activity as live-verified. ${RESERVE_NOTE}`,
    sources: ["https://www.findglocal.com/JO/Amman/1880361418932271/Gymna", "https://www.tipntag.com/place/s/gymna-Amman-Jordan"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Gymna، أنا هاشم من RIVET. شفت تركيزكم على تمارين السيدات القصيرة والتدريب الشخصي. حابين نشتغل مع ستوديو بعمّان بتجربة مجانية لتنظيم الاشتراكات والدفعات ومتابعة التجديد، وبنساعدكم بالإعداد والاستخدام مباشرة. إذا الموضوع مناسب إلكم، منقدر نرتب 15 دقيقة مع المسؤولة عن النادي؟",
    proposalMessage: "بنقترح نبدأ مع Gymna لمدة 30 يوم مجاناً، ونختار معكم نوع اشتراك أو باقة تدريب شخصي نتابعها من التسجيل لحد التجديد. بنجهّز الإعدادات وبندرب الشخص المسؤول، وبنراجع الاستخدام والملاحظات أسبوعياً. منحدد احتياجات الحجز بشكل منفصل قبل أي وعد فيها. بنهاية التجربة، الاستمرار المدفوع بكون قراركم وبعد الاتفاق على السعر المناسب.",
  },
  {
    code: "AMM-009", gymName: "H5 Fitness Center", area: "Al Arab Street · area to confirm", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify scale and contact",
    phone: "+962 79 055 3555", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/134910166372737/", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `August/September 2026 mirrored posts promote extra free membership duration and women's class schedules. ${RESERVE_NOTE}`,
    sources: ["https://www.findglocal.com/JO/Amman/134910166372737/H5-Fitness-Center", "https://faqet-e-verdha.cybo.com/JO/al-jubayhah/fitness-qendrat"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق H5، معكم هاشم من RIVET. شفت عروضكم اللي فيها مدة إضافية مع الاشتراك. حاب أفرجيكم نظام يخلي مدة الاشتراك والتمديدات والدفعات واضحة بسجل كل مشترك، ويساعد الفريق بمتابعة التجديدات. عم ندور على نادي يجربه مجاناً ويعطينا ملاحظاته من الاستخدام اليومي. مين المسؤول اللي ممكن نحكي معه؟",
    proposalMessage: "بنقترح تجربة مجانية 30 يوم مع H5 نركز فيها على تسجيل الباقات ومدد العروض والدفعات والتجديدات. بنبدأ بفرع واحد ومجموعة صغيرة متفق عليها، وبنساعد الفريق بالإعداد والتدريب. منراجع معكم أسبوعياً إذا المعلومات واضحة وسهلة الاستخدام. قبل انتهاء التجربة منناقش النتيجة والسعر، والاستمرار باشتراك مدفوع بكون بموافقتكم.",
  },
  {
    code: "AMM-010", gymName: "One More Rep Gym", area: "Al Mawaddah Street", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify Instagram / email",
    phone: "+962 79 772 6545", whatsapp: "", instagram: "https://www.instagram.com/onemorerep.gym/", facebook: "", email: "onemorerep.jo@gmail.com",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `Directory describes functional training and a single listed premises, founded 2019. No recent dated first-party activity verified. Avoid confusing this with gyms of the same name in India/Malaysia. ${RESERVE_NOTE}`,
    sources: ["https://www.bizmideast.com/JO/one-more-rep-gym-07-9772-6545"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق One More Rep، أنا هاشم من RIVET. وصلني تعريف النادي كتدريب وظيفي بعمّان، وحبيت أتواصل معكم. عم نطوّر نظام لتنظيم الاشتراكات والدفعات ومتابعة التجديد، وبندور على نادي نجربه معه مجاناً مع دعم مباشر منّا. إذا الفكرة مناسبة، مين الأنسب نرتب معه مكالمة قصيرة؟",
    proposalMessage: "مقترحنا لـ One More Rep تجربة مجانية 30 يوم، نبدأ فيها بنوع اشتراك واحد ونتابع تسجيله ودفعاته وتجديده. بنجهّز النظام مع الشخص المسؤول وبنشرح الاستخدام، وبناخد ملاحظاتكم 15 دقيقة أسبوعياً. إذا طلع مناسب لطريقة شغلكم، منناقش استمرار مدفوع بسعر واضح ومتفق عليه. وإذا ما ناسبكم، مننهي التجربة حسب الترتيب اللي بنتفق عليه من البداية.",
  },
  {
    code: "AMM-011", gymName: "Snap Gym", area: "Marj Al Hamam", batch: "reserve", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Verify operation first",
    phone: "+962 79 878 0874", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/1459564274074877/", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `Two directories agree on the business/phone, but no recent dated gym post was established. ${RESERVE_NOTE}`,
    sources: ["https://www.cybo.com/JO-biz/snap-gym", "https://jordan.worldplaces.me/gym-and-fitness-centers-in-amman/55937476-snap-gym.html"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق Snap Gym، معكم هاشم من RIVET. حابين نشتغل مع نادي بمرج الحمام بتجربة مجانية لنظام إدارة الاشتراكات والدفعات والتجديدات. بنساعدكم بالإعداد وبنتابع معكم الاستخدام اليومي حتى نعرف شو بنفعكم وشو لازم نعدّل. ممكن نرتب عرض قصير مع المسؤول عن النادي؟",
    proposalMessage: "بنقترح نبدأ مع Snap Gym بتجربة 30 يوم مجاناً على الاشتراكات والدفعات والتجديدات، بعد ما نفهم طريقة شغلكم الحالية. بنجهّز الإعدادات وبنشرحها للمسؤول، ومنبلش بمجموعة صغيرة متفق عليها. كل أسبوع منراجع شو مشي وشو احتاج تعديل. الاستمرار بعد التجربة اختياري، وبنوضح أي سعر مدفوع قبل الاتفاق عليه.",
  },
  {
    code: "AMM-012", gymName: "My Tribe Gym", area: "Sweifieh · Barakeh Mall", batch: "hold", stage: "not_contacted",
    nextAction: "Review suitability before contact", notes: UNVERIFIED_NOTE, route: "Hold for size review",
    phone: "+962 79 722 8865", whatsapp: "", instagram: "", facebook: "https://www.facebook.com/683361904856634/", email: "",
    evidence: "recheck", checkedOn: CHECKED_ON,
    contactNotes: `Functional training, calisthenics, women's group zone and kids offerings; mirrored July/August 2026 posts show schedules/community competition participation. Longstanding reviews and several distinct programs make this a more established prospect than a tiny neighborhood gym. ${RESERVE_NOTE}`,
    sources: ["https://www.localgymsandfitness.com/JO/Amman/683361904856634/My-Tribe-Gym", "https://wowjordan.com/en/listing/my-tribe-gym/"],
    draftStatus: "needs_review", draftNotes: DRAFT_NOTE,
    openingMessage: "يعطيكم العافية فريق My Tribe، أنا هاشم من RIVET. شفت برامج التدريب الوظيفي والكاليستنكس عندكم بالصويفية. حابين نعرض عليكم تجربة مجانية لإدارة اشتراكات البالغين والدفعات ومتابعة التجديد، بنطاق صغير ومع متابعة مباشرة منّا. بنبدأ بفهم النظام اللي بتستخدموه حالياً. مين الأنسب نرتب معه مكالمة 15 دقيقة؟",
    proposalMessage: "بنقترح تجربة محدودة مع My Tribe لمدة 30 يوم مجاناً على إدارة مجموعة من اشتراكات البالغين والدفعات والتجديدات. بنحدد معكم نطاق واضح يناسب شغلكم الحالي، وبنساعد بالإعداد والشرح، وبنراجع الملاحظات أسبوعياً. الأطفال وتفاصيل جدولة البرامج خارج نطاق البداية. منناقش التوسع أو الاستمرار المدفوع فقط بعد ما نتأكد سوا إن التجربة مفيدة إلكم.",
  },
];
