-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('FIXED', 'RATE_LINKED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('NEW', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "spinVideoUrl" TEXT,
ADD COLUMN     "stoneChargeInPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "MetalRate" (
    "id" TEXT NOT NULL,
    "purity" "Purity" NOT NULL,
    "ratePerGramInPaise" INTEGER NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetalRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "preferredDate" DATE NOT NULL,
    "timeSlot" TEXT NOT NULL,
    "message" TEXT,
    "productId" TEXT,
    "userId" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetalRate_purity_createdAt_idx" ON "MetalRate"("purity", "createdAt");

-- CreateIndex
CREATE INDEX "VisitRequest_status_preferredDate_idx" ON "VisitRequest"("status", "preferredDate");

-- CreateIndex
CREATE INDEX "VisitRequest_createdAt_idx" ON "VisitRequest"("createdAt");

-- CreateIndex
CREATE INDEX "Product_isActive_netWeightMg_idx" ON "Product"("isActive", "netWeightMg");

-- CreateIndex
CREATE INDEX "Product_pricingMode_purity_idx" ON "Product"("pricingMode", "purity");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- AddForeignKey
ALTER TABLE "MetalRate" ADD CONSTRAINT "MetalRate_setById_fkey" FOREIGN KEY ("setById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitRequest" ADD CONSTRAINT "VisitRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

