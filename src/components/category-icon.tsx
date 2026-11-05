import { createElement } from "react";

import { categoryIcon } from "@/lib/category-icons";

export function CategoryIcon({
  category,
  detailed,
  className,
}: {
  category: string | null | undefined;
  detailed?: string | null;
  className?: string;
}) {
  return createElement(categoryIcon(category, detailed), {
    className,
    strokeWidth: 1.8,
    "aria-hidden": true,
  });
}
