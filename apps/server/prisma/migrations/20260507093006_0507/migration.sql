/*
  Warnings:

  - A unique constraint covering the columns `[sourceRequestId]` on the table `UserPermission` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- AlterTable
ALTER TABLE "UserPermission" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "sourceRequestId" INTEGER;

-- CreateTable
CREATE TABLE "PermissionRequest" (
    "id" SERIAL NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "permCode" TEXT NOT NULL,
    "reason" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "approverId" INTEGER,
    "approvalNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "PermissionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionRequest_requesterId_idx" ON "PermissionRequest"("requesterId");

-- CreateIndex
CREATE INDEX "PermissionRequest_status_idx" ON "PermissionRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_sourceRequestId_key" ON "UserPermission"("sourceRequestId");

-- CreateIndex
CREATE INDEX "UserPermission_expiresAt_idx" ON "UserPermission"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "PermissionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRequest" ADD CONSTRAINT "PermissionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionRequest" ADD CONSTRAINT "PermissionRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
