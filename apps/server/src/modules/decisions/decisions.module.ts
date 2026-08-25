/*
 * @Description: 最小决策模块，验证 RBAC 与部门数据范围的真实业务落地。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { ProjectsModule } from '../projects/projects.module';
import { DecisionsController } from './decisions.controller';
import { DecisionCenterController } from './decision-center.controller';
import { ProjectDecisionsController } from './project-decisions.controller';
import { DecisionsService } from './decisions.service';
import { DecisionCoreService } from './services/decision-core.service';
import { DecisionParticipantService } from './services/decision-participant.service';
import { DecisionProposalService } from './services/decision-proposal.service';
import { DecisionResolutionService } from './services/decision-resolution.service';
import { DecisionVoteService } from './services/decision-vote.service';
import { DecisionCenterQueryService } from './services/decision-center-query.service';
import { DecisionDiscoveryService } from './services/decision-discovery.service';

@Module({
  imports: [AuthModule, MeetingsModule, ProjectsModule],
  controllers: [
    DecisionsController,
    ProjectDecisionsController,
    DecisionCenterController,
  ],
  providers: [
    DecisionsService,
    DecisionCoreService,
    DecisionParticipantService,
    DecisionProposalService,
    DecisionResolutionService,
    DecisionVoteService,
    DecisionCenterQueryService,
    DecisionDiscoveryService,
  ],
  exports: [DecisionDiscoveryService],
})
export class DecisionsModule {}
