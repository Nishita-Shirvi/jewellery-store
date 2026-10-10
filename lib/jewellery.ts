import type { MetalColour, MetalType, Purity } from "@prisma/client";
import { formatWeight } from "@/lib/format";

/** Display labels for jewellery enums (database values → what customers read). */

export const purityLabel: Record<Purity, string> = {
  K24: "24K",
  K22: "22K",
  K18: "18K",
  K14: "14K",
  S925: "925",
  PT950: "PT950",
};

const goldColourLabel: Record<MetalColour, string> = {
  YELLOW: "yellow gold",
  WHITE: "white gold",
  ROSE: "rose gold",
  SILVER: "gold",
};

/** e.g. "22K yellow gold · 4.1 g", "925 silver · 8 g", "Gold-plated 925 silver · 14 g". */
export function materialSummary(input: {
  metalType: MetalType;
  purity: Purity;
  metalColour: MetalColour;
  netWeightMg: number;
}): string {
  let metal: string;
  switch (input.metalType) {
    case "SILVER":
      metal = input.metalColour === "YELLOW" ? "Gold-plated 925 silver" : "925 silver";
      break;
    case "PLATINUM":
      metal = `${purityLabel[input.purity]} platinum`;
      break;
    case "GOLD":
      metal = `${purityLabel[input.purity]} ${goldColourLabel[input.metalColour]}`;
      break;
  }
  return `${metal} · ${formatWeight(input.netWeightMg)}`;
}

export const metalLabel: Record<MetalType, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  PLATINUM: "Platinum",
};

export const colourLabel: Record<MetalColour, string> = {
  YELLOW: "Yellow",
  WHITE: "White",
  ROSE: "Rose",
  SILVER: "Silver",
};

/** Stock message shown to customers. */
export function stockStatus(stock: number): { label: string; tone: "ok" | "low" | "out" } {
  if (stock <= 0) return { label: "Out of stock", tone: "out" };
  if (stock <= 3) return { label: stock === 1 ? "Only 1 left" : `Only ${stock} left`, tone: "low" };
  return { label: "In stock", tone: "ok" };
}
