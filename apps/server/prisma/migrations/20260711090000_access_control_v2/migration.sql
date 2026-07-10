-- CreateEnum
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PermissionKind" AS ENUM ('SYSTEM', 'CUSTOM', 'LEGACY');

-- AlterTable: 先以可空列兼容可能已经存在的部门，再回填稳定代码并收紧约束。
ALTER TABLE "Department" ADD COLUMN "code" TEXT,
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "status" "DepartmentStatus" NOT NULL DEFAULT 'ACTIVE';

UPDATE "Department"
SET "code" = 'legacy-department-' || "id"
WHERE "code" IS NULL;

ALTER TABLE "Department" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable: V2 前的权限统一标记为遗留数据，目录同步脚本会把系统权限改为 SYSTEM。
ALTER TABLE "Permission" ADD COLUMN "kind" "PermissionKind" NOT NULL DEFAULT 'CUSTOM';

UPDATE "Permission" SET "kind" = 'LEGACY';

-- AlterTable: 保留旧角色名称作为显示名，并为三个已知角色回填稳定代码。
ALTER TABLE "Role" ADD COLUMN "code" TEXT,
ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Role"
SET "code" = CASE
  WHEN UPPER("name") = 'ADMIN' THEN 'ADMIN'
  WHEN UPPER("name") = 'MANAGER' THEN 'MANAGER'
  WHEN UPPER("name") = 'MEMBER' THEN 'MEMBER'
  ELSE 'LEGACY_ROLE_' || "id"
END
WHERE "code" IS NULL;

ALTER TABLE "Role" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable: 使用独立主键，使同一角色和权限可以按不同数据范围分别授权。
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_pkey",
ADD COLUMN "id" SERIAL NOT NULL,
ADD COLUMN "scopeType" "DataScope" NOT NULL DEFAULT 'ALL',
ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");

-- AlterTable: 历史空范围按 ALL 回填，再改为必填。
UPDATE "UserPermission" SET "scopeType" = 'ALL' WHERE "scopeType" IS NULL;

ALTER TABLE "UserPermission" ALTER COLUMN "scopeType" SET NOT NULL,
ALTER COLUMN "scopeType" SET DEFAULT 'ALL';

-- CreateTable
CREATE TABLE "AccessControlAuditLog" (
    "id" SERIAL NOT NULL,
    "actorId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessControlAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccessControlAuditLog_actorId_idx" ON "AccessControlAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "AccessControlAuditLog_action_idx" ON "AccessControlAuditLog"("action");

-- CreateIndex
CREATE INDEX "AccessControlAuditLog_targetType_targetId_idx" ON "AccessControlAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AccessControlAuditLog_requestId_idx" ON "AccessControlAuditLog"("requestId");

-- CreateIndex
CREATE INDEX "AccessControlAuditLog_createdAt_idx" ON "AccessControlAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "Department_status_idx" ON "Department"("status");

-- CreateIndex
CREATE INDEX "Department_sortOrder_idx" ON "Department"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permId_scopeType_key" ON "RolePermission"("roleId", "permId", "scopeType");

-- AddForeignKey
ALTER TABLE "AccessControlAuditLog" ADD CONSTRAINT "AccessControlAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
