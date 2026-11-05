import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";
const KEY_SALT = "free-finance:plaid-access-token:v1";
const IV_BYTES = 12;

/** The saved token can't be opened, which means CRON_SECRET has changed. */
export class TokenUnreadableError extends Error {
  constructor() {
    super("The saved bank token can't be decrypted.");
    this.name = "TokenUnreadableError";
  }
}

let cachedKey: { secret: string; key: Buffer } | undefined;

/**
 * The secret is a password a person typed into a form, so it goes through a
 * deliberately slow KDF rather than being used as key material directly.
 */
function deriveKey(secret: string): Buffer {
  if (cachedKey?.secret === secret) return cachedKey.key;
  const key = scryptSync(secret, KEY_SALT, 32, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  cachedKey = { secret, key };
  return key;
}

/**
 * AES-256-GCM. `context` is bound as additional authenticated data, so a
 * ciphertext copied onto a different database row refuses to decrypt.
 */
export function encryptToken(
  plaintext: string,
  secret: string,
  context: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(
  encrypted: string,
  secret: string,
  context: string,
): string {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new TokenUnreadableError();
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveKey(secret),
      Buffer.from(iv, "base64url"),
    );
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new TokenUnreadableError();
  }
}

/** Hashing first gives both inputs one length, which timingSafeEqual needs. */
export function secretsMatch(
  candidate: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!candidate || !expected) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(expected));
}
