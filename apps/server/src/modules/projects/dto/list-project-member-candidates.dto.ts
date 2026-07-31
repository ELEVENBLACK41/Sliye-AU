/**
 * 本文件定义项目可加入成员候选查询的运行时校验 DTO。
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { ProjectMemberCandidateListQuery } from '@workspace/contracts/projects';
import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** 校验候选用户姓名、邮箱或部门搜索词。 */
export class ListProjectMemberCandidatesDto implements ProjectMemberCandidateListQuery {
  /** 去除首尾空白后的候选用户搜索词。 */
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): string | undefined =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  @IsString()
  @MaxLength(50)
  q?: string;
}
