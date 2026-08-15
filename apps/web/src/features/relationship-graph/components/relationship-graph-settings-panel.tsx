/**
 * 本文件实现可同时复用于桌面侧栏与移动端 Sheet 的个人关系图谱设置面板。
 */
'use client';

import type { ReactNode } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import type { RelationshipGraphNodeType, RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';
import { Button } from '@workspace/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@workspace/ui/components/collapsible';
import { Label } from '@workspace/ui/components/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';
import { Separator } from '@workspace/ui/components/separator';
import { Slider } from '@workspace/ui/components/slider';
import { Switch } from '@workspace/ui/components/switch';
import { cn } from '@workspace/ui/lib/utils';

import type {
  RelationshipGraphSettings,
  RelationshipGraphSettingsPatch,
} from '../types/relationship-graph-settings.types';
import { RELATIONSHIP_GRAPH_NODE_TYPES } from '../utils/relationship-graph-settings';
import { RelationshipGraphColorRules } from './relationship-graph-color-rules';

/** 各类业务节点在中文设置面板中的名称。 */
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

/** 设置面板接收的受控属性。 */
export type RelationshipGraphSettingsPanelProps = {
  /** 当前用户可见的完整关系图谱快照，用于显示数量并生成颜色条件选项。 */
  data: RelationshipGraphResponse;
  /** 当前已通过 Zod 校验的完整设置。 */
  settings: RelationshipGraphSettings;
  /** 合并设置分组补丁的回调，可直接传入设置 Hook 的 `updateSettings`。 */
  onSettingsChange: (patch: RelationshipGraphSettingsPatch) => void;
  /** 将当前用户设置恢复默认值的可选回调。 */
  onReset?: () => void;
  /** 桌面侧栏或移动端 Sheet 需要补充的容器样式。 */
  className?: string;
};

/** 带数值反馈的单值滑块属性。 */
type SettingsSliderRowProps = {
  /** 表单控件的稳定标识。 */
  id: string;
  /** 滑块上方展示的中文名称。 */
  label: string;
  /** 当前单一滑块值。 */
  value: number;
  /** 允许的最小值。 */
  min: number;
  /** 允许的最大值。 */
  max: number;
  /** 每次键盘或指针操作改变的步长。 */
  step: number;
  /** 将原始值格式化为用户可读文本。 */
  formatValue?: (value: number) => string;
  /** 数值变化后的受控更新回调。 */
  onValueChange: (value: number) => void;
};

/** 二态设置行的受控属性。 */
type SettingsSwitchRowProps = {
  /** 表单控件的稳定标识。 */
  id: string;
  /** 开关旁展示的中文名称。 */
  label: string;
  /** 当前是否启用。 */
  checked: boolean;
  /** 可选的辅助说明或节点数量。 */
  description?: string;
  /** 是否禁止用户改变该开关。 */
  disabled?: boolean;
  /** 开关变化后的受控更新回调。 */
  onCheckedChange: (checked: boolean) => void;
};

/** 把任意数值限制在指定区间，防止 Slider 事件的异常值进入设置。 */
function clampSettingValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 渲染一组可折叠设置，使桌面和移动端都能保持紧凑的信息层级。 */
function SettingsSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/settings-section">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-between rounded-none px-3 font-medium">
          {title}
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform group-data-[state=open]/settings-section:rotate-180"
            aria-hidden
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 px-3 pt-1 pb-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** 渲染一个带标签和辅助说明的 shadcn 二态开关。 */
function SettingsSwitchRow({
  id,
  label,
  checked,
  description,
  disabled,
  onCheckedChange,
}: SettingsSwitchRowProps) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-xs font-normal">
          {label}
        </Label>
        {description ? <p className="mt-1 text-[0.68rem] leading-4 text-muted-foreground">{description}</p> : null}
      </div>
      <Switch
        id={id}
        size="sm"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

/** 渲染一个显示精确当前值的 shadcn 单值滑块。 */
function SettingsSliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  formatValue = String,
  onValueChange,
}: SettingsSliderRowProps) {
  /** 将 Radix Slider 数组值收敛为当前设置需要的单一数值。 */
  function handleValueChange(values: number[]): void {
    const nextValue = values[0];
    if (nextValue === undefined) return;
    onValueChange(clampSettingValue(nextValue, min, max));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <output htmlFor={id} className="tabular-nums text-muted-foreground">
          {formatValue(value)}
        </output>
      </div>
      <Slider
        id={id}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={handleValueChange}
        aria-label={label}
      />
    </div>
  );
}

/** 渲染关系图谱筛选、外观、力参数和颜色规则的完整受控设置面板。 */
export function RelationshipGraphSettingsPanel({
  data,
  settings,
  onSettingsChange,
  onReset,
  className,
}: RelationshipGraphSettingsPanelProps) {
  /** 更新单一节点类型的可见状态，并保留其余类型选择。 */
  function updateNodeType(type: RelationshipGraphNodeType, checked: boolean): void {
    onSettingsChange({
      filters: {
        enabledNodeTypes: {
          ...settings.filters.enabledNodeTypes,
          [type]: checked,
        },
      },
    });
  }

  /** 将 Select 返回的字符串收敛为约定的 1 至 4 层邻接深度。 */
  function updateLocalGraphDepth(value: string): void {
    const depth = Number(value);
    if (depth !== 1 && depth !== 2 && depth !== 3 && depth !== 4) return;
    onSettingsChange({ filters: { localGraphDepth: depth } });
  }

  return (
    <section aria-label="关系图谱设置" className={cn('min-w-0 bg-background text-foreground', className)}>
      <header className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">图谱设置</h2>
          <p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">仅保存在当前账号的此浏览器中</p>
        </div>
        {onReset ? (
          <Button size="icon-sm" variant="ghost" onClick={onReset} aria-label="恢复图谱默认设置">
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </header>
      <Separator />

      <SettingsSection title="筛选">
        <div className="space-y-2.5">
          {RELATIONSHIP_GRAPH_NODE_TYPES.map((type) => (
            <SettingsSwitchRow
              key={type}
              id={`relationship-graph-node-type-${type.toLocaleLowerCase()}`}
              label={NODE_TYPE_LABELS[type]}
              description={`${data.counts[type]} 个节点`}
              checked={settings.filters.enabledNodeTypes[type]}
              onCheckedChange={(checked) => updateNodeType(type, checked)}
            />
          ))}
        </div>
        <Separator />
        <SettingsSwitchRow
          id="relationship-graph-only-mine"
          label="仅显示与我直接相关"
          description="保留我本人、直接连线及后端标记了我角色的节点"
          checked={settings.filters.onlyDirectlyRelatedToMe}
          onCheckedChange={(checked) => onSettingsChange({ filters: { onlyDirectlyRelatedToMe: checked } })}
        />
        <SettingsSwitchRow
          id="relationship-graph-show-orphans"
          label="显示孤立节点"
          checked={settings.filters.showOrphans}
          onCheckedChange={(checked) => onSettingsChange({ filters: { showOrphans: checked } })}
        />
        <SettingsSwitchRow
          id="relationship-graph-local-enabled"
          label="局部图谱"
          description="围绕当前选中节点展示有限层级的关系"
          checked={settings.filters.localGraphEnabled}
          onCheckedChange={(checked) => onSettingsChange({ filters: { localGraphEnabled: checked } })}
        />
        <div className="space-y-2">
          <Label htmlFor="relationship-graph-local-depth" className="text-xs font-normal">
            邻接深度
          </Label>
          <Select
            value={String(settings.filters.localGraphDepth)}
            disabled={!settings.filters.localGraphEnabled}
            onValueChange={updateLocalGraphDepth}
          >
            <SelectTrigger id="relationship-graph-local-depth" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4].map((depth) => (
                <SelectItem key={depth} value={String(depth)}>
                  {depth} 层邻接节点
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </SettingsSection>
      <Separator />

      <SettingsSection title="颜色组">
        <RelationshipGraphColorRules
          data={data}
          rules={settings.colorRules}
          onChange={(colorRules) => onSettingsChange({ colorRules })}
        />
      </SettingsSection>
      <Separator />

      <SettingsSection title="外观">
        <SettingsSwitchRow
          id="relationship-graph-show-arrows"
          label="显示关系箭头"
          checked={settings.appearance.showArrows}
          onCheckedChange={(checked) => onSettingsChange({ appearance: { showArrows: checked } })}
        />
        <SettingsSliderRow
          id="relationship-graph-label-opacity"
          label="文字透明度"
          value={settings.appearance.labelOpacity}
          min={0}
          max={1}
          step={0.05}
          formatValue={(value) => `${Math.round(value * 100)}%`}
          onValueChange={(labelOpacity) => onSettingsChange({ appearance: { labelOpacity } })}
        />
        <SettingsSliderRow
          id="relationship-graph-node-scale"
          label="节点大小"
          value={settings.appearance.nodeSizeScale}
          min={0.4}
          max={3}
          step={0.05}
          formatValue={(value) => `${value.toFixed(2)}×`}
          onValueChange={(nodeSizeScale) => onSettingsChange({ appearance: { nodeSizeScale } })}
        />
        <SettingsSliderRow
          id="relationship-graph-link-scale"
          label="连线粗细"
          value={settings.appearance.linkWidthScale}
          min={0.4}
          max={4}
          step={0.05}
          formatValue={(value) => `${value.toFixed(2)}×`}
          onValueChange={(linkWidthScale) => onSettingsChange({ appearance: { linkWidthScale } })}
        />
      </SettingsSection>
      <Separator />

      <SettingsSection title="力度">
        <SettingsSliderRow
          id="relationship-graph-center-force"
          label="图谱向心力"
          value={settings.forces.centerStrength}
          min={0}
          max={1}
          step={0.01}
          formatValue={(value) => value.toFixed(2)}
          onValueChange={(centerStrength) => onSettingsChange({ forces: { centerStrength } })}
        />
        <SettingsSliderRow
          id="relationship-graph-charge-force"
          label="节点间的排斥力"
          value={settings.forces.chargeStrength}
          min={-1200}
          max={-10}
          step={10}
          formatValue={(value) => value.toFixed(0)}
          onValueChange={(chargeStrength) => onSettingsChange({ forces: { chargeStrength } })}
        />
        <SettingsSliderRow
          id="relationship-graph-link-force"
          label="相连节点的吸引力"
          value={settings.forces.linkStrength}
          min={0}
          max={1}
          step={0.01}
          formatValue={(value) => value.toFixed(2)}
          onValueChange={(linkStrength) => onSettingsChange({ forces: { linkStrength } })}
        />
        <SettingsSliderRow
          id="relationship-graph-link-distance"
          label="连线长度"
          value={settings.forces.linkDistance}
          min={20}
          max={360}
          step={4}
          formatValue={(value) => `${value.toFixed(0)} px`}
          onValueChange={(linkDistance) => onSettingsChange({ forces: { linkDistance } })}
        />
      </SettingsSection>
    </section>
  );
}
