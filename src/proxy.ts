import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

function safeOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.origin : null;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(nonce: string, supabaseOrigin: string) {
  const development = process.env.NODE_ENV === "development";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    // Recharts and React use style attributes; scripts still use a strict nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  if (!development) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const supabaseOrigin = safeOrigin(url) ?? "https://invalid.local";
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, supabaseOrigin);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (url && key) {
    const supabase = createServerClient(url, key, {
      auth: {
        experimental: { passkey: true },
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(cacheHeaders).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    });

    // This validates and refreshes the cookie-backed session when needed.
    await supabase.auth.getClaims();
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "private, no-store");
  if (request.cookies.has("free_finance_session")) {
    // Remove cookies created by releases before the Supabase Auth migration.
    response.cookies.set("free_finance_session", "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      source:
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
