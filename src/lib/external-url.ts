const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * Plaid sometimes returns merchant websites as bare domains. Promote those to
 * HTTPS, but never allow another explicit scheme or embedded credentials.
 */
export function safeMerchantWebsite(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (URL_SCHEME.test(trimmed) && !trimmed.toLowerCase().startsWith("https:")) {
    return null;
  }

  try {
    const url = new URL(
      trimmed.toLowerCase().startsWith("https:")
        ? trimmed
        : `https://${trimmed}`,
    );
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Images are more sensitive than user-clicked links because browsers load them
 * automatically. Only Plaid's documented merchant-logo CDN is accepted.
 */
export function safePlaidLogoUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "plaid-merchant-logos.plaid.com" ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function websiteHostname(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "Merchant website";
  }
}
