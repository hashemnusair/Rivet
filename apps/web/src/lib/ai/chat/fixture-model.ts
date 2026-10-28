import type { ChatModel, ChatModelRequest, ModelBlock, ModelStreamEvent, ModelTurnResult } from "./engine";
import { ChatModelError } from "./engine";
import { attachedOf, messageOf } from "./prompt";

/**
 * RIVET's preview model: a deterministic stand-in for the live assistant used
 * by the local design preview and by tests. It reads the same tools against
 * the same data, so answers name real (seeded) records, and it streams its
 * words in uneven bursts like a real model so the panel's smoothing, work
 * log and stop control are exercised. It recognises a handful of intents in
 * English and Arabic; everything else gets an honest description of what it
 * can look up. The panel labels its answers as test answers.
 */

export interface FixtureModelOptions {
  /** Pause between streamed bursts; omitted in tests so they run instantly. */
  delay?: (ms: number) => Promise<void>;
}

type Row = Record<string, unknown>;
type Lang = "en" | "ar";
type ToolCall = { name: string; input: Record<string, unknown> };
type ToolOutput = ToolCall & { data: Row; isError: boolean };

const AR_MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"];
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EN_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STAGES: Record<Lang, Record<string, string>> = {
  en: { new: "New", attempted: "Did not answer", contacted: "Contacted", trial_booked: "Trial booked", trial_completed: "Trial done", offer_sent: "Offer sent", won: "Sold", lost: "Not sold" },
  ar: { new: "جديدة", attempted: "لم يتم الرد", contacted: "تم التواصل", trial_booked: "تجربة محجوزة", trial_completed: "تمت التجربة", offer_sent: "أُرسل العرض", won: "تم البيع", lost: "فرصة بيع مفقودة" },
};
const METHODS: Record<Lang, Record<string, string>> = {
  en: { cash: "Cash", card: "Card", bank_transfer: "Bank transfer", cliq: "CliQ", other: "Other" },
  ar: { cash: "كاش", card: "بطاقة", bank_transfer: "حوالة بنكية", cliq: "كليك", other: "أخرى" },
};

function rows(data: Row): Row[] {
  return Array.isArray(data.rows) ? data.rows.filter((row): row is Row => Boolean(row) && typeof row === "object") : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

function count(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** "JOD 12.500" → "12.500 د.أ" in Arabic; other currencies keep their code after the amount. */
function money(value: unknown, lang: Lang): string {
  const match = /^(-?)([A-Z]{3}) (\d+(?:\.\d+)?)$/.exec(text(value));
  if (!match) return text(value);
  if (lang === "en") return `${match[2]} ${match[1]}${match[3]}`;
  return `${match[1]}${match[3]} ${match[2] === "JOD" ? "د.أ" : match[2]}`;
}

function moneyAmount(value: unknown): number {
  const match = /^(-?)[A-Z]{3} (\d+(?:\.\d+)?)$/.exec(text(value));
  return match ? Number(`${match[1]}${match[2]}`) : 0;
}

function date(value: unknown, lang: Lang): string {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return raw;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return lang === "ar" ? `${day.getUTCDate()} ${AR_MONTHS[day.getUTCMonth()]}` : `${EN_DAYS[day.getUTCDay()]} ${day.getUTCDate()} ${EN_MONTHS[day.getUTCMonth()]}`;
}

function clock(value: unknown, lang: Lang): string {
  const match = /T(\d{2}):(\d{2})/.exec(text(value));
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = match[2];
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return lang === "ar" ? `${twelve}:${minutes} ${hours < 12 ? "ص" : "م"}` : `${match[1]}:${minutes}`;
}

/** Names entered in Latin script stay in their own direction inside an Arabic sentence. */
function latin(value: string, lang: Lang): string {
  return lang === "ar" && /[A-Za-z]/.test(value) ? `\u2068${value}\u2069` : value;
}

function link(row: Row | undefined, kind: "member" | "lead", nameField = "fullName"): string {
  if (!row) return "";
  const name = text(row[nameField]) || text(row.subjectName) || text(row.memberName);
  const id = text(row.id);
  return id ? `[${name}](rivet://${kind}/${id})` : name;
}

function more(total: number, shown: number, lang: Lang, where: { en: string; ar: string }): string {
  if (total <= shown) return "";
  return lang === "ar" ? `\n\nوهناك ${total - shown} غيرهم في ${where.ar}.` : `\n\n${total - shown} more in ${where.en}.`;
}

// ---------------------------------------------------------------------------
// Planning: which lookups a question needs
// ---------------------------------------------------------------------------

function has(question: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(question));
}

function plan(question: string, attached: Array<{ kind: string; id?: string; label: string }>, lang: Lang): { calls: ToolCall[]; note: string } | undefined {
  const q = question.toLowerCase();
  const member = attached.find((item) => item.kind === "member" && item.id);
  const lead = attached.find((item) => item.kind === "lead" && item.id);
  const note = (en: string, ar: string) => (lang === "ar" ? ar : en);
  // A question about the record on screen is about that record, unless it asks about people in general.
  const aboutMany = has(q, [/\bmembers\b|\bwho\b|\bwhich\b|\blist\b/, /الأعضاء|من الذين|من في|بمن/]);
  if (member && !aboutMany && has(q, [/brief|summar|call|about|tell me|who is|before|draft|message|renew|owe|pay/, /ملخص|لخّص|لخص|اتصال|أتصل|معلومات|قبل|مسودة|رسالة|تجديد|متبق|مبلغ|دفع/])) {
    return { calls: [{ name: "get_member", input: { member_id: member.id, include: ["payments"] } }], note: note(`Reading ${member.label}'s membership, payments and recent contact.`, `أراجع اشتراك ${member.label} ودفعاته وآخر تواصل معه.`) };
  }
  if (lead && has(q, [/lead|summar|follow|about|tell me|draft|message|when/, /ملخص|لخّص|متابعة|رسالة|مسودة|متى/])) {
    return { calls: [{ name: "get_lead", input: { lead_id: lead.id } }], note: note(`Reading ${lead.label}'s contact history.`, `أراجع سجل التواصل مع ${lead.label}.`) };
  }
  if (has(q, [/\bexpired\b/, /\bended\b/, /انتهت|منتهي/])) {
    return { calls: [{ name: "renewals_due", input: { bucket: "expired" } }, { name: "open_screen", input: { screen: "renewals", label: lang === "ar" ? "فتح قائمة التجديدات" : "Open renewals" } }], note: note("Checking memberships that ended recently and who has been contacted since.", "أراجع الاشتراكات التي انتهت مؤخرًا ومن تم التواصل معه بعد انتهائها.") };
  }
  if (has(q, [/renew/, /expir/, /ending|ends soon|end soon/, /تجديد|ينتهي|تنتهي/])) {
    return { calls: [{ name: "renewals_due", input: { bucket: "expiring" } }, { name: "open_screen", input: { screen: "renewals", label: lang === "ar" ? "فتح قائمة التجديدات" : "Open renewals" } }], note: note("Checking memberships that end in the next two weeks and when each member was last contacted.", "أراجع الاشتراكات التي تنتهي خلال الأسبوعين القادمين وآخر تواصل مع كل عضو.") };
  }
  if (has(q, [/\bowe/, /outstanding|unpaid|balance|debt/, /المبلغ المتبقي|مبالغ متبقية|متبقي|مديون|ديون/])) {
    return { calls: [{ name: "search_members", input: { membership: "outstanding" } }, { name: "open_screen", input: { screen: "members", membership: "outstanding", label: lang === "ar" ? "عرض الأعضاء الذين عليهم مبالغ متبقية" : "Show members who owe money" } }], note: note("Looking up members with money still owed.", "أبحث عن الأعضاء الذين عليهم مبالغ متبقية.") };
  }
  if (has(q, [/today|attention|priorit|focus|first|start/, /اليوم|انتباه|أولوي|أبدأ/])) {
    return { calls: [{ name: "today_overview", input: {} }], note: note("Reading today's numbers and the work queue.", "أقرأ أرقام اليوم وقائمة الأعمال.") };
  }
  if (has(q, [/\blead/, /prospect|pipeline|trial/, /مهتم|مهتمين|مسار المبيعات|تجربة/])) {
    return { calls: [{ name: "search_leads", input: {} }], note: note("Reading open leads and their next follow-ups.", "أراجع المهتمين بالاشتراك ومواعيد متابعتهم.") };
  }
  if (has(q, [/payment|revenue|collect|income|cash|sales|money/, /دفعات|الدفعات|إيراد|الإيرادات|تحصيل|التحصيلات|كاش/])) {
    return { calls: [{ name: "list_payments", input: {} }], note: note("Adding up payments for the last 30 days.", "أجمع الدفعات خلال آخر 30 يومًا.") };
  }
  if (has(q, [/class|schedule|session|timetable/, /حصة|حصص|الحصص|جدول/])) {
    return { calls: [{ name: "class_schedule", input: {} }], note: note("Checking the class schedule for the coming week.", "أراجع جدول الحصص الجماعية للأسبوع القادم.") };
  }
  if (has(q, [/risk|churn|inactive|haven.?t (come|visited)|leaving/, /لم يزر|خطر|قد لا يجدد/])) {
    return { calls: [{ name: "at_risk_members", input: {} }], note: note("Checking members who may not renew.", "أراجع الأعضاء الذين قد لا يجدّدون اشتراكهم.") };
  }
  if (has(q, [/task|follow.?up|to.?do/, /مهام|مهمة|متابعات/])) {
    return { calls: [{ name: "list_tasks", input: {} }], note: note("Reading open follow-up tasks.", "أقرأ مهام المتابعة المفتوحة.") };
  }
  if (has(q, [/plan|price|pricing|package/, /أنواع الاشتراكات|سعر|أسعار|باقة/])) {
    return { calls: [{ name: "list_plans", input: {} }], note: note("Reading the active membership plans.", "أقرأ أنواع الاشتراكات الفعّالة.") };
  }
  if (has(q, [/drawer|shift|till/, /الصندوق/])) {
    return { calls: [{ name: "cash_shifts", input: {} }], note: note("Checking recent cash drawer counts.", "أراجع آخر عمليات جرد الصندوق.") };
  }
  if (member) return { calls: [{ name: "get_member", input: { member_id: member.id } }], note: note(`Reading ${member.label}'s record.`, `أراجع سجل ${member.label}.`) };
  const search = /(?:find|search|look up|lookup)\s+(.+)/i.exec(question) ?? /(?:ابحث عن|ابحث)\s+(.+)/.exec(question);
  if (search) return { calls: [{ name: "search_members", input: { query: search[1]!.replace(/[?.!؟]+$/, "").trim().slice(0, 60) } }], note: note("Searching members.", "أبحث في سجلات الأعضاء.") };
  return undefined;
}

// ---------------------------------------------------------------------------
// Answers composed from lookup results
// ---------------------------------------------------------------------------

function failureText(output: ToolOutput, lang: Lang): string {
  const error = text(output.data.error);
  if (/access/.test(error)) return lang === "ar" ? "ليس لديك صلاحية للاطلاع على هذه المعلومات في RIVET. تواصل مع مالك النادي إذا كنت تحتاجها." : "You don't have access to this in RIVET. Ask your gym owner if you need it.";
  if (/No such record/.test(error)) return lang === "ar" ? "لم نعثر على هذا السجل ضمن فروعك." : "I couldn't find that record in your branches.";
  return lang === "ar" ? "لم يتمكن RIVET من قراءة هذه المعلومات الآن. أعد المحاولة بعد قليل." : "RIVET couldn't read that right now. Try again in a moment.";
}

function answerFor(output: ToolOutput, lang: Lang, question = ""): string {
  if (output.isError) return failureText(output, lang);
  const data = output.data;
  const list = rows(data);
  const total = count(data.total, list.length);
  const ar = lang === "ar";
  switch (output.name) {
    case "renewals_due": {
      const expired = output.input.bucket === "expired";
      const days = count(data.days, expired ? 30 : 14);
      if (!total) return ar ? (expired ? `لا توجد اشتراكات انتهت خلال آخر ${days} يومًا.` : `لا توجد اشتراكات تنتهي خلال الأيام الـ${days} القادمة.`) : expired ? `No memberships ended in the last ${days} days.` : `No memberships end in the next ${days} days.`;
      const head = ar
        ? `**${expired ? "عدد الاشتراكات التي انتهت خلال آخر" : "عدد الاشتراكات التي تنتهي خلال الأيام الـ"}${expired ? ` ${days} يومًا` : `${days} القادمة`}: ${total}**`
        : `**${total} ${total === 1 ? "membership" : "memberships"} ${expired ? `ended in the last ${days} days` : `end in the next ${days} days`}.**`;
      const lines = list.slice(0, 6).map((row) => {
        const member = row.member as Row | undefined;
        const contact = row.lastContactAt ? (ar ? `آخر تواصل ${date(row.lastContactAt, lang)}` : `last contact ${date(row.lastContactAt, lang)}`) : ar ? "لم يتم التواصل بعد" : "not contacted yet";
        const owes = member && moneyAmount(member.outstanding) > 0 ? (ar ? ` · المبلغ المتبقي ${money(member.outstanding, lang)}` : ` · owes ${money(member.outstanding, lang)}`) : "";
        return `- ${link(member, "member")} · ${latin(text(row.planName), lang)}${ar ? "، " : ", "}${ar ? (expired ? "انتهى" : "ينتهي") : expired ? "ended" : "ends"} ${date(row.endDate, lang)} · ${contact}${owes}`;
      });
      const advice = ar ? "\n\nابدأ بمن لم يتم التواصل معهم ومن عليهم مبالغ متبقية." : "\n\nStart with anyone not contacted yet and anyone who owes money.";
      return `${head}\n\n${lines.join("\n")}${more(total, lines.length, lang, { en: "the renewals queue", ar: "قائمة التجديدات" })}${advice}`;
    }
    case "search_members": {
      if (!total) return ar ? "لا توجد نتائج مطابقة." : "No members match.";
      if (output.input.membership === "outstanding") {
        const sum = list.reduce((acc, row) => acc + moneyAmount(row.outstanding), 0);
        const currency = /^-?([A-Z]{3})/.exec(text(list[0]?.outstanding))?.[1] ?? "JOD";
        const shown = Math.min(list.length, 8);
        const sumText = money(`${currency} ${sum.toFixed(3)}`, lang);
        const head = ar ? `**عدد الأعضاء الذين عليهم مبالغ متبقية: ${total}.** مجموع المبالغ المتبقية لمن تظهر أسماؤهم أدناه: ${sumText}.` : `**${total} ${total === 1 ? "member owes" : "members owe"} money**, ${sumText} across ${list.length === total ? "all of them" : `the ${list.length} shown`}.`;
        const table = ar
          ? ["| العضو | المبلغ المتبقي | نوع الاشتراك |", "| --- | --- | --- |", ...list.slice(0, shown).map((row) => `| ${link(row, "member")} | ${money(row.outstanding, lang)} | ${latin(text(row.currentPlanName), lang) || "—"} |`)]
          : ["| Member | Owes | Plan |", "| --- | --- | --- |", ...list.slice(0, shown).map((row) => `| ${link(row, "member")} | ${money(row.outstanding, lang)} | ${text(row.currentPlanName) || "—"} |`)];
        return `${head}\n\n${table.join("\n")}${more(total, shown, lang, { en: "the members list", ar: "قائمة الأعضاء" })}`;
      }
      const lines = list.slice(0, 6).map((row) => `- ${link(row, "member")} · ${text(row.memberNumber)}${row.currentPlanName ? ` · ${text(row.currentPlanName)}` : ""}${row.membershipEndDate ? ` · ${ar ? "ينتهي" : "ends"} ${date(row.membershipEndDate, lang)}` : ""}`);
      return `${ar ? `عدد النتائج: ${total}` : `${total} ${total === 1 ? "match" : "matches"}:`}\n\n${lines.join("\n")}`;
    }
    case "get_member": {
      const sources = Array.isArray(data.sources) ? (data.sources as Row[]) : [data];
      const member = sources[0] ?? {};
      const payments = sources.find((source) => text(source.source).startsWith("Payments"));
      const stats = (member.stats ?? {}) as Row;
      const owes = moneyAmount(member.outstanding) > 0;
      const plan = text(member.currentPlanName);
      const status = text(member.membershipStatus);
      const parts: string[] = [];
      parts.push(ar
        ? `**${link(member, "member")}**${plan ? ` · ${latin(plan, lang)}` : ""}${member.membershipEndDate ? `، ${status === "expired" ? "انتهى الاشتراك في" : "ينتهي الاشتراك في"} ${date(member.membershipEndDate, lang)}` : ""}.`
        : `**${link(member, "member")}**${plan ? ` · ${plan}` : ""}${member.membershipEndDate ? `, ${status === "expired" ? "ended" : "ends"} ${date(member.membershipEndDate, lang)}` : ""}.`);
      parts.push(owes ? (ar ? `- المبلغ المتبقي: **${money(member.outstanding, lang)}**` : `- Owes **${money(member.outstanding, lang)}**`) : ar ? "- لا توجد مبالغ متبقية." : "- Nothing owed.");
      if (member.lastCheckInAt) parts.push(ar ? `- آخر زيارة ${date(member.lastCheckInAt, lang)} · عدد الزيارات خلال آخر 30 يومًا: ${count(stats.checkInsLast30Days, 0)}` : `- Last visit ${date(member.lastCheckInAt, lang)} · ${count(stats.checkInsLast30Days, 0)} ${count(stats.checkInsLast30Days, 0) === 1 ? "visit" : "visits"} in the last 30 days`);
      const tasks = Array.isArray(member.openTasks) ? (member.openTasks as Row[]) : [];
      if (tasks.length) parts.push(ar ? `- مهام مفتوحة: ${tasks.map((task) => text(task.title)).join("، ")}` : `- Open tasks: ${tasks.map((task) => text(task.title)).join("; ")}`);
      const recent = payments ? rows(payments).slice(0, 2) : [];
      if (recent.length) parts.push(ar ? `- آخر دفعة: ${money(recent[0]!.amount, lang)} (${METHODS.ar[text(recent[0]!.method)] ?? text(recent[0]!.method)}) في ${date(recent[0]!.occurredAt, lang)}` : `- Last payment: ${money(recent[0]!.amount, lang)} by ${(METHODS.en[text(recent[0]!.method)] ?? text(recent[0]!.method)).toLowerCase()} on ${date(recent[0]!.occurredAt, lang)}`);
      const advice = status === "expiring" || status === "expired"
        ? ar ? "\n\nمناسب للاتصال بشأن تجديد الاشتراك" + (owes ? " وتذكيره بالمبلغ المتبقي." : ".") : `\n\nA good moment to call about renewing${owes ? " and the amount still owed" : ""}.`
        : owes ? (ar ? "\n\nذكّره بالمبلغ المتبقي عند زيارته القادمة." : "\n\nMention the amount owed at the next visit.") : "";
      const wantsDraft = /draft|message|write/i.test(question) || /مسودة|رسالة|اكتب/.test(question);
      const first = text(member.fullName).split(" ")[0] ?? "";
      const draft = !wantsDraft ? "" : ar
        ? `\n\nمسودة رسالة:\n\n> مرحبًا ${first}، ${status === "expired" ? "انتهى اشتراكك" : "ينتهي اشتراكك قريبًا"}${member.membershipEndDate ? ` في ${date(member.membershipEndDate, lang)}` : ""}. يسعدنا تجديده في زيارتك القادمة، أو تواصل مع النادي إذا كان لديك أي سؤال.`
        : `\n\nDraft message:\n\n> Hi ${first}, your membership ${status === "expired" ? "ended" : "ends"}${member.membershipEndDate ? ` on ${date(member.membershipEndDate, lang)}` : " soon"}. We'd be glad to renew it on your next visit, or reply here if you have any questions.`;
      return `${parts.join("\n")}${wantsDraft ? draft : advice}`;
    }
    case "get_lead": {
      const stage = STAGES[lang][text(data.stage)] ?? text(data.stage);
      const activities = Array.isArray(data.activities) ? (data.activities as Row[]) : [];
      const last = activities[0];
      const lines = [ar ? `**${link(data, "lead")}** · ${stage}` : `**${link(data, "lead")}** · ${stage}`];
      if (data.nextFollowUpAt) lines.push(ar ? `- موعد المتابعة القادم: ${date(data.nextFollowUpAt, lang)}` : `- Next follow-up ${date(data.nextFollowUpAt, lang)}`);
      if (last) lines.push(ar ? `- آخر نشاط: ${text(last.title)} (${date(last.occurredAt, lang)})` : `- Last activity: ${text(last.title)} (${date(last.occurredAt, lang)})`);
      if (data.doNotContact) lines.push(ar ? "- **طلب عدم التواصل معه.**" : "- **Asked not to be contacted.**");
      const draft = data.doNotContact ? "" : ar
        ? `\n\nمسودة رسالة:\n\n> مرحبًا ${text(data.fullName)}، نود أن نعرف إن كان لديك أي سؤال عن الاشتراك. يسعدنا ترتيب زيارة تجريبية في الوقت الذي يناسبك.`
        : `\n\nDraft message:\n\n> Hi ${text(data.fullName)}, just checking whether you have any questions about joining. Happy to set up a trial visit at a time that suits you.`;
      return `${lines.join("\n")}${draft}`;
    }
    case "today_overview": {
      const kpis = (data.kpis ?? {}) as Row;
      const queue = (data.todayQueue ?? {}) as Row;
      const items = Array.isArray(queue.items) ? (queue.items as Row[]) : [];
      const head = ar
        ? `الإيرادات اليوم **${money(kpis.revenueToday, lang)}** (هذا الشهر: ${money(kpis.revenueThisMonth, lang)}). عدد التجديدات المستحقة هذا الأسبوع: ${count(kpis.renewalsDueNext7Days, 0)}، وعدد المتابعات المتأخرة: ${count(kpis.overdueFollowUps, 0)}.`
        : `Revenue today is **${money(kpis.revenueToday, lang)}** (${money(kpis.revenueThisMonth, lang)} this month). ${count(kpis.renewalsDueNext7Days, 0)} renewals are due this week and ${count(kpis.overdueFollowUps, 0)} follow-ups are overdue.`;
      if (!items.length) return `${head}\n\n${ar ? "لا يوجد ما يتطلب انتباهك الآن." : "Nothing needs your attention right now."}`;
      const lines = items.slice(0, 5).map((item) => `- **${text(item.title)}**${item.detail ? ` · ${text(item.detail)}` : ""}`);
      return `${head}\n\n${ar ? "يتطلب انتباهك أولًا:" : "Needs attention first:"}\n${lines.join("\n")}${more(count(queue.totalItems, items.length), lines.length, lang, { en: "Today's list", ar: "قائمة اليوم" })}`;
    }
    case "search_leads": {
      if (!total) return ar ? "لا يوجد مهتمون بالاشتراك حاليًا." : "There are no open leads.";
      const overdue = list.filter((row) => row.overdue === true).length;
      const lines = list.slice(0, 6).map((row) => `- ${link(row, "lead")} · ${STAGES[lang][text(row.stage)] ?? text(row.stage)}${row.nextFollowUpAt ? ` · ${ar ? "المتابعة" : "follow up"} ${date(row.nextFollowUpAt, lang)}` : ""}${row.overdue ? (ar ? " · متأخرة" : " · overdue") : ""}`);
      const head = ar ? `**عدد المهتمين بالاشتراك: ${total}**، منهم ${overdue} بمتابعات متأخرة ضمن من يظهرون أدناه.` : `**${total} open ${total === 1 ? "lead" : "leads"}**${overdue ? `, ${overdue} with overdue follow-ups among those shown` : ""}.`;
      return `${head}\n\n${lines.join("\n")}${more(total, lines.length, lang, { en: "the pipeline", ar: "مسار المبيعات" })}`;
    }
    case "list_payments": {
      const totals = (data.totals ?? {}) as Row;
      const window = (data.window ?? {}) as Row;
      const byMethod = (totals.byMethod ?? {}) as Record<string, Row>;
      const head = ar
        ? `**التحصيلات: ${money(totals.collected, lang)}** بين ${date(window.from, lang)} و${date(window.to, lang)} · عدد الدفعات: ${count(totals.transactions, 0)}.`
        : `**${money(totals.collected, lang)} collected** between ${date(window.from, lang)} and ${date(window.to, lang)} from ${count(totals.transactions, 0)} payments.`;
      const lines = Object.entries(byMethod).sort(([, a], [, b]) => moneyAmount(b.amount) - moneyAmount(a.amount)).map(([method, entry]) => `- ${METHODS[lang][method] ?? method}: ${money(entry.amount, lang)} (${count(entry.count, 0)})`);
      const refunds = moneyAmount(totals.refunded) > 0 ? (ar ? `\n\nالمبالغ المستردة: ${money(totals.refunded, lang)}.` : `\n\nRefunds: ${money(totals.refunded, lang)}.`) : "";
      return `${head}\n\n${lines.join("\n")}${refunds}`;
    }
    case "class_schedule": {
      if (!total) return ar ? "لا توجد حصص جماعية مجدولة خلال هذه الفترة." : "No classes are scheduled in that window.";
      const lines = list.filter((row) => row.status !== "cancelled").slice(0, 6).map((row) => `- **${text(row.name)}** · ${date(row.date, lang)} ${clock(row.startsAt, lang)}${row.coachName ? ` · ${text(row.coachName)}` : ""} · ${ar ? `المقاعد المتاحة: ${count(row.spotsRemaining, 0)}` : `${count(row.spotsRemaining, 0)} spots left`}`);
      return `${ar ? "الحصص الجماعية القادمة:" : "Coming up:"}\n\n${lines.join("\n")}`;
    }
    case "at_risk_members": {
      if (!total) return ar ? "لا يوجد أعضاء يحتاجون متابعة الآن." : "No members are flagged right now.";
      const reason = (row: Row) => {
        const first = Array.isArray(row.reasons) ? (row.reasons[0] as Row | undefined) : undefined;
        const kind = text(first?.kind);
        if (kind.includes("inactive")) return ar ? "لم يزر النادي مؤخرًا" : `no visit in ${count(first?.daysInactive, 0)} days`;
        if (kind.includes("expired")) return ar ? "انتهى الاشتراك" : "membership ended";
        return ar ? "ينتهي الاشتراك قريبًا" : "membership ending soon";
      };
      const lines = list.slice(0, 6).map((row) => `- ${link(row.member as Row, "member")} · ${reason(row)}`);
      return `${ar ? `**عدد الأعضاء الذين قد لا يجدّدون اشتراكهم: ${total}**` : `**${total} ${total === 1 ? "member" : "members"} may not renew.**`}\n\n${lines.join("\n")}${more(total, lines.length, lang, { en: "the follow-ups queue", ar: "قائمة المتابعات" })}`;
    }
    case "list_tasks": {
      if (!total) return ar ? "لا توجد مهام مفتوحة." : "No open tasks.";
      const lines = list.slice(0, 6).map((row) => `- **${text(row.title)}** · ${text(row.subjectName)} · ${date(row.dueAt, lang)}`);
      return `${ar ? `عدد المهام المفتوحة: ${total}` : `${total} open ${total === 1 ? "task" : "tasks"}:`}\n\n${lines.join("\n")}`;
    }
    case "list_plans": {
      if (!total) return ar ? "لا توجد أنواع اشتراكات فعّالة." : "No active plans.";
      const header = ar ? ["| نوع الاشتراك | السعر | المدة | المشتركون |", "| --- | --- | --- | --- |"] : ["| Plan | Price | Length | Members |", "| --- | --- | --- | --- |"];
      const body = list.slice(0, 8).map((row) => `| ${text(row.name)} | ${money(row.basePrice, lang)} | ${row.durationDays ? `${count(row.durationDays, 0)} ${ar ? "يوم" : "days"}` : row.visitAllowance ? `${count(row.visitAllowance, 0)} ${ar ? "زيارة" : "visits"}` : "—"} | ${count(row.activeSubscribers, 0)} |`);
      return [...header, ...body].join("\n");
    }
    case "cash_shifts": {
      const latest = list[0];
      if (!latest) return ar ? "لا توجد عمليات جرد مسجلة للصندوق." : "No drawer shifts are recorded.";
      const variance = moneyAmount(latest.variance);
      return ar
        ? `آخر إغلاق للصندوق: ${date(latest.closedAt ?? latest.openedAt, lang)} بواسطة ${text(latest.openedByName)}. ${variance === 0 ? "أرقام النقد متطابقة." : `الفرق في المبلغ النقدي: ${money(latest.variance, lang)}${variance < 0 ? " (نقص في الصندوق)" : " (زيادة في الصندوق)"}.`}`
        : `Latest drawer: ${date(latest.closedAt ?? latest.openedAt, lang)}, opened by ${text(latest.openedByName)}. ${variance === 0 ? "The cash numbers match." : `Cash difference ${money(latest.variance, lang)} (${variance < 0 ? "short" : "over"}).`}`;
    }
    default:
      return ar ? "إليك ما وجدته." : "Here's what I found.";
  }
}

function overview(lang: Lang, greeting: boolean): string {
  if (lang === "ar") return `${greeting ? "أهلًا. " : ""}يمكنني البحث في RIVET عن الأعضاء واشتراكاتهم والمهتمين بالاشتراك والدفعات والحصص الجماعية والمهام والتقارير، وكتابة مسودات الرسائل. جرّب مثلًا:\n\n- من يجب أن أتصل به بشأن التجديد هذا الأسبوع؟\n- من الأعضاء الذين عليهم مبالغ متبقية؟\n- ما الذي يتطلب انتباهي اليوم؟`;
  return `${greeting ? "Hi. " : ""}I can look things up across RIVET (members and memberships, leads, payments, classes, tasks and reports) and draft messages for you. Try:\n\n- Who should I call about renewals this week?\n- Which members owe money?\n- What needs my attention today?`;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

function lastUserTurn(messages: ChatModelRequest["messages"]): string {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== "user") continue;
    const turn = message.content.find((block): block is Extract<ModelBlock, { type: "text" }> => block.type === "text" && block.text.includes("<message>"));
    if (turn) return turn.text;
  }
  return "";
}

function parse(content: string): Row {
  try {
    const value = JSON.parse(content) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
  } catch {
    return {};
  }
}

/** Splits text into uneven bursts, never inside a word, like a model's stream. */
function bursts(value: string): string[] {
  const words = value.match(/\S+\s*|\s+/g) ?? [];
  const out: string[] = [];
  let index = 0;
  let seed = value.length;
  while (index < words.length) {
    seed = (seed * 9301 + 49297) % 233280;
    const size = 1 + (seed % 4);
    out.push(words.slice(index, index + size).join(""));
    index += size;
  }
  return out;
}

export function fixtureChatModel(options: FixtureModelOptions = {}): ChatModel {
  const wait = async (ms: number, signal: AbortSignal) => {
    if (signal.aborted) throw new ChatModelError("internal");
    if (options.delay) await options.delay(ms);
    if (signal.aborted) throw new ChatModelError("internal");
  };
  return {
    async stream(request, onEvent: (event: ModelStreamEvent) => void, signal): Promise<ModelTurnResult> {
      const turn = lastUserTurn(request.messages);
      const question = messageOf(turn);
      const lang: Lang = /[؀-ۿ]/.test(question) ? "ar" : "en";
      const last = request.messages.at(-1);
      const results = last?.role === "user" ? last.content.filter((block): block is Extract<ModelBlock, { type: "tool_result" }> => block.type === "tool_result") : [];
      const content: ModelBlock[] = [];
      let index = 0;
      let output = 0;

      const streamText = async (kind: "thinking" | "text", body: string) => {
        const blockIndex = index++;
        onEvent({ type: "block_start", index: blockIndex, block: kind });
        for (const burst of bursts(body)) {
          await wait(kind === "thinking" ? 18 : 26 + (burst.length % 3) * 9, signal);
          onEvent({ type: kind === "thinking" ? "thinking_delta" : "text_delta", index: blockIndex, text: burst });
        }
        onEvent({ type: "block_stop", index: blockIndex });
        content.push(kind === "thinking" ? { type: "thinking", thinking: body, signature: "fixture" } : { type: "text", text: body });
        output += body.length;
      };

      let stopReason: ModelTurnResult["stopReason"] = "end_turn";
      if (results.length) {
        const previous = request.messages.at(-2);
        const uses = previous?.role === "assistant" ? previous.content.filter((block): block is Extract<ModelBlock, { type: "tool_use" }> => block.type === "tool_use") : [];
        const outputs: ToolOutput[] = uses.map((use, position) => ({ name: use.name, input: (use.input ?? {}) as Record<string, unknown>, data: parse(results[position]?.content ?? "{}"), isError: Boolean(results[position]?.is_error) }));
        const answers = outputs.filter((item) => item.name !== "open_screen").map((item) => answerFor(item, lang, question));
        await wait(260, signal);
        await streamText("text", answers.join("\n\n") || (lang === "ar" ? "إليك الرابط." : "Here's the link."));
      } else {
        const planned = request.toolChoice === "auto" ? plan(question, attachedOf(turn), lang) : undefined;
        await wait(380, signal);
        if (planned) {
          await streamText("thinking", planned.note);
          planned.calls.forEach((call, position) => {
            const blockIndex = index++;
            onEvent({ type: "block_start", index: blockIndex, block: "tool_use", name: call.name });
            onEvent({ type: "block_stop", index: blockIndex });
            content.push({ type: "tool_use", id: `toolu_fx_${request.messages.length}_${position}`, name: call.name, input: call.input });
          });
          stopReason = "tool_use";
        } else {
          await streamText("text", overview(lang, /^(hi|hello|hey|مرحبا|مرحبًا|أهلا|أهلًا|السلام)/i.test(question.trim())));
        }
      }
      const input = request.messages.reduce((sum, message) => sum + JSON.stringify(message.content).length, request.system.length);
      return { content, stopReason, usage: { inputTokens: Math.ceil(input / 4), cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: Math.ceil(output / 4) } };
    },
  };
}
