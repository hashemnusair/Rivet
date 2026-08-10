import type { ExperienceStatus } from "@/lib/providers/experience-provider";

export function refreshFailureState(hadRenderedData: boolean, message: string): {
  status: ExperienceStatus;
  message: string;
  showStaleNotice: boolean;
} {
  return {
    status: hadRenderedData ? "ready" : "error",
    message,
    showStaleNotice: hadRenderedData,
  };
}
