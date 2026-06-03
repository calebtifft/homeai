import type { LanguageId } from "../constants/languages";
import type { SubscriptionPlanId } from "../constants/subscriptionPlans";
import type { StringKey } from "../locales/strings";

export function formatSubscriptionDate(
  iso: string,
  languageId: LanguageId
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(languageId, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function proModalTitleKey(planId: SubscriptionPlanId): StringKey {
  if (planId === "lifetime") return "pro.modalTitleLifetime";
  if (planId === "week") return "pro.modalTitleWeek";
  return "pro.modalTitleYear";
}
