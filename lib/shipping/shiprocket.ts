import "server-only";
import type { ShipmentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Thin Shiprocket API client: login (token cached in the database so every server instance
 * shares it), create order, assign courier/AWB, label, pickup, pincode serviceability.
 * Docs: https://apidocs.shiprocket.in
 */

export class ShiprocketError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ShiprocketError";
  }
}

const TOKEN_KEY = "shiprocket:token";
const TOKEN_TTL_MS = 9 * 24 * 60 * 60 * 1000; // tokens last 10 days; refresh a day early

let memoryToken: { token: string; expiresAt: number } | null = null;

async function login(): Promise<string> {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD)
    throw new ShiprocketError("Shiprocket is not configured");
  const res = await fetch(`${env.SHIPROCKET_API_BASE}/v1/external/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!res.ok) throw new ShiprocketError(`Shiprocket login failed (${res.status})`, res.status);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new ShiprocketError("Shiprocket login returned no token");
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  memoryToken = { token: json.token, expiresAt };
  await db.appSetting.upsert({
    where: { key: TOKEN_KEY },
    update: { value: { token: json.token, expiresAt } },
    create: { key: TOKEN_KEY, value: { token: json.token, expiresAt } },
  });
  logger.info("shiprocket.logged_in");
  return json.token;
}

async function getToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && memoryToken && memoryToken.expiresAt > Date.now()) return memoryToken.token;
  if (!forceRefresh) {
    const stored = await db.appSetting.findUnique({ where: { key: TOKEN_KEY } });
    const value = stored?.value as { token?: string; expiresAt?: number } | null;
    if (value?.token && value.expiresAt && value.expiresAt > Date.now()) {
      memoryToken = { token: value.token, expiresAt: value.expiresAt };
      return value.token;
    }
  }
  return login();
}

async function call<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${env.SHIPROCKET_API_BASE}${path}`, {
    method: init.method ?? "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (res.status === 401 && !retried) {
    await getToken(true); // token expired or revoked: log in again once
    return call<T>(path, init, true);
  }
  const text = await res.text();
  if (!res.ok)
    throw new ShiprocketError(
      `Shiprocket ${path} failed (${res.status}): ${text.slice(0, 200)}`,
      res.status,
    );
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ShiprocketError(`Shiprocket ${path} returned invalid JSON`);
  }
}

export interface CreateOrderInput {
  orderId: string;
  orderDate: Date;
  customer: { name: string; email: string; phone: string };
  address: { line1: string; line2?: string | null; city: string; state: string; pincode: string };
  items: { name: string; sku: string; units: number; sellingPriceInPaise: number }[];
  subTotalInPaise: number;
  shippingInPaise: number;
  weightGrams: number;
}

const rupees = (paise: number) => Number((paise / 100).toFixed(2));

function formatDate(d: Date): string {
  // Shiprocket wants "YYYY-MM-DD HH:mm" (India time)
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return ist.toISOString().slice(0, 16).replace("T", " ");
}

export async function createShiprocketOrder(input: CreateOrderInput) {
  const [first, ...rest] = input.customer.name.trim().split(/\s+/);
  return call<{ order_id: number; shipment_id: number; status: string }>(
    "/v1/external/orders/create/adhoc",
    {
      body: {
        order_id: input.orderId,
        order_date: formatDate(input.orderDate),
        pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
        billing_customer_name: first,
        billing_last_name: rest.join(" ") || ".",
        billing_address: input.address.line1,
        billing_address_2: input.address.line2 ?? "",
        billing_city: input.address.city,
        billing_pincode: input.address.pincode,
        billing_state: input.address.state,
        billing_country: "India",
        billing_email: input.customer.email,
        billing_phone: input.customer.phone,
        shipping_is_billing: true,
        order_items: input.items.map((i) => ({
          name: i.name,
          sku: i.sku,
          units: i.units,
          selling_price: rupees(i.sellingPriceInPaise),
        })),
        payment_method: "Prepaid",
        shipping_charges: rupees(input.shippingInPaise),
        sub_total: rupees(input.subTotalInPaise),
        // Small jewellery box; Shiprocket's minimum chargeable weight is 0.5 kg.
        length: 15,
        breadth: 12,
        height: 6,
        weight: Math.max(0.5, Math.ceil(input.weightGrams / 100) / 10),
      },
    },
  );
}

export async function assignAwb(shipmentId: string) {
  const res = await call<{
    awb_assign_status: number;
    response?: { data?: { awb_code?: string; courier_name?: string } };
    message?: string;
  }>("/v1/external/courier/assign/awb", { body: { shipment_id: shipmentId } });
  const data = res.response?.data;
  if (res.awb_assign_status !== 1 || !data?.awb_code) {
    throw new ShiprocketError(res.message ?? "No courier available for this shipment yet");
  }
  return { awb: data.awb_code, courier: data.courier_name ?? "Courier" };
}

export async function generateLabel(shipmentId: string) {
  const res = await call<{ label_created: number; label_url?: string }>(
    "/v1/external/courier/generate/label",
    {
      body: { shipment_id: [shipmentId] },
    },
  );
  if (!res.label_url) throw new ShiprocketError("Label not generated yet");
  return res.label_url;
}

export async function requestPickup(shipmentId: string) {
  return call<{ pickup_status: number }>("/v1/external/courier/generate/pickup", {
    body: { shipment_id: [shipmentId] },
  });
}

export interface Serviceability {
  serviceable: boolean;
  etdDays: number | null;
}

export async function checkServiceability(
  deliveryPincode: string,
  weightKg = 0.5,
): Promise<Serviceability> {
  const params = new URLSearchParams({
    pickup_postcode: env.SHIPROCKET_PICKUP_PINCODE ?? "",
    delivery_postcode: deliveryPincode,
    weight: String(weightKg),
    cod: "0",
  });
  const res = await call<{
    status: number;
    data?: { available_courier_companies?: { estimated_delivery_days?: string | number }[] };
  }>(`/v1/external/courier/serviceability/?${params}`, { method: "GET" });
  const couriers = res.data?.available_courier_companies ?? [];
  if (couriers.length === 0) return { serviceable: false, etdDays: null };
  const days = couriers
    .map((c) => Number(c.estimated_delivery_days))
    .filter((n) => Number.isFinite(n) && n > 0);
  return { serviceable: true, etdDays: days.length ? Math.min(...days) : null };
}

export function trackingUrlFor(awb: string): string {
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

/**
 * Maps Shiprocket's status (id and/or label) onto ours. Unknown statuses return null and
 * are kept on the timeline without changing the order.
 */
export function mapShiprocketStatus(
  statusId: number | null | undefined,
  label: string | null | undefined,
): ShipmentStatus | null {
  const byId: Record<number, ShipmentStatus> = {
    6: "IN_TRANSIT", // Shipped
    7: "DELIVERED",
    8: "CANCELLED",
    9: "RTO", // RTO initiated
    10: "RTO", // RTO delivered
    17: "OUT_FOR_DELIVERY",
    18: "IN_TRANSIT",
    19: "PICKUP_SCHEDULED", // out for pickup
    42: "PICKED_UP",
  };
  if (statusId && byId[statusId]) return byId[statusId];
  const text = (label ?? "").toUpperCase();
  if (!text) return null;
  if (text.includes("RTO") || text.includes("RETURN")) return "RTO";
  if (text.includes("UNDELIVERED") || text.includes("NOT DELIVERED")) return null;
  if (text.includes("OUT FOR DELIVERY")) return "OUT_FOR_DELIVERY";
  if (text.includes("DELIVERED")) return "DELIVERED";
  if (text.includes("CANCEL")) return "CANCELLED";
  if (text.includes("PICKED UP") || text.includes("PICKUP COMPLETE")) return "PICKED_UP";
  if (
    text.includes("TRANSIT") ||
    text.includes("SHIPPED") ||
    text.includes("REACHED") ||
    text.includes("HUB")
  )
    return "IN_TRANSIT";
  if (text.includes("PICKUP")) return "PICKUP_SCHEDULED";
  return null;
}
