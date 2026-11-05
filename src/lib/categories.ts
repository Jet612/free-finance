const OTHER_COLOR = "var(--cat-other)";

/** Fixed per category, so a color always means the same thing on every page. */
const CATEGORIES: Record<string, { label: string; color: string }> = {
  RENT_AND_UTILITIES: { label: "Rent & utilities", color: "var(--cat-1)" },
  FOOD_AND_DRINK: { label: "Food & drink", color: "var(--cat-2)" },
  TRANSPORTATION: { label: "Transport", color: "var(--cat-3)" },
  GENERAL_MERCHANDISE: { label: "Shopping", color: "var(--cat-4)" },
  ENTERTAINMENT: { label: "Entertainment", color: "var(--cat-5)" },
  TRAVEL: { label: "Travel", color: "var(--cat-6)" },
  MEDICAL: { label: "Health", color: OTHER_COLOR },
  PERSONAL_CARE: { label: "Personal care", color: OTHER_COLOR },
  GENERAL_SERVICES: { label: "Services", color: OTHER_COLOR },
  GOVERNMENT_AND_NON_PROFIT: { label: "Government & charity", color: OTHER_COLOR },
  HOME_IMPROVEMENT: { label: "Home", color: OTHER_COLOR },
  LOAN_PAYMENTS: { label: "Loan payments", color: OTHER_COLOR },
  PAYMENT_APPS: { label: "Payment apps", color: OTHER_COLOR },
  BANK_FEES: { label: "Bank fees", color: OTHER_COLOR },
  INCOME: { label: "Income", color: OTHER_COLOR },
  TRANSFER_IN: { label: "Transfer in", color: OTHER_COLOR },
  TRANSFER_OUT: { label: "Transfer out", color: OTHER_COLOR },
  OTHER: { label: "Other", color: OTHER_COLOR },
};

/** Every category someone can file a transaction under, in label order. */
export const CATEGORY_CHOICES = Object.entries(CATEGORIES)
  .map(([value, { label }]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label));

function sentenceCase(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "Other";
  return CATEGORIES[value]?.label ?? sentenceCase(value);
}

export function categoryColor(value: string | null | undefined): string {
  return (value && CATEGORIES[value]?.color) || OTHER_COLOR;
}

/** "FOOD_AND_DRINK_GROCERIES" under "FOOD_AND_DRINK" reads as "Groceries". */
export function subcategoryLabel(
  detailed: string | null | undefined,
  primary: string | null | undefined,
): string {
  if (!detailed) return "Everything else";
  const short =
    primary && detailed.startsWith(`${primary}_`)
      ? detailed.slice(primary.length + 1)
      : detailed;
  return sentenceCase(short).replace(/\band\b/g, "&");
}
