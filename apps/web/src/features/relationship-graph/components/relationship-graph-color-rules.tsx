/**
 * 本文件实现关系图谱颜色组的新增、启停、排序、删除与多条件受控编辑界面。
 */
'use client';

import { useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Palette, Plus, Trash2 } from 'lucide-react';
import type {
  RelationshipGraphNodeType,
  RelationshipGraphRelationType,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';
import { Button } from '@workspace/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Separator } from '@workspace/ui/components/separator';
import { Switch } from '@workspace/ui/components/switch';

import type { RelationshipGraphColorRule } from '../types/relationship-graph-settings.types';
import { moveRelationshipGraphColorRule } from '../utils/relationship-graph-colors';

/** Select 中代表不限制当前条件组的稳定占位值。 */
const ANY_CONDITION_VALUE = '__RELATIONSHIP_GRAPH_ANY__';

/** 节点类型条件的中文名称。 */
const NODE_TYPE_LABELS: Record<RelationshipGraphNodeType, string> = {
  PROJECT: '项目',
  AREA: '讨论分区',
  DECISION: '决策',
  MEETING: '会议',
  PROPOSAL: '提案',
  VOTE_ROUND: '投票轮次',
  RESOLUTION: '正式决议',
  USER: '成员',
};

/** “我的关系”条件支持的全部关系语义和中文名称。 */
const RELATION_LABELS: Record<RelationshipGraphRelationType, string> = {
  CONTAINS: '包含',
  HOSTS: '承载',
  DISCUSSES: '讨论',
  PROCESS_COMPONENT: '过程组成',
  CANDIDATE: '候选',
  BASIS: '形成依据',
  SUPERSEDED_BY: '被替代',
  MEMBER: '成员',
  PARTICIPATES: '参与',
  CREATED: '创建',
  OWNS: '负责',
  CONFIRMED: '确认',
};

/** 常见业务状态的中文显示名称，未知状态保留后端原值。 */
const STATUS_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: '进行中 / 生效',
  CLOSED: '已关闭',
  ARCHIVED: '已归档',
  READ_ONLY: '只读',
  DRAFT: '草稿',
  DISCUSSING: '讨论中',
  RESOLVED: '已形成决议',
  CANCELLED: '已取消',
  SCHEDULED: '已预约',
  LIVE: '进行中',
  ENDED: '已结束',
  EXPIRED: '已过期',
  OPEN: '开放中',
  ACCEPTED: '已采纳',
  REJECTED: '已拒绝',
  SUPERSEDED: '已被替代',
  REVOKED: '已撤销',
};

/** 颜色组编辑器的受控属性。 */
export type RelationshipGraphColorRulesProps = {
  /** 当前完整图数据，用于生成真实状态与项目条件选项。 */
  data: RelationshipGraphResponse;
  /** 按数组顺序执行、首条命中优先的颜色组规则。 */
  rules: RelationshipGraphColorRule[];
  /** 颜色组数组变化后的受控更新回调。 */
  onChange: (rules: RelationshipGraphColorRule[]) => void;
};

/** 单条颜色组规则编辑器的属性。 */
type ColorRuleEditorProps = {
  /** 当前规则及其全部条件。 */
  rule: RelationshipGraphColorRule;
  /** 当前规则在优先级数组中的下标。 */
  index: number;
  /** 当前颜色组总数。 */
  ruleCount: number;
  /** 图数据中真实存在的状态选项。 */
  statusOptions: string[];
  /** 图数据中真实存在的项目选项。 */
  projectOptions: Array<{ id: number; title: string }>;
  /** 用完整新对象替换当前规则。 */
  onRuleChange: (rule: RelationshipGraphColorRule) => void;
  /** 向上或向下调整当前规则的优先级。 */
  onMove: (targetIndex: number) => void;
  /** 删除当前规则。 */
  onDelete: () => void;
};

/** 从主题令牌读取新增规则的默认颜色，不在业务 CSS 或组件中固化色值。 */
function readDefaultRuleColor(): string {
  if (typeof window === 'undefined') return 'currentColor';
  return window.getComputedStyle(document.documentElement).getPropertyValue('--chart-2').trim() || 'currentColor';
}

/** 创建一条不限制任何节点条件的新颜色组规则。 */
function createRelationshipGraphColorRule(ruleNumber: number): RelationshipGraphColorRule {
  return {
    id: globalThis.crypto.randomUUID(),
    name: `颜色组 ${ruleNumber}`,
    enabled: true,
    color: readDefaultRuleColor(),
    conditions: {
      nodeTypes: [],
      statuses: [],
      projectIds: [],
      projectTitles: [],
      titleKeyword: '',
      myRelations: [],
    },
  };
}

/** 把原始业务状态转成中文优先、原值可追溯的选项文案。 */
function formatStatusLabel(status: string): string {
  const label = STATUS_LABELS[status];
  return label ? `${label}（${status}）` : status;
}

/** 渲染颜色组列表并维护数组级的新增、移动和删除操作。 */
export function RelationshipGraphColorRules({ data, rules, onChange }: RelationshipGraphColorRulesProps) {
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(data.nodes.flatMap((node) => (node.status ? [node.status] : [])))).sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    [data.nodes],
  );
  const projectOptions = useMemo(
    () =>
      data.nodes
        .filter((node) => node.type === 'PROJECT')
        .map((node) => ({ id: node.entityId, title: node.title }))
        .sort((left, right) => left.title.localeCompare(right.title, 'zh-CN')),
    [data.nodes],
  );

  /** 在现有数组末尾添加最低优先级的新颜色组。 */
  function addColorRule(): void {
    onChange([...rules, createRelationshipGraphColorRule(rules.length + 1)]);
  }

  /** 用编辑后的完整规则替换同标识规则，同时保持优先级顺序。 */
  function updateColorRule(nextRule: RelationshipGraphColorRule): void {
    onChange(rules.map((rule) => (rule.id === nextRule.id ? nextRule : rule)));
  }

  /** 将指定规则移动到受约束的目标优先级位置。 */
  function moveColorRule(ruleId: string, targetIndex: number): void {
    onChange(moveRelationshipGraphColorRule(rules, ruleId, targetIndex));
  }

  /** 从颜色组数组中删除指定规则。 */
  function deleteColorRule(ruleId: string): void {
    onChange(rules.filter((rule) => rule.id !== ruleId));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] leading-4 text-muted-foreground">
          非空条件按 AND 匹配，越靠上的启用规则优先。
        </p>
        <Button size="sm" variant="outline" onClick={addColorRule}>
          <Plus aria-hidden />
          新增
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center">
          <Palette className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-xs text-muted-foreground">暂无自定义颜色组，节点使用主题默认颜色。</p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label="颜色组优先级列表" aria-live="polite">
          {rules.map((rule, index) => (
            <li key={rule.id}>
              <ColorRuleEditor
                rule={rule}
                index={index}
                ruleCount={rules.length}
                statusOptions={statusOptions}
                projectOptions={projectOptions}
                onRuleChange={updateColorRule}
                onMove={(targetIndex) => moveColorRule(rule.id, targetIndex)}
                onDelete={() => deleteColorRule(rule.id)}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 渲染并更新一条颜色组规则的全部 AND 条件。 */
function ColorRuleEditor({
  rule,
  index,
  ruleCount,
  statusOptions,
  projectOptions,
  onRuleChange,
  onMove,
  onDelete,
}: ColorRuleEditorProps) {
  /** 合并当前规则的顶层字段。 */
  function updateRule(patch: Partial<Omit<RelationshipGraphColorRule, 'conditions'>>): void {
    onRuleChange({ ...rule, ...patch });
  }

  /** 合并当前规则的某一组匹配条件。 */
  function updateConditions(patch: Partial<RelationshipGraphColorRule['conditions']>): void {
    onRuleChange({
      ...rule,
      conditions: {
        ...rule.conditions,
        ...patch,
      },
    });
  }

  /** 更新节点类型条件；第一版编辑器允许每个条件组选择一个精确值。 */
  function updateNodeType(value: string): void {
    updateConditions({
      nodeTypes: value === ANY_CONDITION_VALUE ? [] : [value as RelationshipGraphNodeType],
    });
  }

  /** 更新业务状态条件；状态原值直接来自当前可见图数据。 */
  function updateStatus(value: string): void {
    updateConditions({ statuses: value === ANY_CONDITION_VALUE ? [] : [value] });
  }

  /** 更新所属项目条件；项目主键足以稳定匹配同名项目。 */
  function updateProject(value: string): void {
    updateConditions({
      projectIds: value === ANY_CONDITION_VALUE ? [] : [Number(value)],
      projectTitles: [],
    });
  }

  /** 更新当前用户与节点之间的直接关系条件。 */
  function updateMyRelation(value: string): void {
    updateConditions({
      myRelations: value === ANY_CONDITION_VALUE ? [] : [value as RelationshipGraphRelationType],
    });
  }

  const ruleNameId = `relationship-graph-color-rule-${rule.id}-name`;
  const colorId = `relationship-graph-color-rule-${rule.id}-color`;
  const nodeTypeId = `relationship-graph-color-rule-${rule.id}-type`;
  const statusId = `relationship-graph-color-rule-${rule.id}-status`;
  const projectId = `relationship-graph-color-rule-${rule.id}-project`;
  const keywordId = `relationship-graph-color-rule-${rule.id}-keyword`;
  const relationId = `relationship-graph-color-rule-${rule.id}-relation`;

  return (
    <Collapsible defaultOpen={index === 0} className="group/color-rule rounded-lg border bg-card/50">
      <div className="flex min-w-0 items-center gap-1 p-1.5">
        <span
          className="size-3 shrink-0 rounded-full border"
          style={{ backgroundColor: rule.color }}
          aria-hidden
        />
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-between px-2">
            <span className="truncate">{rule.name}</span>
            <ChevronDown
              className="size-3.5 text-muted-foreground transition-transform group-data-[state=open]/color-rule:rotate-180"
              aria-hidden
            />
          </Button>
        </CollapsibleTrigger>
        <Switch
          size="sm"
          checked={rule.enabled}
          onCheckedChange={(enabled) => updateRule({ enabled })}
          aria-label={`${rule.name}是否启用`}
        />
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
          aria-label={`提高${rule.name}优先级`}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={index === ruleCount - 1}
          onClick={() => onMove(index + 1)}
          aria-label={`降低${rule.name}优先级`}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          size="icon-xs"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label={`删除${rule.name}`}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>

      <CollapsibleContent>
        <Separator />
        <div className="space-y-3 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ruleNameId} className="text-xs font-normal">
                规则名称
              </Label>
              <Input
                id={ruleNameId}
                value={rule.name}
                maxLength={80}
                onChange={(event) => updateRule({ name: event.currentTarget.value })}
                aria-label="颜色组规则名称"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={colorId} className="text-xs font-normal">
                CSS 颜色
              </Label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute top-1/2 left-3 size-3 -translate-y-1/2 rounded-full border"
                  style={{ backgroundColor: rule.color }}
                  aria-hidden
                />
                <Input
                  id={colorId}
                  value={rule.color}
                  maxLength={128}
                  className="pl-8 font-mono text-xs"
                  onChange={(event) => updateRule({ color: event.currentTarget.value })}
                  aria-label="节点自定义 CSS 颜色"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={nodeTypeId} className="text-xs font-normal">
                节点类型
              </Label>
              <Select value={rule.conditions.nodeTypes[0] ?? ANY_CONDITION_VALUE} onValueChange={updateNodeType}>
                <SelectTrigger id={nodeTypeId} size="sm" aria-label="颜色规则节点类型">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_CONDITION_VALUE}>不限类型</SelectItem>
                  {Object.entries(NODE_TYPE_LABELS).map(([type, label]) => (
                    <SelectItem key={type} value={type}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={statusId} className="text-xs font-normal">
                业务状态
              </Label>
              <Select value={rule.conditions.statuses[0] ?? ANY_CONDITION_VALUE} onValueChange={updateStatus}>
                <SelectTrigger id={statusId} size="sm" aria-label="颜色规则业务状态">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_CONDITION_VALUE}>不限状态</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status} value={status}>
                      {formatStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={projectId} className="text-xs font-normal">
              所属项目
            </Label>
            <Select
              value={rule.conditions.projectIds[0] ? String(rule.conditions.projectIds[0]) : ANY_CONDITION_VALUE}
              onValueChange={updateProject}
            >
              <SelectTrigger id={projectId} size="sm" aria-label="颜色规则所属项目">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CONDITION_VALUE}>不限项目</SelectItem>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={keywordId} className="text-xs font-normal">
              标题关键词
            </Label>
            <Input
              id={keywordId}
              value={rule.conditions.titleKeyword}
              maxLength={160}
              placeholder="留空表示不限"
              onChange={(event) => updateConditions({ titleKeyword: event.currentTarget.value })}
              aria-label="颜色规则标题关键词"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={relationId} className="text-xs font-normal">
              我的关系
            </Label>
            <Select
              value={rule.conditions.myRelations[0] ?? ANY_CONDITION_VALUE}
              onValueChange={updateMyRelation}
            >
              <SelectTrigger id={relationId} size="sm" aria-label="颜色规则我的关系">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_CONDITION_VALUE}>不限关系</SelectItem>
                {Object.entries(RELATION_LABELS).map(([relation, label]) => (
                  <SelectItem key={relation} value={relation}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
