import { describe, expect, it } from "vitest";
import { INDIAN_STATES } from "@/lib/india";
import { stateForPincode } from "@/lib/pincode";

describe("stateForPincode", () => {
  it.each([
    ["500001", "Telangana"],
    ["110001", "Delhi"],
    ["400001", "Maharashtra"],
    ["403001", "Goa"],
    ["560001", "Karnataka"],
    ["600001", "Tamil Nadu"],
    ["700001", "West Bengal"],
    ["737101", "Sikkim"],
    ["160017", "Chandigarh"],
    ["194101", "Ladakh"],
    ["248001", "Uttarakhand"],
    ["834001", "Jharkhand"],
    ["800001", "Bihar"],
    ["781001", "Assam"],
    ["799001", "Tripura"],
    ["530001", "Andhra Pradesh"],
    ["682001", null], // Kerala / Lakshadweep share 682
    ["605001", null], // Tamil Nadu / Puducherry share 605
    ["813210", null], // Bihar / Jharkhand share 813
    ["900001", null], // army post offices — no state
    ["012345", null],
    ["50000", null],
    ["50000a", null],
  ])("%s → %s", (pin, state) => {
    expect(stateForPincode(pin)).toBe(state);
  });

  it("only ever answers with a state from the address form's list", () => {
    for (let p = 100; p <= 999; p++) {
      const s = stateForPincode(`${p}001`);
      if (s) expect(INDIAN_STATES).toContain(s);
    }
  });
});
