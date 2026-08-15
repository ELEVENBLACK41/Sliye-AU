-- RenameEnum
ALTER TYPE "MatterStatus" RENAME TO "ProjectStatus";
ALTER TYPE "MatterMemberRole" RENAME TO "ProjectMemberRole";
ALTER TYPE "ResourceType" RENAME VALUE 'MATTER' TO 'PROJECT';

-- RenameTable
ALTER TABLE "Matter" RENAME TO "Project";
ALTER TABLE "MatterMember" RENAME TO "ProjectMember";

-- RenameSequence
ALTER SEQUENCE "Matter_id_seq" RENAME TO "Project_id_seq";
ALTER SEQUENCE "MatterMember_id_seq" RENAME TO "ProjectMember_id_seq";

-- RenameColumn
ALTER TABLE "ProjectMember" RENAME COLUMN "matterId" TO "projectId";
ALTER TABLE "DiscussionArea" RENAME COLUMN "matterId" TO "projectId";
ALTER TABLE "CollaborationAuditLog" RENAME COLUMN "matterId" TO "projectId";
ALTER TABLE "Decision" RENAME COLUMN "matterId" TO "projectId";

-- RenamePrimaryKey
ALTER TABLE "Project" RENAME CONSTRAINT "Matter_pkey" TO "Project_pkey";
ALTER TABLE "ProjectMember" RENAME CONSTRAINT "MatterMember_pkey" TO "ProjectMember_pkey";

-- RenameForeignKey
ALTER TABLE "Project" RENAME CONSTRAINT "Matter_deptId_fkey" TO "Project_deptId_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "Matter_createdById_fkey" TO "Project_createdById_fkey";
ALTER TABLE "Project" RENAME CONSTRAINT "Matter_ownerId_fkey" TO "Project_ownerId_fkey";
ALTER TABLE "ProjectMember" RENAME CONSTRAINT "MatterMember_matterId_fkey" TO "ProjectMember_projectId_fkey";
ALTER TABLE "ProjectMember" RENAME CONSTRAINT "MatterMember_userId_fkey" TO "ProjectMember_userId_fkey";
ALTER TABLE "DiscussionArea" RENAME CONSTRAINT "DiscussionArea_matterId_fkey" TO "DiscussionArea_projectId_fkey";
ALTER TABLE "CollaborationAuditLog" RENAME CONSTRAINT "CollaborationAuditLog_matterId_fkey" TO "CollaborationAuditLog_projectId_fkey";
ALTER TABLE "Decision" RENAME CONSTRAINT "Decision_matterId_fkey" TO "Decision_projectId_fkey";

-- RenameIndex
ALTER INDEX "Matter_createdById_idx" RENAME TO "Project_createdById_idx";
ALTER INDEX "Matter_ownerId_idx" RENAME TO "Project_ownerId_idx";
ALTER INDEX "Matter_deptId_idx" RENAME TO "Project_deptId_idx";
ALTER INDEX "Matter_status_idx" RENAME TO "Project_status_idx";
ALTER INDEX "Matter_createdAt_idx" RENAME TO "Project_createdAt_idx";
ALTER INDEX "MatterMember_userId_idx" RENAME TO "ProjectMember_userId_idx";
ALTER INDEX "MatterMember_role_idx" RENAME TO "ProjectMember_role_idx";
ALTER INDEX "MatterMember_matterId_userId_key" RENAME TO "ProjectMember_projectId_userId_key";
ALTER INDEX "DiscussionArea_matterId_publicKey_key" RENAME TO "DiscussionArea_projectId_publicKey_key";
ALTER INDEX "DiscussionArea_matterId_type_idx" RENAME TO "DiscussionArea_projectId_type_idx";
ALTER INDEX "CollaborationAuditLog_matterId_idx" RENAME TO "CollaborationAuditLog_projectId_idx";
ALTER INDEX "Decision_matterId_idx" RENAME TO "Decision_projectId_idx";
