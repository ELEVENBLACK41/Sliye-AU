/**
 * 本文件统一导出决策功能模块的页面组件与服务端数据读取能力。
 */
export { DecisionDetailPage } from './components/decision-detail-page';
export {
  DecisionServerError,
  getDecisionDetail,
  getDecisionEvents,
  getDecisionProposals,
  getDecisionResolutions,
  getDecisionVoteRounds,
  updateDecisionStatus,
} from './services/decisions-server.service';
