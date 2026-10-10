import "server-only";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Dummy illustrations shipped in public/images/products (used until real photos are uploaded). */
export async function listPlaceholderImages(): Promise<string[]> {
  try {
    const files = await readdir(path.join(process.cwd(), "public/images/products"));
    return files
      .filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f))
      .sort()
      .map((f) => `/images/products/${f}`);
  } catch {
    return [];
  }
}
