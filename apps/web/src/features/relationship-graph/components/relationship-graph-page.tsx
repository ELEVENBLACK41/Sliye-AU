/**
 * 本文件组合新版个人关系图谱的搜索、画布、设置、详情与路由交互状态。
 * 工具栏和空状态仅服务本页且共享同一组交互状态，因此保留在入口文件内，避免拆出无独立职责的组件。
 */
'use client';

import type { ChangeEvent, KeyboardEvent } from 'react';
import { useMemo, useRef, useState, useTransition } from 'react';
import {
  FilterX,
  Focus,
  Minus,
  Network,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { RelationshipGraphNode, RelationshipGraphResponse } from '@workspace/contracts/relationship-graph';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/components/sheet';
import { useRelationshipGraphSettings } from '../hooks/use-relationship-graph-settings';
import type { RelationshipGraphCanvasHandle } from '../types/relationship-graph-canvas.types';
import { resolveRelationshipGraphNodeColors } from '../utils/relationship-graph-colors';
import {
  filterRelationshipGraph,
  getRelationshipGraphSearchMatchIds,
  searchRelationshipGraphNodes,
} from '../utils/relationship-graph-data';
import { RelationshipGraphCanvas } from './relationship-graph-canvas';
import { getRelationshipGraphNodeHref } from './relationship-graph-navigation';
import { RelationshipGraphNodeDetail } from './relationship-graph-node-detail';
import { RelationshipGraphSettingsPanel } from './relationship-graph-settings-panel';

/** 搜索列表中展示的节点类型名称。 */
const NODE_TYPE_LABELS = {
  PROJECT: '项目',
  AREA: '讨论分区',
  DECISION: '决策',
  MEETING: '会议',
  PROPOSAL: '提案',
  VOTE_ROUND: '投票轮次',
  RESOLUTION: '正式决议',
  USER: '成员',
} as const;

/** 关系图谱组合页属性。 */
type RelationshipGraphPageProps = {
  /** 服务端完成权限裁剪后传入的纯 JSON 图谱快照。 */
  initialData: RelationshipGraphResponse;
};

/** 渲染当前账号的完整个人关系图谱工作区。 */
export function RelationshipGraphPage({ initialData }: RelationshipGraphPageProps) {
  const router = useRouter();
  const canvasRef = useRef<RelationshipGraphCanvasHandle | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { settings, updateSettings, resetSettings, isHydrated } = useRelationshipGraphSettings(
    initialData.currentUserId,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [isRefreshing, startRefreshTransition] = useTransition();
  const localGraphFocusId = settings.filters.localGraphEnabled ? selectedNodeId : null;
  const filteredData = useMemo(
    () =>
      filterRelationshipGraph(
        initialData,
        { filters: settings.filters },
        { focusedNodeId: localGraphFocusId },
      ),
    [initialData, localGraphFocusId, settings.filters],
  );
  const searchResults = useMemo(
    () => searchRelationshipGraphNodes(filteredData.nodes, searchQuery, 12),
    [filteredData.nodes, searchQuery],
  );
  const searchMatchIds = useMemo(
    () => getRelationshipGraphSearchMatchIds(filteredData.nodes, searchQuery),
    [filteredData.nodes, searchQuery],
  );
  const nodeColors = useMemo(
    () => resolveRelationshipGraphNodeColors(filteredData, settings.colorRules),
    [filteredData, settings.colorRules],
  );
  const selectedNode = initialData.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const isSourceEmpty = initialData.nodes.length === 0;
  const isFilteredEmpty = !isSourceEmpty && filteredData.nodes.length === 0;

  /** 更新搜索词并把键盘候选恢复到第一项。 */
  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchQuery(event.target.value);
    setActiveSearchIndex(0);
    setIsSearchOpen(true);
  }

  /** 通过方向键选择搜索候选，回车后定位节点。 */
  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setIsSearchOpen(false);
      return;
    }

    if (searchResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsSearchOpen(true);
      setActiveSearchIndex((current) => (current + 1) % searchResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsSearchOpen(true);
      setActiveSearchIndex((current) => (current - 1 + searchResults.length) % searchResults.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const targetNode = searchResults[Math.min(activeSearchIndex, searchResults.length - 1)];
      if (targetNode) selectAndFocusNode(targetNode.id);
    }
  }

  /** 在搜索框重新获得焦点时恢复候选列表。 */
  function handleSearchFocus(): void {
    if (searchQuery.trim()) setIsSearchOpen(true);
  }

  /** 搜索框失焦后延迟关闭候选，允许候选按钮先处理点击。 */
  function handleSearchBlur(): void {
    window.setTimeout(() => setIsSearchOpen(false), 120);
  }

  /** 选中节点、关闭搜索候选并在下一帧将其移到画布中心。 */
  function selectAndFocusNode(nodeId: string): void {
    setSelectedNodeId(nodeId);
    setIsSearchOpen(false);
    setIsDetailSheetOpen(isMobileViewport());
    window.requestAnimationFrame(() => canvasRef.current?.focusNode(nodeId));
  }

  /** 接收画布单击结果，并在移动端自动打开详情抽屉。 */
  function handleNodeSelect(nodeId: string | null): void {
    setSelectedNodeId(nodeId);
    setIsDetailSheetOpen(Boolean(nodeId) && isMobileViewport());
  }

  /** 双击业务节点时跳转到已有新版页面，成员节点仍停留在安全摘要。 */
  function handleNodeDoubleClick(node: RelationshipGraphNode): void {
    setSelectedNodeId(node.id);
    const href = getRelationshipGraphNodeHref(node);
    if (href) router.push(href);
  }

  /** 关闭节点详情并取消画布选中态。 */
  function closeNodeDetail(): void {
    setSelectedNodeId(null);
    setIsDetailSheetOpen(false);
  }

  /** 通过 Server Component 刷新真实快照，同时保留客户端本地设置。 */
  function refreshGraph(): void {
    startRefreshTransition(() => router.refresh());
  }

  /** 恢复默认设置并清除可能作为局部图谱中心的旧选中项。 */
  function resetGraphSettings(): void {
    resetSettings();
    closeNodeDetail();
  }

  return (
    <section
      className="relative mt-6 flex min-w-0 flex-none flex-col overflow-hidden rounded-3xl border bg-card/80 shadow-sm lg:-mb-6 lg:min-h-0 lg:flex-1 lg:rounded-b-none"
      aria-label="个人关系图谱"
      aria-busy={isRefreshing}
    >
      <RelationshipGraphToolbar
        canvasRef={canvasRef}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        searchResults={searchResults}
        activeSearchIndex={activeSearchIndex}
        isSearchOpen={isSearchOpen}
        visibleNodeCount={filteredData.nodes.length}
        visibleEdgeCount={filteredData.edges.length}
        generatedAt={initialData.generatedAt}
        isRefreshing={isRefreshing}
        isSettingsHydrated={isHydrated}
        onSearchChange={handleSearchChange}
        onSearchKeyDown={handleSearchKeyDown}
        onSearchFocus={handleSearchFocus}
        onSearchBlur={handleSearchBlur}
        onSearchResultSelect={selectAndFocusNode}
        onRefresh={refreshGraph}
        onOpenSettings={() => setIsSettingsSheetOpen(true)}
      />

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <main className="relative flex min-h-[38rem] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
          {isSourceEmpty ? (
            <RelationshipGraphEmptyState onRefresh={refreshGraph} isRefreshing={isRefreshing} />
          ) : isFilteredEmpty ? (
            <RelationshipGraphFilteredEmptyState onReset={resetGraphSettings} />
          ) : (
            <RelationshipGraphCanvas
              ref={canvasRef}
              data={filteredData}
              settings={settings}
              selectedNodeId={selectedNodeId}
              searchMatchIds={searchMatchIds}
              nodeColors={nodeColors}
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
            />
          )}

          {selectedNode ? (
            <div className="absolute top-4 right-4 bottom-4 z-20 hidden w-80 overflow-hidden rounded-2xl border bg-card shadow-xl lg:block">
              <RelationshipGraphNodeDetail
                node={selectedNode}
                data={initialData}
                onClose={closeNodeDetail}
                onRelatedNodeSelect={selectAndFocusNode}
              />
            </div>
          ) : null}
        </main>

        <aside className="hidden min-h-0 overflow-y-auto border-l bg-card/70 lg:block" aria-label="关系图谱设置">
          <RelationshipGraphSettingsPanel
            settings={settings}
            data={initialData}
            onSettingsChange={updateSettings}
            onReset={resetGraphSettings}
          />
        </aside>
      </div>

      <Sheet open={isSettingsSheetOpen} onOpenChange={setIsSettingsSheetOpen}>
        <SheetContent side="right" className="w-[min(24rem,92vw)] gap-0 overflow-y-auto p-0 lg:hidden">
          <SheetHeader className="border-b">
            <SheetTitle>关系图谱设置</SheetTitle>
            <SheetDescription>筛选节点、调整画布外观和力导向布局。</SheetDescription>
          </SheetHeader>
          <RelationshipGraphSettingsPanel
            settings={settings}
            data={initialData}
            onSettingsChange={updateSettings}
            onReset={resetGraphSettings}
          />
        </SheetContent>
      </Sheet>

      <Sheet
        open={isDetailSheetOpen && selectedNode !== null}
        onOpenChange={(open) => {
          setIsDetailSheetOpen(open);
          if (!open) setSelectedNodeId(null);
        }}
      >
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-hidden p-0 lg:hidden" showCloseButton={false}>
          {selectedNode ? (
            <RelationshipGraphNodeDetail
              node={selectedNode}
              data={initialData}
              onClose={closeNodeDetail}
              onRelatedNodeSelect={selectAndFocusNode}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

/** 页面工具栏属性。 */
type RelationshipGraphToolbarProps = {
  /** 画布命令引用。 */
  canvasRef: React.RefObject<RelationshipGraphCanvasHandle | null>;
  /** 搜索输入框引用。 */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  /** 当前搜索词。 */
  searchQuery: string;
  /** 已排序的搜索候选。 */
  searchResults: RelationshipGraphNode[];
  /** 键盘当前选中的候选下标。 */
  activeSearchIndex: number;
  /** 是否展示搜索候选。 */
  isSearchOpen: boolean;
  /** 当前可见节点数。 */
  visibleNodeCount: number;
  /** 当前可见连线数。 */
  visibleEdgeCount: number;
  /** 服务端快照生成时间。 */
  generatedAt: string;
  /** 是否正在刷新服务端快照。 */
  isRefreshing: boolean;
  /** 本地设置是否已完成读取。 */
  isSettingsHydrated: boolean;
  /** 搜索输入变化回调。 */
  onSearchChange: (event: ChangeEvent<HTMLInputElement>) => void;
  /** 搜索键盘操作回调。 */
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** 搜索框聚焦回调。 */
  onSearchFocus: () => void;
  /** 搜索框失焦回调。 */
  onSearchBlur: () => void;
  /** 搜索结果选择回调。 */
  onSearchResultSelect: (nodeId: string) => void;
  /** 主动刷新回调。 */
  onRefresh: () => void;
  /** 打开移动设置回调。 */
  onOpenSettings: () => void;
};

/** 渲染搜索、快照状态和画布命令工具栏。 */
function RelationshipGraphToolbar({
  canvasRef,
  searchInputRef,
  searchQuery,
  searchResults,
  activeSearchIndex,
  isSearchOpen,
  visibleNodeCount,
  visibleEdgeCount,
  generatedAt,
  isRefreshing,
  isSettingsHydrated,
  onSearchChange,
  onSearchKeyDown,
  onSearchFocus,
  onSearchBlur,
  onSearchResultSelect,
  onRefresh,
  onOpenSettings,
}: RelationshipGraphToolbarProps) {
  return (
    <header className="relative z-30 flex shrink-0 flex-col gap-3 border-b bg-card/85 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          placeholder="搜索项目、决策、会议或成员"
          className="h-10 rounded-full bg-background pr-4 pl-9"
          role="combobox"
          aria-expanded={isSearchOpen && searchQuery.trim().length > 0}
          aria-controls="relationship-graph-search-results"
          aria-autocomplete="list"
          onChange={onSearchChange}
          onKeyDown={onSearchKeyDown}
          onFocus={onSearchFocus}
          onBlur={onSearchBlur}
        />
        {isSearchOpen && searchQuery.trim() ? (
          <SearchResultList
            results={searchResults}
            activeIndex={activeSearchIndex}
            onSelect={onSearchResultSelect}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="hidden items-center gap-2 xl:flex">
          <Badge variant="outline">{visibleNodeCount} 个节点</Badge>
          <Badge variant="outline">{visibleEdgeCount} 条关系</Badge>
          <span className="text-xs text-muted-foreground" title={formatGraphDateTime(generatedAt)}>
            {isRefreshing ? '正在刷新快照…' : `更新于 ${formatGraphDateTime(generatedAt)}`}
          </span>
          {!isSettingsHydrated ? <span className="text-xs text-muted-foreground">正在读取本地设置…</span> : null}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => canvasRef.current?.fitCanvas()}>
          <Focus aria-hidden />
          适应画布
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => canvasRef.current?.zoomOut()} aria-label="缩小图谱">
          <Minus aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => canvasRef.current?.zoomIn()} aria-label="放大图谱">
          <Plus aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => canvasRef.current?.restartLayout()} aria-label="重播力导向布局">
          <RotateCcw aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={onRefresh} disabled={isRefreshing} aria-label="刷新业务快照">
          <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} aria-hidden />
        </Button>
        <Button type="button" variant="outline" size="icon" className="lg:hidden" onClick={onOpenSettings} aria-label="打开图谱设置">
          <Settings2 aria-hidden />
        </Button>
      </div>
    </header>
  );
}

/** 搜索候选列表属性。 */
type SearchResultListProps = {
  /** 当前匹配的节点。 */
  results: RelationshipGraphNode[];
  /** 键盘当前选中的候选下标。 */
  activeIndex: number;
  /** 选择节点回调。 */
  onSelect: (nodeId: string) => void;
};

/** 渲染支持键盘下标提示的节点搜索候选。 */
function SearchResultList({ results, activeIndex, onSelect }: SearchResultListProps) {
  return (
    <div
      id="relationship-graph-search-results"
      role="listbox"
      className="absolute top-full right-0 left-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border bg-popover p-1.5 text-popover-foreground shadow-xl"
    >
      {results.length > 0 ? (
        results.map((node, index) => (
          <Button
            key={node.id}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            variant={index === activeIndex ? 'secondary' : 'ghost'}
            className="h-auto w-full justify-start rounded-xl px-3 py-2.5 text-left"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(node.id)}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{node.title}</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                {NODE_TYPE_LABELS[node.type]}
                {node.subtitle ? ` · ${node.subtitle}` : ''}
              </span>
            </span>
          </Button>
        ))
      ) : (
        <p className="px-3 py-5 text-center text-sm text-muted-foreground">没有匹配的节点</p>
      )}
    </div>
  );
}

/** 渲染当前账号尚无任何可见业务数据的真实空状态。 */
function RelationshipGraphEmptyState({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <div className="grid min-h-[38rem] flex-1 place-items-center p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Network aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold">还没有可以形成图谱的业务数据</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          创建项目并开始讨论、决策或会议后，真实关系会自动汇聚到这里。
        </p>
        <Button type="button" variant="outline" className="mt-5" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} aria-hidden />
          重新读取
        </Button>
      </div>
    </div>
  );
}

/** 渲染设置组合导致没有可见节点时的筛选空状态。 */
function RelationshipGraphFilteredEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="grid min-h-[38rem] flex-1 place-items-center p-6 text-center">
      <div className="max-w-md">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <FilterX aria-hidden />
        </span>
        <h2 className="mt-4 text-lg font-semibold">当前筛选下没有节点</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">可以重新启用节点类型、显示孤立节点，或恢复默认图谱设置。</p>
        <Button type="button" variant="outline" className="mt-5" onClick={onReset}>
          恢复默认设置
        </Button>
      </div>
    </div>
  );
}

/** 判断当前交互是否发生在移动端布局范围。 */
function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches;
}

/** 使用上海时区格式化快照生成时间。 */
function formatGraphDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
