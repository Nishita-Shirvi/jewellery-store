export interface CartItemView {
  productId: string;
  slug: string;
  name: string;
  image: string;
  materialSummary: string;
  /** Current price from the database, in paise. */
  unitPriceInPaise: number;
  /** Quantity that will actually be bought (0 if unavailable). */
  quantity: number;
  /** What the customer had asked for (differs when stock went down). */
  requestedQuantity: number;
  maxQuantity: number;
  lineTotalInPaise: number;
  issue: "unavailable" | "out_of_stock" | "reduced" | null;
}

export interface CartView {
  items: CartItemView[];
  itemCount: number;
  subtotalInPaise: number;
  hasIssues: boolean;
}

export type CartActionResult = { ok: true; message?: string } | { ok: false; error: string };
