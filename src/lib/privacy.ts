export const HIDE_AMOUNTS_COOKIE = "ff_hide_amounts";

/** Blurs every amount at once. Runs in the browser only. */
export function setAmountsHidden(hidden: boolean) {
  if (hidden) document.documentElement.setAttribute("data-hide-amounts", "true");
  else document.documentElement.removeAttribute("data-hide-amounts");
  document.cookie = `${HIDE_AMOUNTS_COOKIE}=${hidden ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
}

export function amountsHidden() {
  return document.documentElement.getAttribute("data-hide-amounts") === "true";
}
