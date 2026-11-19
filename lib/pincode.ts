import type { IndianState } from "@/lib/india";

/**
 * Pincode → state (Phase 28), from India Post's published pincode ranges — no outside service.
 * Used to fill in the State on address forms; the customer can still change it.
 *
 * Only answers when the first digits belong to ONE state. Where a range is shared (e.g. 813 is
 * partly Bihar, partly Jharkhand; 605 is Tamil Nadu and Puducherry) it returns null and the
 * customer picks the state as before — a wrong guess would be worse than none.
 */
const BY_3: Record<string, IndianState | null> = {
  "160": "Chandigarh",
  "194": "Ladakh",
  // Uttarakhand inside the Uttar Pradesh range (20–28); shared prefixes left out.
  "244": null,
  "246": null,
  "247": null,
  "248": "Uttarakhand",
  "249": "Uttarakhand",
  "262": null,
  "263": "Uttarakhand",
  "362": null, // Gujarat / Diu
  "396": null, // Gujarat / Dadra and Nagar Haveli and Daman
  "403": "Goa",
  "533": null, // Andhra Pradesh / Yanam (Puducherry)
  "605": null, // Tamil Nadu / Puducherry
  "609": null, // Tamil Nadu / Karaikal (Puducherry)
  "673": null, // Kerala / Mahe (Puducherry)
  "682": null, // Kerala / Lakshadweep
  "737": "Sikkim",
  "744": "Andaman and Nicobar Islands",
  "790": "Arunachal Pradesh",
  "791": "Arunachal Pradesh",
  "792": "Arunachal Pradesh",
  "793": "Meghalaya",
  "794": "Meghalaya",
  "795": "Manipur",
  "796": "Mizoram",
  "797": "Nagaland",
  "798": "Nagaland",
  "799": "Tripura",
  // Jharkhand inside the Bihar range (80–85).
  "813": null,
  "814": "Jharkhand",
  "815": "Jharkhand",
  "816": "Jharkhand",
  "822": "Jharkhand",
  "825": "Jharkhand",
  "826": "Jharkhand",
  "827": "Jharkhand",
  "828": "Jharkhand",
  "829": "Jharkhand",
  "831": "Jharkhand",
  "832": "Jharkhand",
  "833": "Jharkhand",
  "834": "Jharkhand",
  "835": "Jharkhand",
};

const BY_2: Record<string, IndianState> = {
  "11": "Delhi",
  "12": "Haryana",
  "13": "Haryana",
  "14": "Punjab",
  "15": "Punjab",
  "16": "Punjab",
  "17": "Himachal Pradesh",
  "18": "Jammu and Kashmir",
  "19": "Jammu and Kashmir",
  ...Object.fromEntries(
    ["20", "21", "22", "23", "24", "25", "26", "27", "28"].map((p) => [p, "Uttar Pradesh"]),
  ),
  ...Object.fromEntries(["30", "31", "32", "33", "34"].map((p) => [p, "Rajasthan"])),
  ...Object.fromEntries(["36", "37", "38", "39"].map((p) => [p, "Gujarat"])),
  ...Object.fromEntries(["40", "41", "42", "43", "44"].map((p) => [p, "Maharashtra"])),
  ...Object.fromEntries(["45", "46", "47", "48"].map((p) => [p, "Madhya Pradesh"])),
  "49": "Chhattisgarh",
  "50": "Telangana",
  "51": "Andhra Pradesh",
  "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  ...Object.fromEntries(["56", "57", "58", "59"].map((p) => [p, "Karnataka"])),
  ...Object.fromEntries(["60", "61", "62", "63", "64"].map((p) => [p, "Tamil Nadu"])),
  "67": "Kerala",
  "68": "Kerala",
  "69": "Kerala",
  ...Object.fromEntries(["70", "71", "72", "73", "74"].map((p) => [p, "West Bengal"])),
  "75": "Odisha",
  "76": "Odisha",
  "77": "Odisha",
  "78": "Assam",
  ...Object.fromEntries(["80", "81", "82", "83", "84", "85"].map((p) => [p, "Bihar"])),
};

/** "500001" → "Telangana"; null when unknown, shared between states, or not a 6-digit pincode. */
export function stateForPincode(pincode: string): IndianState | null {
  const pin = pincode.trim();
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  const three = pin.slice(0, 3);
  if (three in BY_3) return BY_3[three]!;
  return BY_2[pin.slice(0, 2)] ?? null;
}
