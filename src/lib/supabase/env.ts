export function parseSupabasePublicUrl(value: string | undefined) {
  if (!value) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  const loopback =
    parsedUrl.hostname === "localhost" ||
    parsedUrl.hostname === "127.0.0.1" ||
    parsedUrl.hostname === "[::1]";
  const secureProtocol =
    parsedUrl.protocol === "https:" ||
    (loopback && parsedUrl.protocol === "http:");
  if (
    !secureProtocol ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    return null;
  }
  return parsedUrl.origin;
}

export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required.",
    );
  }

  const parsedUrl = parseSupabasePublicUrl(url);
  if (!parsedUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be credential-free HTTPS (or loopback HTTP).",
    );
  }

  return { url: parsedUrl, publishableKey };
}
