/*
  Warnings:

  - You are about to drop the column `permCode` on the `PermissionRequest` table. All the data in the column will be lost.
  - You are about to drop the column `permCode` on the `UserPermission` table. All the data in the column will be lost.
  - Added the required column `action` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `module` to the `Permission` table without a default value. This is not possible if the table is not empty.
  - Added the required column `permId` to the `UserPermission` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `effect` on the `UserPermission` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DataScope" AS ENUM ('ALL', 'OWN', 'DEPT', 'DEPT_AND_CHILD', 'PARTICIPATED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('DECISION', 'MEETING', 'AUDIT');

-- DropForeignKey
ALTER TABLE "UserPermission" DROP CONSTRAINT "UserPermission_sourceRequestId_fkey";

-- DropIndex
DROP INDEX "PermissionRequest_requesterId_idx";

-- DropIndex
DROP INDEX "PermissionRequest_status_idx";

-- DropIndex
DROP INDEX "UserPermission_expiresAt_idx";

-- DropIndex
DROP INDEX "UserPermission_permCode_idx";

-- DropIndex
DROP INDEX "UserPermission_sourceRequestId_key";

-- DropIndex
DROP INDEX "UserPermission_userId_idx";

-- AlterTable
ALTER TABLE "Permission" ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "module" TEXT NOT NULL,
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "PermissionRequest" DROP COLUMN "permCode";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deptId" INTEGER;

-- AlterTable
ALTER TABLE "UserPermission" DROP COLUMN "permCode",
ADD COLUMN     "permId" INTEGER NOT NULL,
ADD COLUMN     "scopeType" "DataScope",
DROP COLUMN "effect",
ADD COLUMN     "effect" "PermissionEffect" NOT NULL;

-- CreateTable
CREATE TABLE "PermissionRequestItem" (
    "id" SERIAL NOT NULL,
    "requestId" INTEGER NOT NULL,
    "permId" INTEGER NOT NULL,
    "effect" "PermissionEffect" NOT NULL,
    "scopeType" "DataScope",

    CONSTRAINT "PermissionRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "creatorId" INTEGER NOT NULL,
    "ownerId" INTEGER,
    "deptId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceParticipant" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "resourceType" "ResourceType" NOT NULL,
    "resourceId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResourceParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" INTEGER,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResourceParticipant_userId_idx" ON "ResourceParticipant"("userId");

-- CreateIndex
CREATE INDEX "ResourceParticipant_resourceType_resourceId_idx" ON "ResourceParticipant"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRequestItem" ADD CONSTRAINT "PermissionRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PermissionRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRequestItem" ADD CONSTRAINT "PermissionRequestItem_permId_fkey" FOREIGN KEY ("permId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_permId_fkey" FOREIGN KEY ("permId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
