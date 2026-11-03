-- Phase 18: cash on delivery.
-- Additive only: new enum values, columns with defaults and the OtpChallenge table. Existing orders
-- become paymentMethod ONLINE with no COD fee, which is what they were. One transaction.

BEGIN;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ONLINE', 'COD');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'CONFIRMED';

-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'COD';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "codFeeInPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'ONLINE',
ADD COLUMN     "rtoAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "codRefusals" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_createdAt_idx" ON "OtpChallenge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_paymentMethod_status_idx" ON "Order"("paymentMethod", "status");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


COMMIT;
