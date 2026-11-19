-- Phase 21: staff roles, permissions, invites, two-step sign-in. Additive; existing admins become
-- OWNER (same access as before). One transaction.

BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "recoveryCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "staffDeactivatedAt" TIMESTAMP(3),
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "StaffRole" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffRole_key_key" ON "StaffRole"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_tokenHash_key" ON "StaffInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "StaffRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Seed permissions and roles from lib/permissions.ts (re-runnable).
INSERT INTO "Permission" ("key", "description") VALUES ('orders.view', 'See orders, customers'' order details, returns and shipments') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('orders.update', 'Change order status, create shipments, generate invoices') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('refunds.manage', 'Cancel paid orders, approve/reject returns, send or record refunds') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('cod.manage', 'Record cash-on-delivery remittances') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('products.view', 'See products, categories and stock') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('products.edit', 'Create and edit products, variants, stock, photos and categories') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('coupons.manage', 'Create and edit coupons') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('reviews.moderate', 'Approve or reject reviews') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('reports.view', 'Sales reports, CSV export, marketing stats') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('jobs.manage', 'See and retry failed background jobs') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('audit.view', 'Read the activity log') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('staff.manage', 'Invite staff, change roles, deactivate staff, reset two-step sign-in') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "StaffRole" ("id", "key", "name", "description") VALUES ('role_owner', 'OWNER', 'Owner', 'Everything, including staff') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.update' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'refunds.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'cod.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.edit' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'coupons.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reviews.moderate' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reports.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'jobs.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'audit.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'staff.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "StaffRole" ("id", "key", "name", "description") VALUES ('role_manager', 'MANAGER', 'Manager', 'Runs the store; can''t manage staff') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.update' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'refunds.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'cod.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.edit' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'coupons.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reviews.moderate' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reports.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'jobs.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'audit.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "StaffRole" ("id", "key", "name", "description") VALUES ('role_catalog_editor', 'CATALOG_EDITOR', 'Catalog editor', 'Products, photos, stock and reviews') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.edit' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reviews.moderate' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
INSERT INTO "StaffRole" ("id", "key", "name", "description") VALUES ('role_order_manager', 'ORDER_MANAGER', 'Order manager', 'Orders, shipping, returns, refunds and COD') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.update' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'refunds.manage' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'cod.manage' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "StaffRole" ("id", "key", "name", "description") VALUES ('role_support', 'SUPPORT', 'Support', 'Looks up orders and products to help customers; can''t change them') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;
-- Every existing admin becomes an OWNER, so nobody loses access.
INSERT INTO "UserRole" ("userId", "roleId") SELECT u."id", r."id" FROM "User" u, "StaffRole" r WHERE u."role" = 'ADMIN' AND r."key" = 'OWNER' ON CONFLICT DO NOTHING;

COMMIT;
