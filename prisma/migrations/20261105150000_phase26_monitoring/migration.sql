-- Phase 26: monitoring (per-minute metrics, alert state) and the system.view permission. Additive only.
BEGIN;
-- CreateTable
CREATE TABLE "Metric" (
    "key" TEXT NOT NULL,
    "minute" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Metric_pkey" PRIMARY KEY ("key","minute")
);

-- CreateTable
CREATE TABLE "AlertState" (
    "key" TEXT NOT NULL,
    "firing" BOOLEAN NOT NULL DEFAULT false,
    "since" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "detail" TEXT NOT NULL DEFAULT '',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertState_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Metric_minute_idx" ON "Metric"("minute");


INSERT INTO "Permission" ("key", "description") VALUES ('system.view', 'System health: uptime, background jobs, alerts and errors') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'system.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'system.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
COMMIT;
