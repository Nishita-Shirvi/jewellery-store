-- Phase 30: kill switches. Data only (settings live in "AppSetting"); adds the permission.
BEGIN;
INSERT INTO "Permission" ("key", "description") VALUES ('switches.manage', 'Pause checkout, COD, coupons or recommendations (kill switches)') ON CONFLICT ("key") DO UPDATE SET "description" = EXCLUDED."description";
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'switches.manage' FROM "StaffRole" WHERE "key" = 'OWNER' ON CONFLICT DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionKey") SELECT "id", 'switches.manage' FROM "StaffRole" WHERE "key" = 'MANAGER' ON CONFLICT DO NOTHING;
COMMIT;
