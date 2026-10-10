/** Shiprocket dates come as "2026-10-09 14:05:00" or "09 10 2026 14:05:00", in India time. */
export function parseShiprocketDate(value: string | null | undefined, fallback: Date): Date {
  if (!value) return fallback;
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+05:30`);
  m = /^(\d{2})[ -](\d{2})[ -](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+05:30`);
  return fallback;
}
