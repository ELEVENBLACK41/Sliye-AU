/*
 * @Description: 最小决策模块，验证 RBAC 与部门数据范围的真实业务落地。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { MattersModule } from '../matters/matters.module';
import { DecisionsController } from './decisions.controller';
import { MatterDecisionsController } from './matter-decisions.controller';
import { DecisionsService } from './decisions.service';
import { DecisionCoreService } from './services/decision-core.service';
import { DecisionParticipantService } from './services/decision-participant.service';
import { DecisionProposalService } from './services/decision-proposal.service';
import { DecisionResolutionService } from './services/decision-resolution.service';
import { DecisionVoteService } from './services/decision-vote.service';

@Module({
  imports: [AuthModule, MeetingsModule, MattersModule],
  controllers: [DecisionsController, MatterDecisionsController],
  providers: [
    DecisionsService,
    DecisionCoreService,
    DecisionParticipantService,
    DecisionProposalService,
    DecisionResolutionService,
    DecisionVoteService,
  ],
})
export class DecisionsModule {}
