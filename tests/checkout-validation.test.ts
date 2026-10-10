import { describe, expect, it } from "vitest";
import { addressSchema } from "@/lib/validation/checkout";

const valid = {
  fullName: "Priya Sharma",
  phone: "+91 98765 43210",
  line1: "Flat 4B, Lotus Residency, MG Road",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500081",
};

describe("addressSchema", () => {
  it("accepts a valid Indian address and cleans the phone number", () => {
    const parsed = addressSchema.parse(valid);
    expect(parsed.phone).toBe("9876543210");
    expect(parsed.line2).toBeUndefined();
  });
  it.each([
    ["phone", "12345"],
    ["phone", "5876543210"],
    ["pincode", "012345"],
    ["pincode", "50008"],
    ["state", "Atlantis"],
  ])("rejects bad %s %s", (field, value) => {
    expect(addressSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
  });
});
