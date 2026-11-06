"use client";

import { useCallback, useState, type FormEvent } from "react";
import { stateForPincode } from "@/lib/pincode";

/**
 * Address forms (Phase 28): typing a pincode fills in the State. Only when the State is still
 * empty or was filled in this way — a state the customer chose is never overwritten. Put
 * `onInput` on the <form> and show `hint` in an aria-live element.
 */
export function usePincodeState() {
  const [hint, setHint] = useState("");
  const onInput = useCallback((event: FormEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const select = event.currentTarget.elements.namedItem("state");
    if (!(select instanceof HTMLSelectElement)) return;
    if (target === select) {
      select.dataset.auto = "";
      setHint("");
      return;
    }
    if (target.name !== "pincode") return;
    const state = stateForPincode(target.value);
    if (!state || (select.value !== "" && select.dataset.auto !== "1")) return;
    if (select.value !== state) {
      select.value = state;
      select.dataset.auto = "1";
      setHint(`State set to ${state} from the pincode — change it if that's wrong.`);
    }
  }, []);
  return { onInput, hint };
}
