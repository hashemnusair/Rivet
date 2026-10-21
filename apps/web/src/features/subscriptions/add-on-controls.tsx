"use client";

import { ADD_ON_CATALOGUE, applyAddOns, validateAddOns, type AddOnKey, type SubscriptionAddOns } from "../../../convex/subscriptionAddOns";
import { findPlan } from "../../../convex/planCatalogue";
import { useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import { money } from "@/lib/utils/money";

export function AddOnSummary({ value }: { value?: SubscriptionAddOns }) {
  const t = useT();
  const f = useFormat();
  const addons = validateAddOns(value, "Basic");
  const allowance = applyAddOns(findPlan("Basic")!, addons);
  return <div className="grid gap-2 text-[12.5px] text-ink-2" data-testid="add-on-summary">
    <ul className="grid gap-1">{ADD_ON_CATALOGUE.filter(item => addons[item.key] > 0).map(item => <li key={item.key}>{t("platformFinance.addOns.line", { name: t(`platformFinance.addOns.${item.key}`), quantity: f.number(addons[item.key]) })}</li>)}</ul>
    <p>{t("platformFinance.addOns.allowance", { branches: f.number(allowance.branches), members: f.number(allowance.members), staff: f.number(allowance.staff), emails: f.number(allowance.operationalEmails) })}</p>
  </div>;
}

export function AddOnControls({ value, onChange }: { value: SubscriptionAddOns; onChange: (value: SubscriptionAddOns) => void }) {
  const t = useT();
  const f = useFormat();
  const update = (key: AddOnKey, quantity: number) => {
    const next = { ...value, [key]: quantity };
    if (key === "reporting" && quantity) { next.finance = 1; next.operations = 1; }
    if (key === "finance" && quantity) next.operations = 1;
    if (key === "operations" && !quantity) { next.finance = 0; next.reporting = 0; }
    if (key === "finance" && !quantity) next.reporting = 0;
    onChange(next);
  };
  return <fieldset className="grid gap-3 rounded-md border border-line p-4">
    <legend className="px-1 text-[13px] font-semibold">{t("platformFinance.addOns.title")}</legend>
    <p className="text-[12px] leading-5 text-ink-3">{t("platformFinance.addOns.description")}</p>
    {ADD_ON_CATALOGUE.map(item => <label key={item.key} className="flex items-center justify-between gap-3 text-[12.5px]">
      <span>{t(`platformFinance.addOns.${item.key}`)}<span className="block text-[11.5px] text-ink-3">{t("platformFinance.addOns.monthly", { amount: f.money(money(item.priceMinor, "JOD")) })}</span></span>
      <select aria-label={t("platformFinance.addOns.quantity", { name: t(`platformFinance.addOns.${item.key}`) })} value={value[item.key]} onChange={event => update(item.key, Number(event.target.value))} className="rounded border border-line bg-paper px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2">
        {Array.from({ length: item.max + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{f.number(quantity)}</option>)}
      </select>
    </label>)}
    <p className="text-[12px] text-ink-3">{t("platformFinance.addOns.dependencies")}</p>
    <AddOnSummary value={value} />
    <p className="text-[12px] font-medium">{t("platformFinance.addOns.limits")}</p>
  </fieldset>;
}
