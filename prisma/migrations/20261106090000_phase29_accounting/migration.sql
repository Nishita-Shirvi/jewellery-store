-- Phase 29: reconciliation runs, API keys, outgoing webhooks; accounting/integrations permissions. Additive only.
BEGIN;
-- CreateTable
CREATE TABLE "ReconRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "summary" JSONB NOT NULL,
    "issues" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconRun_kind_createdAt_idx" ON "ReconRun"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");


INSERT INTO "Permission" ("key", "description") VALUES ('accounting.manage', 'Reconciliation, GST reports, bulk product import/export') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'accounting.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'accounting.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "Permission" ("key", "description") VALUES ('integrations.manage', 'API keys and outgoing webhooks') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'integrations.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'integrations.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
COMMIT;
