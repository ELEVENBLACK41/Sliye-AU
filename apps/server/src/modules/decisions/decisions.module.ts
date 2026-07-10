/*
 * @Description: 最小决策模块，验证 RBAC 与部门数据范围的真实业务落地。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';

@Module({
  imports: [AuthModule],
  controllers: [DecisionsController],
  providers: [DecisionsService],
})
export class DecisionsModule {}
