import "server-only";
import { env } from "@/lib/env";
import { open, seal } from "@/lib/secret-box";

/**
 * Field-level encryption for customers' phone numbers and addresses (Phase 27).
 *
 * Stored as "pii:v1:<AES-256-GCM sealed text>". A copy of the database (a leaked backup, a
 * support export) shows no addresses or phone numbers without the key.
 *
 * - Key: PII_ENCRYPTION_KEY; if unset, derived from AUTH_SECRET (works, but then AUTH_SECRET
 *   must never change without re-encrypting — Admin → System warns about it).
 * - Rotation: put the old key in PII_PREVIOUS_KEY and the new one in PII_ENCRYPTION_KEY; reading
 *   tries both; `npm run pii:encrypt` re-encrypts everything with the new key.
 * - Values written before encryption existed are plain text: they're read as-is and encrypted by
 *   the same script. So turning this on never makes existing data unreadable.
 */
const PREFIX = "pii:v1:";
const PURPOSE = "pii";

function currentKey(): string {
  return env.PII_ENCRYPTION_KEY ?? `derived-from-auth-secret:${env.AUTH_SECRET}`;
}

export function piiKeyIsDedicated(): boolean {
  return Boolean(env.PII_ENCRYPTION_KEY);
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/** Encrypts a value (null/empty stay as they are; already-encrypted values aren't wrapped twice). */
export function encryptPii<T extends string | null | undefined>(value: T): T {
  if (value === null || value === undefined || value === "" || isEncrypted(value)) return value;
  return `${PREFIX}${seal(value, currentKey(), PURPOSE)}` as T;
}

/** Reads a value written by encryptPii — or a legacy plain-text value, returned unchanged. */
export function decryptPii<T extends string | null | undefined>(value: T): T {
  if (!isEncrypted(value)) return value;
  const sealed = (value as string).slice(PREFIX.length);
  const keys = [currentKey()];
  if (env.PII_PREVIOUS_KEY) keys.push(env.PII_PREVIOUS_KEY);
  if (env.PII_ENCRYPTION_KEY) keys.push(`derived-from-auth-secret:${env.AUTH_SECRET}`);
  for (const k of keys) {
    try {
      return open(sealed, k, PURPOSE) as T;
    } catch {
      /* try the next key */
    }
  }
  throw new Error("A stored phone number or address can't be decrypted with the configured keys.");
}

/** Needs re-encrypting with the current key (plain text, or sealed with an older key)? */
export function needsReencrypt(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (!isEncrypted(value)) return true;
  try {
    open(value.slice(PREFIX.length), currentKey(), PURPOSE);
    return false;
  } catch {
    return true;
  }
}

/** The address fields that are encrypted (Address rows, order address snapshots, OTP phones). */
export const PII_ADDRESS_FIELDS = ["fullName", "phone", "line1", "line2", "landmark"] as const;

type WithFields = Partial<Record<(typeof PII_ADDRESS_FIELDS)[number], string | null>>;

export function encryptAddress<T extends WithFields>(a: T): T {
  const out = { ...a };
  for (const f of PII_ADDRESS_FIELDS)
    if (f in out) (out as WithFields)[f] = encryptPii((out as WithFields)[f]);
  return out;
}

export function decryptAddress<T extends WithFields>(a: T): T {
  const out = { ...a };
  for (const f of PII_ADDRESS_FIELDS)
    if (f in out) (out as WithFields)[f] = decryptPii((out as WithFields)[f]);
  return out;
}
