import { cn } from "@/lib/utils";

/**
 * A guilloché rosette, the interlaced ring printed on banknotes and stock
 * certificates. Built from rotated ellipses so it stays crisp at any size.
 */
export function Seal({
  className,
  rings = 9,
  strokeWidth = 1.1,
}: {
  className?: string;
  rings?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
    >
      {Array.from({ length: rings }, (_, index) => (
        <ellipse
          key={index}
          cx="50"
          cy="50"
          rx="47"
          ry="19"
          transform={`rotate(${(index * 180) / rings} 50 50)`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function Brand({
  compact = false,
  name = "Free Finance",
  onNote = false,
}: {
  compact?: boolean;
  name?: string;
  onNote?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Seal className={cn("size-7", onNote ? "text-note-foreground" : "text-primary")} />
      {!compact && (
        <span className="semiwide text-[0.9375rem] font-semibold tracking-tight">
          {name}
        </span>
      )}
    </span>
  );
}
