-- Phase 27: consents (+ consent log), account deletion marker, country of origin. Additive only.
-- emailMarketingConsent defaults to false for everyone (marketing emails need an opt-in).
BEGIN;
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "countryOfOrigin" TEXT NOT NULL DEFAULT 'India';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailMarketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsUpdatesConsent" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ConsentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentEvent_userId_createdAt_idx" ON "ConsentEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsentEvent" ADD CONSTRAINT "ConsentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
