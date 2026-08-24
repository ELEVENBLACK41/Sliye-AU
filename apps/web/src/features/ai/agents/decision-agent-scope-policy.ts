/**
 * 本文件实现第 2.4 阶段的高置信度范围路由和逐步工具可用性策略。
 * 只拦截产品规范明确列出的离题类型；无法确定时继续交给 Decision Agent，避免误拒决策问题。
 */

/** 明显离题请求的受控分类。 */
export type DecisionAgentOffTopicCategory = 'software-help' | 'weather' | 'general-writing';

/** 前置范围路由结果，决定首个模型 Step 是否可以看到业务工具。 */
export type DecisionAgentScopeRoute =
  | {
      /** 当前问题继续进入受真实业务工具约束的决策 Agent。 */
      mode: 'decision';
    }
  | {
      /** 当前问题只能执行无工具的简短范围拒答。 */
      mode: 'scope-refusal';
      /** 用于测试和观测的低基数离题分类，不包含用户正文。 */
      category: DecisionAgentOffTopicCategory;
    };

/** Agent `prepareStep` 使用的最小工具与指令覆盖。 */
export type DecisionAgentStepPolicy =
  | {
      /** 当前 Step 不向模型暴露任何业务工具。 */
      activeTools: Array<'getDecisionContext'>;
      /** 明确禁止模型发起工具调用。 */
      toolChoice: 'none';
      /** 把模型限制为固定产品范围拒答。 */
      instructions: string;
    }
  | {
      /** 当前只开放基础决策上下文工具。 */
      activeTools: Array<'getDecisionContext'>;
      /** 强制首个决策 Step 先取得真实上下文。 */
      toolChoice: {
        type: 'tool';
        toolName: 'getDecisionContext';
      };
    }
  | undefined;

/** 明显声明与当前决策无关时优先拒答，不能被“当前决策”字样误判为范围内请求。 */
const EXPLICITLY_UNRELATED_PATTERN =
  /(?:与|和)?当前(?:\s*thread|\s*会话|\s*决策).{0,12}(?:无关|不相关)|(?:无关|不相关).{0,12}当前(?:\s*thread|\s*会话|\s*决策)/iu;

/** 能明确证明用户正在询问一项或多项决策形成过程的业务词。 */
const DECISION_SCOPE_PATTERN =
  /当前\s*(?:thread|会话|决策)|(?:这项|该|本次|这个)\s*决策|决策(?:标题|状态|过程|范围|参与|风险|结论)|提案|投票|决议|议题|讨论记录|会议记录|时间线|过程回放|参与人/iu;

/** 天气问题不属于 Decision Agent 产品边界。 */
const WEATHER_PATTERN = /天气|气温|温度|降雨|下雨|晴天|空气质量|weather|forecast/iu;

/** 通用写作主题需要同时出现写作意图，避免误拒决策记录中提到这些名词的问题。 */
const GENERAL_WRITING_SUBJECT_PATTERN = /求职|简历|邮件|作文|文案|情书|诗歌|小说|演讲稿|祝福语/iu;
const GENERAL_WRITING_INTENT_PATTERN = /写|生成|润色|改写|翻译|拟一|起草|帮我/iu;

/** 通用软件教程和代码生成需要同时出现技术主题与求助意图。 */
const SOFTWARE_SUBJECT_PATTERN =
  /react|vue|angular|next\.?js|nest\.?js|typescript|javascript|python|java|rust|golang|css|html|sql|hook|组件|编程|代码|算法|排序函数/iu;
const SOFTWARE_HELP_INTENT_PATTERN = /怎么|如何|写|生成|实现|教程|示例|入门|学习|调试|报错|解释|帮我/iu;

/** 明显离题时使用独立指令，确保模型看不到工具也不继续回答无关知识。 */
export const DECISION_AGENT_SCOPE_REFUSAL_INSTRUCTIONS = `当前请求已经过 NextNest 的固定产品范围门禁，明确不属于决策形成过程。

只回复一条简短中文提示：说明你只能协助已确认范围内决策的讨论、提案、投票、决议和过程回放，并引导用户改问相关决策。不得回答原问题，不得生成代码或通用内容，不得声称读取了任何业务工具。`;

/** 对当前用户问题执行保守的高置信度范围路由。 */
export function routeDecisionAgentRequest(question: string): DecisionAgentScopeRoute {
  const normalizedQuestion = question.normalize('NFKC').trim();

  if (EXPLICITLY_UNRELATED_PATTERN.test(normalizedQuestion)) {
    return { mode: 'scope-refusal', category: resolveOffTopicCategory(normalizedQuestion) };
  }

  if (DECISION_SCOPE_PATTERN.test(normalizedQuestion)) {
    return { mode: 'decision' };
  }

  if (WEATHER_PATTERN.test(normalizedQuestion)) {
    return { mode: 'scope-refusal', category: 'weather' };
  }

  if (
    GENERAL_WRITING_SUBJECT_PATTERN.test(normalizedQuestion) &&
    GENERAL_WRITING_INTENT_PATTERN.test(normalizedQuestion)
  ) {
    return { mode: 'scope-refusal', category: 'general-writing' };
  }

  if (SOFTWARE_SUBJECT_PATTERN.test(normalizedQuestion) && SOFTWARE_HELP_INTENT_PATTERN.test(normalizedQuestion)) {
    return { mode: 'scope-refusal', category: 'software-help' };
  }

  return { mode: 'decision' };
}

/** 为一个 Agent Step 返回与范围路由一致的工具和指令约束。 */
export function prepareDecisionAgentStep(route: DecisionAgentScopeRoute, stepNumber: number): DecisionAgentStepPolicy {
  if (route.mode === 'scope-refusal') {
    return {
      activeTools: [],
      toolChoice: 'none',
      instructions: DECISION_AGENT_SCOPE_REFUSAL_INSTRUCTIONS,
    };
  }

  if (stepNumber === 0) {
    return {
      activeTools: ['getDecisionContext'],
      toolChoice: {
        type: 'tool',
        toolName: 'getDecisionContext',
      },
    };
  }

  return undefined;
}

/** 为显式无关请求生成稳定低基数分类，未知内容仍按软件帮助拒答而不记录正文。 */
function resolveOffTopicCategory(question: string): DecisionAgentOffTopicCategory {
  if (WEATHER_PATTERN.test(question)) {
    return 'weather';
  }

  if (GENERAL_WRITING_SUBJECT_PATTERN.test(question)) {
    return 'general-writing';
  }

  return 'software-help';
}
