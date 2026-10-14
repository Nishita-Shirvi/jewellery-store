import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "@/lib/report/csv";
import { dayRange, istDay, istMidnight, istWeekStart } from "@/lib/report/dates";

describe("CSV export safety", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvRow(["a,b", 'say "hi"', "line\nbreak", null, 12.5])).toBe(
      '"a,b","say ""hi""","line\nbreak",,12.5\r\n',
    );
  });
  it("neutralises spreadsheet formulas (CSV injection)", () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+91 98765")).toBe("'+91 98765");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-1200.50")).toBe("-1200.50"); // real negative numbers stay numbers
  });
});

describe("India-time report dates", () => {
  it("buckets by the Indian calendar day", () => {
    expect(istDay(new Date("2026-10-10T18:29:00Z"))).toBe("2026-10-10"); // 23:59 IST
    expect(istDay(new Date("2026-10-10T18:31:00Z"))).toBe("2026-10-11"); // 00:01 IST
  });
  it("midnight and weeks", () => {
    expect(istMidnight(0, new Date("2026-10-11T10:00:00Z")).toISOString()).toBe(
      "2026-10-10T18:30:00.000Z",
    );
    expect(istWeekStart(new Date("2026-10-11T10:00:00Z"))).toBe("2026-10-05"); // Sunday → Monday before
    expect(istWeekStart(new Date("2026-10-12T10:00:00Z"))).toBe("2026-10-12");
  });
  it("lists every day in a range", () => {
    expect(
      dayRange(new Date("2026-10-08T00:00:00+05:30"), new Date("2026-10-11T10:00:00+05:30")),
    ).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  });
});
