import type { TFunction } from "./core";

/** Code-owned public profile choices keep their persisted values. Unknown/user text stays verbatim. */
export function publicProfileLabel(t: TFunction, value: string): string {
  const labels: Record<string, string> = {
    "Gym": t("settingsPublic.gym"),
    "Strength & conditioning": t("settingsPublic.strength"),
    "Women-only fitness": t("settingsPublic.womenFitness"),
    "Combat sports": t("settingsPublic.combat"),
    "Wellness studio": t("settingsPublic.wellness"),
    "All members": t("settingsPublic.allMembers"),
    "Women": t("settingsPublic.women"),
    "Men": t("settingsPublic.men"),
    "Families": t("settingsPublic.families"),
    "Students": t("settingsPublic.students"),
    "Free weights": t("settingsPublic.weights"),
    "Cardio": t("settingsPublic.cardio"),
    "Showers": t("settingsPublic.showers"),
    "Parking": t("settingsPublic.parking"),
    "Group studio": t("settingsPublic.studio"),
    "Personal training": t("settingsPublic.pt")
  };
  return labels[value] ?? value;
}
