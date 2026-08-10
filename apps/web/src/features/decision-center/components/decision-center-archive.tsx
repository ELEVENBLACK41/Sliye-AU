/**
 * 本文件实现跨项目决策档案的服务端筛选、真实分页与同页只读详情抽屉。
 */
'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type {
  DecisionCenterArchiveItem,
  DecisionCenterArchiveResponse,
  DecisionStatus,
} from '@workspace/contracts/decisions';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@workspace/ui/components/select';

import {
  getDecisionCenterArchivePage,
  getDecisionCenterReadOnlyDetail,
} from '../services/decision-center-client.service';
import type { DecisionCenterReadOnlyDetail } from '../types/decision-center.type';
import { DecisionArchiveDetailSheet } from './decision-archive-detail-sheet';

/** 档案区属性。 */
type DecisionCenterArchiveProps = {
  /** 服务端返回的首屏分页档案。 */
  archive: DecisionCenterArchiveResponse;
};

/** 档案筛选支持的范围值。 */
type ScopeFilter = 'ALL' | 'PROJECT' | 'AREA';
/** 档案筛选支持的状态值。 */
type StatusFilter = 'ALL' | DecisionStatus;

/** 档案列表固定单页数量。 */
const ARCHIVE_PAGE_SIZE = 10;

/** 决策状态展示元数据。 */
const statusMeta: Record<DecisionStatus, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  DRAFT: { label: '草稿', variant: 'outline' },
  DISCUSSING: { label: '讨论中', variant: 'secondary' },
  RESOLVED: { label: '已形成决议', variant: 'default' },
  CANCELLED: { label: '已取消', variant: 'outline' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
};

/** 渲染跨项目分页档案与同页只读详情。 */
export function DecisionCenterArchive({ archive }: DecisionCenterArchiveProps) {
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword.trim());
  const [scope, setScope] = useState<ScopeFilter>('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(archive.page);
  const [archiveData, setArchiveData] = useState(archive);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveRetryKey, setArchiveRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DecisionCenterReadOnlyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const archiveRequestSequence = useRef(0);
  const detailRequestSequence = useRef(0);
  const skipInitialArchiveRequest = useRef(true);

  /** 筛选或翻页后只读取当前档案页，并取消已经过期的浏览器请求。 */
  useEffect(() => {
    if (skipInitialArchiveRequest.current) {
      skipInitialArchiveRequest.current = false;
      return;
    }
    const controller = new AbortController();
    const sequence = ++archiveRequestSequence.current;
    setArchiveLoading(true);
    setArchiveError(null);
    void getDecisionCenterArchivePage(
      {
        keyword: deferredKeyword || undefined,
        scope: scope === 'ALL' ? undefined : scope,
        status: status === 'ALL' ? undefined : status,
        page,
        pageSize: ARCHIVE_PAGE_SIZE,
      },
      controller.signal,
    )
      .then((nextPage) => {
        if (sequence === archiveRequestSequence.current) setArchiveData(nextPage);
      })
      .catch((requestError: unknown) => {
        if (sequence === archiveRequestSequence.current) {
          setArchiveError(requestError instanceof Error ? requestError.message : '决策档案加载失败');
        }
      })
      .finally(() => {
        if (sequence === archiveRequestSequence.current) setArchiveLoading(false);
      });
    return () => controller.abort();
  }, [archiveRetryKey, deferredKeyword, page, scope, status]);

  /** 更新搜索词并回到第一页。 */
  function handleKeywordChange(value: string): void {
    setKeyword(value);
    setPage(1);
  }

  /** 更新协作范围筛选并回到第一页。 */
  function handleScopeChange(value: ScopeFilter): void {
    setScope(value);
    setPage(1);
  }

  /** 更新决策状态筛选并回到第一页。 */
  function handleStatusChange(value: StatusFilter): void {
    setStatus(value);
    setPage(1);
  }

  /** 打开当前页面只读抽屉并读取完整过程快照。 */
  async function openDetail(decisionId: number): Promise<void> {
    const sequence = ++detailRequestSequence.current;
    setSelectedId(decisionId);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const nextDetail = await getDecisionCenterReadOnlyDetail(decisionId);
      if (sequence === detailRequestSequence.current) setDetail(nextDetail);
    } catch (requestError) {
      if (sequence === detailRequestSequence.current) {
        setDetailError(requestError instanceof Error ? requestError.message : '决策档案加载失败');
      }
    } finally {
      if (sequence === detailRequestSequence.current) setDetailLoading(false);
    }
  }

  /** 关闭抽屉时失效当前详情请求，避免过期响应覆盖下一次选择。 */
  function handleOpenChange(open: boolean): void {
    if (open) return;
    detailRequestSequence.current += 1;
    setSelectedId(null);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  return (
    <section aria-labelledby="decision-archive-title">
      <Card className="rounded-[1.75rem] border-border/70 bg-decision-surface py-0 shadow-none">
        <CardHeader className="gap-4 px-5 pt-5 pb-3 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium tracking-[0.18em] text-muted-foreground">
                CROSS-PROJECT ARCHIVE
              </p>
              <CardTitle id="decision-archive-title" className="mt-1 text-lg tracking-tight">
                决策过程档案
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {archiveLoading ? '正在更新…' : `共 ${archiveData.total} 项可见决策`}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_10rem_10rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={keyword}
                onChange={(event) => handleKeywordChange(event.currentTarget.value)}
                className="rounded-full bg-background/45 pl-9"
                placeholder="搜索决策、项目或部门"
              />
            </div>
            <Select value={scope} onValueChange={(value) => handleScopeChange(value as ScopeFilter)}>
              <SelectTrigger className="w-full rounded-full bg-background/45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部范围</SelectItem>
                <SelectItem value="PROJECT">项目级</SelectItem>
                <SelectItem value="AREA">小组级</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(value) => handleStatusChange(value as StatusFilter)}>
              <SelectTrigger className="w-full rounded-full bg-background/45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                {Object.entries(statusMeta).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6">
          {archiveError ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-3 text-xs text-muted-foreground">
              <span>{archiveError}</span>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full"
                onClick={() => setArchiveRetryKey((value) => value + 1)}
              >
                <RefreshCw aria-hidden />
                重试
              </Button>
            </div>
          ) : null}
          <div className={archiveLoading ? 'pointer-events-none opacity-55' : undefined} aria-busy={archiveLoading}>
            {archiveData.items.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                没有符合当前筛选条件的决策档案。
              </p>
            ) : (
              <ul className="grid gap-2">
                {archiveData.items.map((item) => (
                  <ArchiveRow key={item.id} item={item} onOpen={openDetail} />
                ))}
              </ul>
            )}
          </div>
          <ArchivePagination
            page={archiveData.page}
            totalPages={archiveData.totalPages}
            disabled={archiveLoading}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
      <DecisionArchiveDetailSheet
        open={selectedId !== null}
        onOpenChange={handleOpenChange}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        onRetry={() => {
          if (selectedId !== null) void openDetail(selectedId);
        }}
      />
    </section>
  );
}

/** 渲染一条可展开但不跳转的档案记录。 */
function ArchiveRow({ item, onOpen }: { item: DecisionCenterArchiveItem; onOpen: (id: number) => void }) {
  const status = statusMeta[item.status];
  return (
    <li>
      <Button
        variant="ghost"
        className="h-auto w-full justify-start rounded-2xl border bg-background/38 p-0 text-left hover:bg-background/70"
        onClick={() => onOpen(item.id)}
      >
        <span className="grid w-full gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{item.title}</span>
            <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
              <span>{item.project.title}</span>
              <span>{item.scope === 'AREA' ? `小组 · ${item.area?.name ?? '未命名'}` : '项目级'}</span>
              <span>{item.departmentName}</span>
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <span className="text-xs font-normal text-muted-foreground">
              {item.participantCount} 人 · 提案 {item.proposalCount} · 投票 {item.voteRoundCount} · 决议{' '}
              {item.resolutionCount}
            </span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </Button>
    </li>
  );
}

/** 渲染数据库分页控制；只有一页时不占据额外空间。 */
function ArchivePagination({
  page,
  totalPages,
  disabled,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="mt-4 flex items-center justify-end gap-2" aria-label="决策档案分页">
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="上一页"
      >
        <ChevronLeft aria-hidden />
        上一页
      </Button>
      <span className="min-w-20 text-center text-xs text-muted-foreground">
        第 {page} / {totalPages} 页
      </span>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={disabled || page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="下一页"
      >
        下一页
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
