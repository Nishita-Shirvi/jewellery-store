/** Catalogue types. These are the data contracts the final frontend design will build on. */
import type { MetalColour, MetalType, Purity } from "@prisma/client";

export type { MetalColour, MetalType, Purity };

/** Category as defined in the dummy catalogue (seed data). */
export interface DummyCategory {
  name: string;
  slug: string;
  /** Representative image for the category tile. */
  image: string;
}

/** Product as defined in the dummy catalogue (seed data). */
export interface DummyProduct {
  name: string;
  slug: string;
  categorySlug: string;
  description: string;
  metalType: MetalType;
  purity: Purity;
  metalColour: MetalColour;
  /** Net metal weight in milligrams (integer — no floats). */
  netWeightMg: number;
  /** Gemstone description, or null for plain metal pieces. */
  gemstone: string | null;
  /** Price in paise (integer — no floats). */
  priceInPaise: number;
  stock: number;
  isFeatured: boolean;
  images: string[];
}

/** What the storefront needs to show a product card. */
export interface ProductCardData {
  name: string;
  slug: string;
  image: string;
  priceInPaise: number;
  /** e.g. "22K yellow gold · 4.1 g" */
  materialSummary: string;
  inStock: boolean;
  reviewCount: number;
  ratingAvgX100: number;
}

export interface CategorySummary {
  name: string;
  slug: string;
  image: string;
  productCount: number;
}

export interface ProductListResult {
  items: ProductCardData[];
  total: number;
  page: number;
  pageCount: number;
}

export interface ProductDetail extends ProductCardData {
  id: string;
  description: string;
  images: string[];
  stock: number;
  metalType: MetalType;
  purity: Purity;
  metalColour: MetalColour;
  netWeightMg: number;
  grossWeightMg: number | null;
  gemstone: string | null;
  huid: string | null;
  isReturnable: boolean;
  category: { name: string; slug: string };
}
