import type { StaleConnection } from "@/lib/data";
import { formatShortDate } from "@/lib/format";

/** Oldest first, so the date given is the earliest anything could be missing from. */
export function staleSentence(connections: StaleConnection[]): string {
  const ordered = [...connections].sort((a, b) =>
    (a.lastSuccessAt ?? "").localeCompare(b.lastSuccessAt ?? ""),
  );
  const names = ordered.map((item) => item.institution);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
      : names[0];
  const since = ordered[0]?.lastSuccessAt;
  return since
    ? `${list} ${names.length > 1 ? "haven't" : "hasn't"} updated since ${formatShortDate(since)}, so spending after that is missing.`
    : `${list} ${names.length > 1 ? "aren't" : "isn't"} updating, so some spending is missing.`;
}
