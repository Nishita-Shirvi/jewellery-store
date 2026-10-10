"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guards";
import { addressSchema } from "@/lib/validation/checkout";
import { idSchema } from "@/lib/validation/admin";
import {
  TooManyAddressesError,
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/services/address.service";

export interface AccountFormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export async function saveAddressAction(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const user = await requireUser();
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) {
      if (!idSchema.safeParse({ id }).success || !(await updateAddress(user.id, id, parsed.data))) {
        return { error: "Address not found." };
      }
    } else {
      await createAddress(user.id, parsed.data);
    }
  } catch (error) {
    if (error instanceof TooManyAddressesError) return { error: error.message };
    throw error;
  }
  revalidatePath("/account/addresses");
  return { ok: true };
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (parsed.success) await deleteAddress(user.id, parsed.data.id);
  revalidatePath("/account/addresses");
}

export async function setDefaultAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (parsed.success) await setDefaultAddress(user.id, parsed.data.id);
  revalidatePath("/account/addresses");
}
