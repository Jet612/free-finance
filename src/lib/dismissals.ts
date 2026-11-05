export const DISMISSED_COOKIE = "ff_dismissed";

/** Enough for a good while of alerts, while staying well inside a cookie. */
const MAX_REMEMBERED = 40;

export function parseDismissed(value: string | undefined): string[] {
  return value ? decodeURIComponent(value).split("|").filter(Boolean) : [];
}

/** Runs in the browser. A cookie, so a dismissed alert never flashes back in. */
export function rememberDismissed(ids: string[]) {
  const value = encodeURIComponent(ids.slice(-MAX_REMEMBERED).join("|"));
  document.cookie = `${DISMISSED_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}
