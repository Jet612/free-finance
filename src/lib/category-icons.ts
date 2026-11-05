import {
  ArrowRightLeft,
  Banknote,
  BriefcaseBusiness,
  CarFront,
  CircleDollarSign,
  Clapperboard,
  Coffee,
  Fuel,
  HandHeart,
  HeartPulse,
  House,
  type LucideIcon,
  Plane,
  ReceiptText,
  Scissors,
  ShoppingBag,
  ShoppingBasket,
  Tag,
  Utensils,
  Wrench,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  RENT_AND_UTILITIES: House,
  FOOD_AND_DRINK: Utensils,
  TRANSPORTATION: CarFront,
  GENERAL_MERCHANDISE: ShoppingBag,
  ENTERTAINMENT: Clapperboard,
  TRAVEL: Plane,
  MEDICAL: HeartPulse,
  PERSONAL_CARE: Scissors,
  GENERAL_SERVICES: BriefcaseBusiness,
  GOVERNMENT_AND_NON_PROFIT: HandHeart,
  HOME_IMPROVEMENT: Wrench,
  LOAN_PAYMENTS: CircleDollarSign,
  BANK_FEES: ReceiptText,
  INCOME: Banknote,
  TRANSFER_IN: ArrowRightLeft,
  TRANSFER_OUT: ArrowRightLeft,
};

export function categoryIcon(
  category: string | null | undefined,
  detailed?: string | null,
): LucideIcon {
  if (detailed?.includes("COFFEE")) return Coffee;
  if (detailed?.includes("GROCERIES")) return ShoppingBasket;
  if (detailed?.includes("GAS") && !detailed.includes("ELECTRIC")) return Fuel;
  return (category && ICONS[category]) || Tag;
}
