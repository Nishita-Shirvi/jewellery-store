-- Phase 22: help-centre FAQs, support tickets (private attachments), canned replies, and the
-- support.manage / faqs.manage permissions (Support and Order manager roles get support.manage).
-- Additive only. One transaction.

BEGIN;

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'ANSWERED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TicketCategory" AS ENUM ('ORDER', 'DELIVERY', 'RETURN', 'PAYMENT', 'PRODUCT', 'OTHER');

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "position" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "category" "TicketCategory" NOT NULL DEFAULT 'OTHER',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "lastCustomerMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStaffReplyAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "fromStaff" BOOLEAN NOT NULL DEFAULT false,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Faq_isPublished_category_position_idx" ON "Faq"("isPublished", "category", "position");

-- CreateIndex
CREATE INDEX "SupportTicket_userId_updatedAt_idx" ON "SupportTicket"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_status_lastCustomerMessageAt_idx" ON "SupportTicket"("status", "lastCustomerMessageAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assignedToId_status_idx" ON "SupportTicket"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "TicketMessage_ticketId_createdAt_idx" ON "TicketMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "TicketAttachment_ticketId_idx" ON "TicketAttachment"("ticketId");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketMessage" ADD CONSTRAINT "TicketMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "TicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- New permissions and role grants from lib/permissions.ts (re-runnable).
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
INSERT INTO "Permission" ("key", "description") VALUES ('support.manage', 'Read and answer customer support tickets') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('faqs.manage', 'Edit help-centre FAQs and canned replies') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('audit.view', 'Read the activity log') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "Permission" ("key", "description") VALUES ('staff.manage', 'Invite staff, change roles, deactivate staff, reset two-step sign-in') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
UPDATE "StaffRole" SET "description" = 'Everything, including staff' WHERE "key" = 'OWNER';
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
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'support.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'faqs.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'audit.view' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'staff.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Runs the store; can''t manage staff' WHERE "key" = 'MANAGER';
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
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'support.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'faqs.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'audit.view' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Products, photos, stock and reviews' WHERE "key" = 'CATALOG_EDITOR';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.edit' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'reviews.moderate' FROM "StaffRole" WHERE "key" = 'CATALOG_EDITOR' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Orders, shipping, returns, refunds, COD and support tickets' WHERE "key" = 'ORDER_MANAGER';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.update' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'refunds.manage' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'cod.manage' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'support.manage' FROM "StaffRole" WHERE "key" = 'ORDER_MANAGER' ON CONFLICT DO NOTHING;
UPDATE "StaffRole" SET "description" = 'Answers customers (tickets, FAQs); can look up orders and products but not change them' WHERE "key" = 'SUPPORT';
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'orders.view' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'products.view' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'support.manage' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'faqs.manage' FROM "StaffRole" WHERE "key" = 'SUPPORT' ON CONFLICT DO NOTHING;

COMMIT;
