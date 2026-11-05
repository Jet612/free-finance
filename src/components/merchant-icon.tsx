"use client";

import Image from "next/image";
import { useState } from "react";

import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";

export function MerchantIcon({
  src,
  category,
  categoryDetailed,
  incoming = false,
  large = false,
}: {
  src?: string | null;
  category: string | null;
  categoryDetailed?: string | null;
  incoming?: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const pixels = large ? 44 : 34;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-secondary-foreground",
        large ? "size-11" : "size-[34px]",
        incoming && "bg-positive/12 text-positive",
      )}
    >
      {src && !failed ? (
        <Image
          src={src}
          alt=""
          width={pixels}
          height={pixels}
          sizes={`${pixels}px`}
          className="size-full bg-card object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <CategoryIcon
          category={category}
          detailed={categoryDetailed}
          className={large ? "size-5" : "size-4"}
        />
      )}
    </span>
  );
}
