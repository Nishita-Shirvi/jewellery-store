/** Date → "YYYY-MM-DDTHH:mm" in India time, for <input type="datetime-local">. */
export function toIstInput(date: Date | null): string {
  if (!date) return "";
  return new Date(date.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16);
}
