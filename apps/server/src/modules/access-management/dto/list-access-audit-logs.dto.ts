/*
 * @Description: 访问控制审计列表的筛选和分页 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  AccessAuditAction,
  AccessAuditListQuery,
  AccessAuditTargetType,
} from '@workspace/contracts/access';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** 当前访问控制服务会写入的审计动作。 */
const auditActions: AccessAuditAction[] = [
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'DEPARTMENT_MOVED',
  'DEPARTMENT_STATUS_UPDATED',
  'ROLE_CREATED',
  'ROLE_UPDATED',
  'ROLE_DELETED',
  'ROLE_PERMISSION_ASSIGNED',
  'ROLE_PERMISSION_REMOVED',
  'USER_ROLE_ASSIGNED',
  'USER_ROLE_REMOVED',
  'USER_PERMISSION_ASSIGNED',
  'USER_PERMISSION_REMOVED',
  'USER_STATUS_UPDATED',
  'USER_DEPARTMENT_UPDATED',
  'PERMISSION_CATALOG_SYNCED',
];

/** 审计记录允许筛选的目标资源类型。 */
const auditTargetTypes: AccessAuditTargetType[] = [
  'DEPARTMENT',
  'ROLE',
  'PERMISSION',
  'USER',
  'SYSTEM',
];

/** 校验访问控制审计筛选和分页参数。 */
export class ListAccessAuditLogsDto implements AccessAuditListQuery {
  /** 可选的审计动作。 */
  @ApiPropertyOptional({ enum: auditActions })
  @IsOptional()
  @IsIn(auditActions)
  action?: AccessAuditAction;

  /** 可选的目标资源类型。 */
  @ApiPropertyOptional({ enum: auditTargetTypes })
  @IsOptional()
  @IsIn(auditTargetTypes)
  targetType?: AccessAuditTargetType;

  /** 可选的操作人主键。 */
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actorId?: number;

  /** 从 1 开始的页码。 */
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** 每页审计记录数量。 */
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
