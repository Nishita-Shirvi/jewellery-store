import "server-only";
import type { Address } from "@prisma/client";
import { db } from "@/lib/db";
import type { AddressInput } from "@/lib/validation/checkout";

const MAX_ADDRESSES = 20;

export async function listAddresses(userId: string): Promise<Address[]> {
  return db.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

/** Only returns the address if it belongs to this user (prevents using someone else's address ID). */
export async function getAddressForUser(
  userId: string,
  addressId: string,
): Promise<Address | null> {
  return db.address.findFirst({ where: { id: addressId, userId } });
}

export class TooManyAddressesError extends Error {
  constructor() {
    super(`You can save up to ${MAX_ADDRESSES} addresses.`);
  }
}

/** Saves an address; the first one becomes the default. */
export async function createAddress(userId: string, input: AddressInput): Promise<Address> {
  const count = await db.address.count({ where: { userId } });
  if (count >= MAX_ADDRESSES) throw new TooManyAddressesError();
  return db.address.create({
    data: {
      userId,
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      landmark: input.landmark ?? null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      isDefault: count === 0,
    },
  });
}

/** Frozen copy stored on the order, so later address edits never change past orders. */
export function addressSnapshot(address: Address) {
  return {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    landmark: address.landmark,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
  };
}

export type AddressSnapshot = ReturnType<typeof addressSnapshot>;

/** Updates only if the address belongs to this user. Returns false otherwise. */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressInput,
): Promise<boolean> {
  const result = await db.address.updateMany({
    where: { id: addressId, userId },
    data: {
      fullName: input.fullName,
      phone: input.phone,
      line1: input.line1,
      line2: input.line2 ?? null,
      landmark: input.landmark ?? null,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
    },
  });
  return result.count > 0;
}

/** Deletes the user's address; if it was the default, the newest remaining one becomes default. */
export async function deleteAddress(userId: string, addressId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const address = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { isDefault: true },
    });
    if (!address) return false;
    await tx.address.delete({ where: { id: addressId } });
    if (address.isDefault) {
      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return true;
  });
}

export async function setDefaultAddress(userId: string, addressId: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({
      where: { id: addressId, userId },
      select: { id: true },
    });
    if (!owned) return false;
    await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
    return true;
  });
}
