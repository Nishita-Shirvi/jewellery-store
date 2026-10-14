/**
 * Seed script: 1 admin user, 4 jewellery categories, 20 dummy jewellery products.
 * Run with: npx prisma db seed
 *
 * Safe to run more than once: everything is upserted by email/slug.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { dummyCategories, dummyProducts } from "./seed-data/catalog";

const seedEnv = z
  .object({
    SEED_ADMIN_EMAIL: z.email({ message: "SEED_ADMIN_EMAIL must be a valid email" }),
    SEED_ADMIN_PASSWORD: z
      .string()
      .min(12, { message: "SEED_ADMIN_PASSWORD must be at least 12 characters" }),
  })
  .safeParse(process.env);

if (!seedEnv.success) {
  console.error("❌ Seed env vars missing or invalid:");
  for (const issue of seedEnv.error.issues)
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

const db = new PrismaClient();
const BCRYPT_ROUNDS = 12;

async function seedAdmin() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = seedEnv.data!;
  const email = SEED_ADMIN_EMAIL.toLowerCase();
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await db.user.upsert({
    where: { email },
    update: { role: "ADMIN" }, // never overwrite an existing password on re-seed
    create: { email, name: "Store Admin", role: "ADMIN", passwordHash, emailVerified: new Date() },
  });
  console.log(`✔ Admin user: ${email}`);
}

async function seedCategories(): Promise<Map<string, string>> {
  const idsBySlug = new Map<string, string>();
  for (const [index, category] of dummyCategories.entries()) {
    const row = await db.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, image: category.image, sortOrder: index },
      create: { name: category.name, slug: category.slug, image: category.image, sortOrder: index },
    });
    idsBySlug.set(category.slug, row.id);
  }
  console.log(`✔ Categories: ${idsBySlug.size}`);
  return idsBySlug;
}

async function seedProducts(categoryIds: Map<string, string>) {
  for (const product of dummyProducts) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId)
      throw new Error(`Unknown category "${product.categorySlug}" for ${product.slug}`);

    const data = {
      name: product.name,
      description: product.description,
      priceInPaise: product.priceInPaise,
      stock: product.stock,
      images: product.images,
      isFeatured: product.isFeatured,
      isActive: true,
      categoryId,
      metalType: product.metalType,
      purity: product.purity,
      metalColour: product.metalColour,
      netWeightMg: product.netWeightMg,
      gemstone: product.gemstone,
    };

    await db.product.upsert({
      where: { slug: product.slug },
      update: data,
      create: { ...data, slug: product.slug },
    });
  }
  console.log(`✔ Products: ${dummyProducts.length}`);
  // Build the search words for every product (same rules as services/search.service.ts; it also self-heals on first search).
  await db.$executeRaw`UPDATE "Product" SET "searchText" = '' `;
}

async function main() {
  await seedAdmin();
  const categoryIds = await seedCategories();
  await seedProducts(categoryIds);
  console.log("🌱 Seed finished.");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
