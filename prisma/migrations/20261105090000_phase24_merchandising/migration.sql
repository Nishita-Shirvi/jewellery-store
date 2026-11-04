-- Phase 24: merchandising and CMS (collections, homepage sections, announcements, pages,
-- compare-at prices, product tags) and the content.manage permission. Additive only.
BEGIN;
-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "CollectionKind" AS ENUM ('MANUAL', 'RULE');

-- CreateEnum
CREATE TYPE "HomeSectionKind" AS ENUM ('HERO', 'PRODUCTS', 'BANNER', 'TEXT');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "compareAtPriceInPaise" INTEGER,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "compareAtPriceInPaise" INTEGER;

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "image" TEXT,
    "kind" "CollectionKind" NOT NULL DEFAULT 'MANUAL',
    "rules" JSONB NOT NULL DEFAULT '{}',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionProduct" (
    "collectionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","productId")
);

-- CreateTable
CREATE TABLE "HomeSection" (
    "id" TEXT NOT NULL,
    "kind" "HomeSectionKind" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "imageDesktop" TEXT,
    "imageMobile" TEXT,
    "collectionId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT,
    "linkLabel" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "draftBody" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_slug_key" ON "Collection"("slug");

-- CreateIndex
CREATE INDEX "Collection_status_startsAt_endsAt_idx" ON "Collection"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "CollectionProduct_productId_idx" ON "CollectionProduct"("productId");

-- CreateIndex
CREATE INDEX "HomeSection_status_position_idx" ON "HomeSection"("status", "position");

-- CreateIndex
CREATE INDEX "Announcement_status_priority_idx" ON "Announcement"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPage_slug_key" ON "ContentPage"("slug");

-- CreateIndex
CREATE INDEX "Product_tags_idx" ON "Product" USING GIN ("tags");

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSection" ADD CONSTRAINT "HomeSection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Permission content.manage for Owner, Manager and Catalog editor (from lib/permissions.ts).
INSERT INTO "Permission" ("key", "description") VALUES ('content.manage', 'Homepage, announcement bar, collections and editable pages') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
UPDATE "StaffRole" SET "description" = 'Everything, including staff' WHERE "key" = 'OWNER';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'content.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Runs the store; can''t manage staff' WHERE "key" = 'MANAGER';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'content.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Products, photos, stock, reviews, collections and homepage' WHERE "key" = 'CATALOG_EDITOR';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'content.manage' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
COMMIT;
