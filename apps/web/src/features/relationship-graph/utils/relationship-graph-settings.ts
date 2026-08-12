/**
 * 本文件提供新版个人关系图谱设置的 Zod 4 校验、默认值、合并与浏览器持久化能力。
 */

import { z } from 'zod';
import type {
  RelationshipGraphNodeType,
  RelationshipGraphRelationType,
} from '@workspace/contracts/relationship-graph';

import type {
  RelationshipGraphSettings,
  RelationshipGraphSettingsPatch,
} from '../types/relationship-graph-settings.types';

/** 当前实现支持的全部关系图谱节点类型。 */
export const RELATIONSHIP_GRAPH_NODE_TYPES = [
  'PROJECT',
  'AREA',
  'DECISION',
  'MEETING',
  'PROPOSAL',
  'VOTE_ROUND',
  'RESOLUTION',
  'USER',
] as const satisfies readonly RelationshipGraphNodeType[];

/** 当前实现支持的全部关系语义。 */
export const RELATIONSHIP_GRAPH_RELATION_TYPES = [
  'CONTAINS',
  'HOSTS',
  'DISCUSSES',
  'PROCESS_COMPONENT',
  'CANDIDATE',
  'BASIS',
  'SUPERSEDED_BY',
  'MEMBER',
  'PARTICIPATES',
  'CREATED',
  'OWNS',
  'CONFIRMED',
] as const satisfies readonly RelationshipGraphRelationType[];

/** 本地设置结构的当前版本。 */
export const RELATIONSHIP_GRAPH_SETTINGS_VERSION = 1 as const;

/** 按当前用户隔离关系图谱设置的 localStorage 键前缀。 */
const RELATIONSHIP_GRAPH_SETTINGS_STORAGE_PREFIX = 'nextnest:relationship-graph:settings';

/** 关系图谱节点类型运行时校验器。 */
const relationshipGraphNodeTypeSchema = z.enum(RELATIONSHIP_GRAPH_NODE_TYPES);

/** 关系图谱关系语义运行时校验器。 */
const relationshipGraphRelationTypeSchema = z.enum(RELATIONSHIP_GRAPH_RELATION_TYPES);

/** 颜色组规则条件运行时校验器。 */
const relationshipGraphColorRuleConditionsSchema = z
  .object({
    nodeTypes: z.array(relationshipGraphNodeTypeSchema).max(RELATIONSHIP_GRAPH_NODE_TYPES.length),
    statuses: z.array(z.string().trim().min(1).max(80)).max(30),
    projectIds: z.array(z.number().int().positive()).max(100),
    projectTitles: z.array(z.string().trim().min(1).max(160)).max(100),
    titleKeyword: z.string().trim().max(160),
    myRelations: z.array(relationshipGraphRelationTypeSchema).max(RELATIONSHIP_GRAPH_RELATION_TYPES.length),
  })
  .strict();

/** 一条可持久化颜色组规则的运行时校验器。 */
const relationshipGraphColorRuleSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(80),
    enabled: z.boolean(),
    color: z.string().trim().min(1).max(128),
    conditions: relationshipGraphColorRuleConditionsSchema,
  })
  .strict();

/** 完整关系图谱设置的 Zod 4 运行时校验器。 */
export const relationshipGraphSettingsSchema: z.ZodType<RelationshipGraphSettings> = z
  .object({
    version: z.literal(RELATIONSHIP_GRAPH_SETTINGS_VERSION),
    filters: z
      .object({
        enabledNodeTypes: z
          .object({
            PROJECT: z.boolean(),
            AREA: z.boolean(),
            DECISION: z.boolean(),
            MEETING: z.boolean(),
            PROPOSAL: z.boolean(),
            VOTE_ROUND: z.boolean(),
            RESOLUTION: z.boolean(),
            USER: z.boolean(),
          })
          .strict(),
        onlyDirectlyRelatedToMe: z.boolean(),
        showOrphans: z.boolean(),
        localGraphEnabled: z.boolean(),
        localGraphDepth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
      })
      .strict(),
    appearance: z
      .object({
        showArrows: z.boolean(),
        labelOpacity: z.number().min(0).max(1),
        nodeSizeScale: z.number().min(0.4).max(3),
        linkWidthScale: z.number().min(0.4).max(4),
      })
      .strict(),
    forces: z
      .object({
        centerStrength: z.number().min(0).max(1),
        chargeStrength: z.number().min(-1_200).max(-10),
        linkStrength: z.number().min(0).max(1),
        linkDistance: z.number().min(20).max(360),
      })
      .strict(),
    colorRules: z.array(relationshipGraphColorRuleSchema).max(50),
  })
  .strict();

/** 未保存用户偏好时使用的第一版关系图谱设置。 */
const DEFAULT_RELATIONSHIP_GRAPH_SETTINGS_INPUT = {
  version: RELATIONSHIP_GRAPH_SETTINGS_VERSION,
  filters: {
    enabledNodeTypes: {
      PROJECT: true,
      AREA: true,
      DECISION: true,
      MEETING: true,
      PROPOSAL: true,
      VOTE_ROUND: true,
      RESOLUTION: true,
      USER: true,
    },
    onlyDirectlyRelatedToMe: false,
    showOrphans: true,
    localGraphEnabled: false,
    localGraphDepth: 2,
  },
  appearance: {
    showArrows: false,
    labelOpacity: 0.35,
    nodeSizeScale: 1,
    linkWidthScale: 1,
  },
  forces: {
    centerStrength: 0.08,
    chargeStrength: -180,
    linkStrength: 0.2,
    linkDistance: 96,
  },
  colorRules: [],
} satisfies RelationshipGraphSettings;

/** 默认关系图谱设置；调用方应通过创建函数取得可安全更新的副本。 */
export const DEFAULT_RELATIONSHIP_GRAPH_SETTINGS = relationshipGraphSettingsSchema.parse(
  DEFAULT_RELATIONSHIP_GRAPH_SETTINGS_INPUT,
);

/** 创建一份经过校验且不与其他调用方共享嵌套引用的默认设置。 */
export function createDefaultRelationshipGraphSettings(): RelationshipGraphSettings {
  return relationshipGraphSettingsSchema.parse(DEFAULT_RELATIONSHIP_GRAPH_SETTINGS_INPUT);
}

/** 为指定用户生成独立的关系图谱设置存储键。 */
export function getRelationshipGraphSettingsStorageKey(userId: string | number): string {
  return `${RELATIONSHIP_GRAPH_SETTINGS_STORAGE_PREFIX}:${encodeURIComponent(String(userId))}`;
}

/** 将未知输入解析成当前版本设置，损坏或旧版本数据统一回退到默认值。 */
export function parseRelationshipGraphSettings(input: unknown): RelationshipGraphSettings {
  const parsed = relationshipGraphSettingsSchema.safeParse(input);
  return parsed.success ? parsed.data : createDefaultRelationshipGraphSettings();
}

/** 将 localStorage 字符串还原为当前版本设置，无法反序列化时回退默认值。 */
export function deserializeRelationshipGraphSettings(serialized: string | null): RelationshipGraphSettings {
  if (!serialized) return createDefaultRelationshipGraphSettings();

  try {
    return parseRelationshipGraphSettings(JSON.parse(serialized) as unknown);
  } catch {
    return createDefaultRelationshipGraphSettings();
  }
}

/** 读取指定用户的本地设置；服务端、存储不可用或数据异常时返回默认值。 */
export function readRelationshipGraphSettings(userId: string | number): RelationshipGraphSettings {
  if (typeof window === 'undefined') return createDefaultRelationshipGraphSettings();

  try {
    const serialized = window.localStorage.getItem(getRelationshipGraphSettingsStorageKey(userId));
    return deserializeRelationshipGraphSettings(serialized);
  } catch {
    return createDefaultRelationshipGraphSettings();
  }
}

/** 尝试保存指定用户的当前版本设置，并返回本次写入是否成功。 */
export function writeRelationshipGraphSettings(
  userId: string | number,
  settings: RelationshipGraphSettings,
): boolean {
  if (typeof window === 'undefined') return false;

  const parsed = relationshipGraphSettingsSchema.safeParse(settings);
  if (!parsed.success) return false;

  try {
    window.localStorage.setItem(getRelationshipGraphSettingsStorageKey(userId), JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}

/** 将分组设置补丁合并到当前设置，并拒绝越界或不完整的结果。 */
export function mergeRelationshipGraphSettings(
  current: RelationshipGraphSettings,
  patch: RelationshipGraphSettingsPatch,
): RelationshipGraphSettings {
  const candidate: RelationshipGraphSettings = {
    version: RELATIONSHIP_GRAPH_SETTINGS_VERSION,
    filters: patch.filters
      ? {
          ...current.filters,
          ...patch.filters,
          enabledNodeTypes: patch.filters.enabledNodeTypes
            ? {
                ...current.filters.enabledNodeTypes,
                ...patch.filters.enabledNodeTypes,
              }
            : current.filters.enabledNodeTypes,
        }
      : current.filters,
    appearance: patch.appearance
      ? {
          ...current.appearance,
          ...patch.appearance,
        }
      : current.appearance,
    forces: patch.forces
      ? {
          ...current.forces,
          ...patch.forces,
        }
      : current.forces,
    colorRules: patch.colorRules ?? current.colorRules,
  };
  const parsed = relationshipGraphSettingsSchema.safeParse(candidate);
  return parsed.success ? candidate : current;
}
