/*
 * @Description: 最小决策模块，验证 RBAC 与部门数据范围的真实业务落地。
 */
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { DecisionsController } from './decisions.controller';
import { DecisionsService } from './decisions.service';
import { DecisionChatGateway } from './gateways/decision-chat.gateway';
import { DecisionChatService } from './services/decision-chat.service';
import { DecisionChatTicketService } from './services/decision-chat-ticket.service';
import { DecisionCoreService } from './services/decision-core.service';
import { DecisionParticipantService } from './services/decision-participant.service';
import { DecisionProposalService } from './services/decision-proposal.service';
import { DecisionResolutionService } from './services/decision-resolution.service';
import { DecisionVoteService } from './services/decision-vote.service';

@Module({
  imports: [AuthModule, MeetingsModule],
  controllers: [DecisionsController],
  providers: [
    DecisionsService,
    DecisionChatGateway,
    DecisionChatService,
    DecisionChatTicketService,
    DecisionCoreService,
    DecisionParticipantService,
    DecisionProposalService,
    DecisionResolutionService,
    DecisionVoteService,
  ],
})
export class DecisionsModule {}
