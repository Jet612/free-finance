import { cn } from "@/lib/utils";

export type Segment = { key: string; label: string; value: number; color: string };

const MIN_LABEL_SHARE = 9;

/** One whole split into parts. Six parts at most; fold the rest into Other first. */
export function SegmentBar({
  segments,
  format,
  ariaLabel,
  className,
}: {
  segments: Segment[];
  format: (value: number) => string;
  ariaLabel: string;
  className?: string;
}) {
  const total = segments.reduce((sum, item) => sum + Math.max(item.value, 0), 0);
  if (total <= 0) return null;
  const parts = segments.filter((item) => item.value > 0);

  return (
    <div className={className}>
      <div
        role="img"
        aria-label={`${ariaLabel}: ${parts
          .map(
            (item) =>
              `${item.label} ${format(item.value)}, ${Math.round((item.value / total) * 100)}%`,
          )
          .join("; ")}`}
        className="flex h-7 gap-0.5"
      >
        {parts.map((item) => {
          const share = (item.value / total) * 100;
          return (
            <span
              key={item.key}
              title={`${item.label}, ${Math.round(share)}%`}
              className="flex min-w-1 items-center rounded-[4px] pl-2 text-xs font-semibold"
              style={{ width: `${share}%`, background: item.color, color: item.color.replace(")", "-ink)") }}
            >
              {share >= MIN_LABEL_SHARE && `${Math.round(share)}%`}
            </span>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.8125rem] text-muted-foreground">
        {parts.map((item) => (
          <li key={item.key} className={cn("flex items-center gap-1.5")}>
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
