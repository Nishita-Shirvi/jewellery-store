import { timingSafeEqual } from "node:crypto";

/** True only for "Authorization: Bearer <secret>" with the exact secret (constant-time compare). */
export function isAuthorizedCron(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorizationHeader?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorizationHeader.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
