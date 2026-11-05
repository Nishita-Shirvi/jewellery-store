/** CSV writer that is safe to open in Excel (pure, unit-tested). */

/** Quotes when needed, and neutralises formulas (=, +, -, @) so a cell can't run code in Excel. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}

/**
 * CSV reader (Phase 29: product import, settlement / remittance files). RFC 4180: quoted fields,
 * "" inside quotes, commas and line breaks in quoted fields, \r\n or \n, a UTF-8 BOM (Excel).
 * Returns rows of strings; blank lines are skipped.
 */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Rows as objects keyed by lower-cased, trimmed header names ("Entity ID" → "entity id"),
 * with the 1-based line number for error messages.
 */
export function csvRecords(text: string): { line: number; values: Record<string, string> }[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase());
  return rows.map((r, i) => ({
    line: i + 2,
    values: Object.fromEntries(keys.map((k, j) => [k, (r[j] ?? "").trim()])),
  }));
}
