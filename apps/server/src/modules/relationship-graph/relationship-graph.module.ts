/**
 * 本文件组装个人关系图谱的只读控制器、授权依赖与聚合服务。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RelationshipGraphController } from './relationship-graph.controller';
import { RelationshipGraphService } from './relationship-graph.service';

@Module({
  imports: [AuthModule],
  controllers: [RelationshipGraphController],
  providers: [RelationshipGraphService],
})
export class RelationshipGraphModule {}
