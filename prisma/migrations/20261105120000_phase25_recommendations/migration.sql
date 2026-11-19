-- Phase 25: recommendations (bought-together pairs, trending scores, widget stats) and
-- order attribution. Additive only.
BEGIN;
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "recoAttribution" JSONB;

-- CreateTable
CREATE TABLE "ProductPair" (
    "productId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "orders" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPair_pkey" PRIMARY KEY ("productId","relatedId")
);

-- CreateTable
CREATE TABLE "ProductTrend" (
    "productId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTrend_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "RecoStat" (
    "day" DATE NOT NULL,
    "widget" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "shard" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecoStat_pkey" PRIMARY KEY ("day","widget","event","shard")
);

-- CreateIndex
CREATE INDEX "ProductPair_productId_orders_idx" ON "ProductPair"("productId", "orders");

-- CreateIndex
CREATE INDEX "ProductTrend_score_idx" ON "ProductTrend"("score");

-- AddForeignKey
ALTER TABLE "ProductPair" ADD CONSTRAINT "ProductPair_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPair" ADD CONSTRAINT "ProductPair_relatedId_fkey" FOREIGN KEY ("relatedId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTrend" ADD CONSTRAINT "ProductTrend_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
