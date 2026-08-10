/**
 * 本文件定义仅供新版决策中心只读详情抽屉使用的页面组合类型。
 */
import type {
  DecisionDetail,
  DecisionEventTimelineResponse,
  DecisionProposalListResponse,
  DecisionResolutionListResponse,
  DecisionVoteRoundListResponse,
} from '@workspace/contracts/decisions';

/** 决策中心详情抽屉一次展示的完整只读过程快照。 */
export type DecisionCenterReadOnlyDetail = {
  /** 决策主记录与参与人。 */
  decision: DecisionDetail;
  /** 全部提案。 */
  proposals: DecisionProposalListResponse;
  /** 全部投票轮次。 */
  voteRounds: DecisionVoteRoundListResponse;
  /** 全部正式决议。 */
  resolutions: DecisionResolutionListResponse;
  /** 完整过程时间线。 */
  events: DecisionEventTimelineResponse;
};
