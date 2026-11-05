"use client";

import { type KeyboardEvent, type PointerEvent, useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type ChartSeries = {
  key: string;
  label: string;
  /** CSS color for the line. */
  color: string;
  values: (number | null)[];
  /** Only this series gets the end marker and, when engraved, the echo lines. */
  primary?: boolean;
  /** Shown as a quieter reference line. */
  subdued?: boolean;
};

const WIDTH = 1000;
const ECHO_LINES = 16;
const MAX_TABLE_ROWS = 13;

function niceStep(range: number, ticks: number): number {
  const rough = range / Math.max(ticks, 1);
  const power = 10 ** Math.floor(Math.log10(rough || 1));
  const scaled = rough / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

/** Softens spikes, so the echoes under a jagged line stay fine and even. */
function smoothed(values: (number | null)[], radius: number): (number | null)[] {
  return values.map((value, index) => {
    if (value === null) return null;
    const nearby = values
      .slice(Math.max(index - radius, 0), index + radius + 1)
      .filter((item): item is number => item !== null);
    return nearby.reduce((sum, item) => sum + item, 0) / nearby.length;
  });
}

function buildPath(
  values: (number | null)[],
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
    drawing = true;
  });
  return path;
}

/**
 * A line chart that renders on the server with no layout shift: the SVG stretches
 * to fit, strokes stay a constant weight, and all text is ordinary HTML laid over
 * it. Hover, arrow keys, and a hidden table all reach the same values.
 */
export function TimeChart({
  labels,
  series,
  height = 240,
  heightClassName,
  zeroBaseline = false,
  minSpan = 0,
  engraved = false,
  onNote = false,
  formatValue,
  formatTick,
  formatLabel,
  ariaLabel,
  xTicks,
  maxTicks = 4,
  className,
}: {
  /** One per data point, used for the tooltip and the x-axis. */
  labels: string[];
  series: ChartSeries[];
  height?: number;
  /** Tailwind height classes, for a chart that changes height across screens. */
  heightClassName?: string;
  zeroBaseline?: boolean;
  /** The least the y-axis may cover, as a share of the value, so tiny moves look tiny. */
  minSpan?: number;
  /** Fills under the primary line with fine lines echoing its shape. */
  engraved?: boolean;
  /** Set when the chart sits on the dark note panel. */
  onNote?: boolean;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  formatLabel: (label: string) => string;
  ariaLabel: string;
  /** Indexes to label along the bottom. Defaults to the first and last. */
  xTicks?: number[];
  maxTicks?: number;
  className?: string;
}) {
  const id = useId();
  const area = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const count = labels.length;

  const scale = useMemo(() => {
    const all = series.flatMap((item) =>
      item.values.filter((value): value is number => value !== null),
    );
    let min = zeroBaseline ? Math.min(0, ...all) : Math.min(...all);
    let max = Math.max(...all);
    const wanted = Math.abs(max) * minSpan;
    if (max - min < wanted) {
      const middle = (max + min) / 2;
      min = middle - wanted / 2;
      max = middle + wanted / 2;
    }
    const padding = zeroBaseline ? 0 : (max - min || Math.abs(max) || 1) * 0.12;
    const step = niceStep(max - min + padding * 2 || 1, maxTicks);
    const low = Math.floor((min - padding) / step) * step;
    const high = Math.ceil((max + padding * 0.6) / step) * step;
    const ticks: number[] = [];
    for (let tick = low; tick <= high + step / 2; tick += step) ticks.push(tick);
    return { low, high, ticks };
  }, [maxTicks, minSpan, series, zeroBaseline]);

  if (!count || !series.some((item) => item.values.some((value) => value !== null))) {
    return null;
  }

  const x = (index: number) => (count > 1 ? (index / (count - 1)) * WIDTH : WIDTH / 2);
  const y = (value: number) =>
    height - ((value - scale.low) / (scale.high - scale.low || 1)) * height;
  const percentX = (index: number) => (x(index) / WIDTH) * 100;
  const percentY = (value: number) => (y(value) / height) * 100;

  const primary = series.find((item) => item.primary) ?? series[0];
  const echoSource = engraved
    ? smoothed(primary.values, Math.max(1, Math.round(count / 30)))
    : [];
  const lastIndex = primary.values.findLastIndex((value) => value !== null);
  const lastValue = primary.values[lastIndex];
  const tickIndexes = xTicks ?? (count > 1 ? [0, count - 1] : [0]);
  const gridColor = onNote ? "oklch(1 0 0 / 12%)" : "var(--border)";
  // The data can shrink while a point is highlighted, such as on a range change.
  const shown = active !== null && active < count ? active : null;

  function pick(event: PointerEvent<HTMLDivElement>) {
    const box = area.current?.getBoundingClientRect();
    if (!box?.width) return;
    const ratio = Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1);
    setActive(Math.round(ratio * (count - 1)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    setActive((current) =>
      Math.min(Math.max((current ?? (step > 0 ? -1 : count)) + step, 0), count - 1),
    );
  }

  const tableStep = Math.max(1, Math.ceil(count / MAX_TABLE_ROWS));
  const tableRows = labels
    .map((label, index) => ({ label, index }))
    .filter(({ index }) => index % tableStep === 0 || index === count - 1);

  return (
    <figure className={cn("relative m-0", className)}>
      <div
        className={cn("relative pr-12 sm:pr-14", heightClassName)}
        style={heightClassName ? undefined : { height }}
      >
        {scale.ticks.map((tick) => (
          <span
            key={tick}
            aria-hidden="true"
            className={cn(
              "money tnum absolute right-0 -translate-y-1/2 text-xs",
              onNote ? "text-note-muted" : "text-muted-foreground",
            )}
            style={{ top: `${percentY(tick)}%` }}
          >
            {formatTick(tick)}
          </span>
        ))}

        <div
          ref={area}
          tabIndex={0}
          role="group"
          aria-label={`${ariaLabel}. Use the left and right arrow keys to read each point.`}
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(event) => {
            // A finger lifting isn't leaving: the reading stays until the next tap.
            if (event.pointerType !== "touch") setActive(null);
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className={cn(
            "relative h-full touch-pan-y rounded-sm outline-offset-4",
            onNote && "focus-visible:outline-note-foreground",
          )}
        >
          <svg
            viewBox={`0 0 ${WIDTH} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 size-full overflow-visible"
          >
            {scale.ticks.map((tick) => (
              <line
                key={tick}
                x1="0"
                x2={WIDTH}
                y1={y(tick)}
                y2={y(tick)}
                stroke={gridColor}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}

            {engraved && (
              <>
                <clipPath id={`${id}-plot`}>
                  <rect x="0" y="0" width={WIDTH} height={height} />
                </clipPath>
                <g clipPath={`url(#${id}-plot)`}>
                  {Array.from({ length: ECHO_LINES }, (_, index) => {
                    // Each line sits a step closer to the baseline, so the shape
                    // relaxes toward flat the way engraved shading does.
                    const step = (index + 1) / (ECHO_LINES + 1);
                    return (
                      <path
                        key={index}
                        d={buildPath(echoSource, x, (value) => y(value) + (height - y(value)) * step)}
                        fill="none"
                        stroke="var(--note-line)"
                        strokeWidth="1"
                        strokeOpacity={0.5 * (1 - step) ** 1.2}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </g>
              </>
            )}

            {series.map((item) => (
              <path
                key={item.key}
                d={buildPath(item.values, x, y)}
                fill="none"
                stroke={item.color}
                strokeWidth={item.subdued ? 1.5 : 2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {lastValue !== null && lastValue !== undefined && shown === null && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2",
                onNote ? "ring-note" : "ring-card",
              )}
              style={{
                left: `${percentX(lastIndex)}%`,
                top: `${percentY(lastValue)}%`,
                background: primary.color,
              }}
            />
          )}

          {shown !== null && (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-y-0 w-px",
                  onNote ? "bg-note-foreground/45" : "bg-foreground/35",
                )}
                style={{ left: `${percentX(shown)}%` }}
              />
              {series.map((item) => {
                const value = item.values[shown];
                return value === null || value === undefined ? null : (
                  <span
                    key={item.key}
                    aria-hidden="true"
                    className={cn(
                      "pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2",
                      onNote ? "ring-note" : "ring-card",
                    )}
                    style={{
                      left: `${percentX(shown)}%`,
                      top: `${percentY(value)}%`,
                      background: item.color,
                    }}
                  />
                );
              })}
              <div
                className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-lg"
                style={
                  percentX(shown) > 62
                    ? { right: `calc(${100 - percentX(shown)}% + 10px)` }
                    : { left: `calc(${percentX(shown)}% + 10px)` }
                }
              >
                <p className="text-xs text-muted-foreground">
                  {formatLabel(labels[shown])}
                </p>
                {series.map((item) => {
                  const value = item.values[shown];
                  return value === null || value === undefined ? null : (
                    <p
                      key={item.key}
                      className="mt-1 flex items-center justify-between gap-5 text-sm"
                    >
                      <span className="money tnum font-semibold">
                        {formatValue(value)}
                      </span>
                      {series.length > 1 && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span
                            aria-hidden="true"
                            className="h-0.5 w-3 rounded-full"
                            style={{ background: item.color }}
                          />
                          {item.label}
                        </span>
                      )}
                    </p>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-1.5 mr-12 h-4 sm:mr-14" aria-hidden="true">
        {tickIndexes.map((index, position) => (
          <span
            key={index}
            className={cn(
              "absolute whitespace-nowrap text-xs",
              onNote ? "text-note-muted" : "text-muted-foreground",
              position === 0
                ? "left-0"
                : position === tickIndexes.length - 1
                  ? "right-0"
                  : "-translate-x-1/2",
            )}
            style={
              position === 0 || position === tickIndexes.length - 1
                ? undefined
                : { left: `${percentX(index)}%` }
            }
          >
            {formatLabel(labels[index])}
          </span>
        ))}
      </div>

      <p aria-live="polite" className="sr-only">
        {shown === null
          ? ""
          : `${formatLabel(labels[shown])}: ${series
              .flatMap((item) => {
                const value = item.values[shown];
                return value === null || value === undefined
                  ? []
                  : [`${item.label} ${formatValue(value)}`];
              })
              .join(", ")}`}
      </p>
      {/* A table ignores the 1px width of sr-only, so a wrapper has to hold it. */}
      <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((item) => (
              <th key={item.key} scope="col">
                {item.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableRows.map(({ label, index }) => (
            <tr key={label}>
              <th scope="row">{formatLabel(label)}</th>
              {series.map((item) => {
                const value = item.values[index];
                return (
                  <td key={item.key}>
                    {value === null || value === undefined ? "None" : formatValue(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
