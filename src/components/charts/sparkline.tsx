import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 28;

/** A small trend line. The stroke stays even however wide it's stretched. */
export function Sparkline({
  values,
  className,
  color = "var(--muted-foreground)",
}: {
  values: number[];
  className?: string;
  color?: string;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH;
      const y = HEIGHT - 3 - ((value - min) / range) * (HEIGHT - 6);
      return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join("");

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-7 w-20", className)}
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Six months of a category as small columns, with the current month solid. */
export function MiniBars({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <span aria-hidden="true" className={cn("flex h-6 items-end gap-0.5", className)}>
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            "w-1.5 rounded-t-[2px]",
            index === values.length - 1 ? "bg-foreground" : "bg-foreground/25",
          )}
          style={{ height: `${Math.max((value / max) * 100, value > 0 ? 8 : 3)}%` }}
        />
      ))}
    </span>
  );
}
