/**
 * 本文件展示关系图谱当前节点的业务摘要、上下文和相邻关系，并提供新版页面入口。
 */
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock,
  FileCheck2,
  FolderKanban,
  GitBranch,
  Lightbulb,
  Link2,
  Map as MapIcon,
  MessagesSquare,
  UserRound,
  Video,
  Vote,
  X,
} from 'lucide-react';
import Link from 'next/link';
import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphNodeType,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';

import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Separator } from '@workspace/ui/components/separator';
import { getRelationshipGraphNodeHref } from './relationship-graph-navigation';

/** 节点类型的中文名称和详情图标。 */
const NODE_TYPE_META: Record<RelationshipGraphNodeType, { label: string; icon: LucideIcon }> = {
  PROJECT: { label: '项目', icon: FolderKanban },
  AREA: { label: '讨论分区', icon: MessagesSquare },
  DECISION: { label: '决策', icon: GitBranch },
  MEETING: { label: '会议', icon: Video },
  PROPOSAL: { label: '提案', icon: Lightbulb },
  VOTE_ROUND: { label: '投票轮次', icon: Vote },
  RESOLUTION: { label: '正式决议', icon: FileCheck2 },
  USER: { label: '成员', icon: UserRound },
};

/** 常见业务状态的中文说明。 */
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '进行中',
  ARCHIVED: '已归档',
  DRAFT: '草稿',
  DISCUSSING: '讨论中',
  RESOLVED: '已形成决议',
  CANCELLED: '已取消',
  OPEN: '开放中',
  CLOSED: '已关闭',
  ACCEPTED: '已采纳',
  REJECTED: '已否决',
  WITHDRAWN: '已撤回',
  SCHEDULED: '待开始',
  LIVE: '进行中',
  ENDED: '已结束',
  EXPIRED: '已过期',
  EFFECTIVE: '已生效',
  REVOKED: '已撤销',
  SUPERSEDED: '已被替代',
};

/** 当前用户业务角色的中文说明。 */
const ROLE_LABELS: Record<string, string> = {
  SELF: '当前账号',
  OWNER: '负责人',
  MANAGER: '管理员',
  MEMBER: '成员',
  CREATOR: '创建人',
  PARTICIPANT: '参与者',
  HOST: '主持人',
  CO_HOST: '协同主持人',
  ATTENDEE: '参会人',
  INVITED: '待响应邀请',
  CONFIRMER: '确认人',
};

/** 节点详情组件属性。 */
type RelationshipGraphNodeDetailProps = {
  /** 当前选中的业务节点。 */
  node: RelationshipGraphNode;
  /** 用于解析范围名称和相邻节点的完整可见快照。 */
  data: RelationshipGraphResponse;
  /** 关闭当前详情的回调。 */
  onClose: () => void;
  /** 在当前画布内改为选中直接相邻节点。 */
  onRelatedNodeSelect?: (nodeId: string) => void;
};

/** 相邻关系在详情列表中的展示模型。 */
type RelatedNodeItem = {
  /** 聚合关系边。 */
  edge: RelationshipGraphEdge;
  /** 当前边另一端的节点。 */
  node: RelationshipGraphNode;
  /** 当前节点相对这条有向边的位置。 */
  direction: 'outgoing' | 'incoming';
};

/** 渲染当前选中节点的可读业务详情。 */
export function RelationshipGraphNodeDetail({
  node,
  data,
  onClose,
  onRelatedNodeSelect,
}: RelationshipGraphNodeDetailProps) {
  const meta = NODE_TYPE_META[node.type];
  const Icon = meta.icon;
  const href = getRelationshipGraphNodeHref(node);
  const relatedNodes = buildRelatedNodeItems(node, data);
  const projectTitle = node.type === 'PROJECT' ? null : findScopeTitle(data, 'PROJECT', node.projectId);
  const areaTitle = node.type === 'AREA' ? null : findScopeTitle(data, 'AREA', node.areaId);
  const decisionTitle = findScopeTitle(data, 'DECISION', node.decisionId);
  const roleLabel = node.currentUserRole ? ROLE_LABELS[node.currentUserRole] ?? node.currentUserRole : null;
  const statusLabel = node.status ? STATUS_LABELS[node.status] ?? node.status : null;

  return (
    <article className="flex max-h-full min-h-0 flex-col bg-card text-card-foreground" aria-label={`${node.title} 节点详情`}>
      <header className="flex shrink-0 items-start gap-3 p-4">
        {node.type === 'USER' ? (
          <Avatar className="size-11 border">
            <AvatarImage src={node.avatarUrl ?? undefined} alt={node.title} />
            <AvatarFallback>{node.title.slice(0, 1)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{meta.label}</Badge>
            {statusLabel ? <Badge variant="secondary">{statusLabel}</Badge> : null}
          </div>
          <h2 className="mt-2 break-words text-base font-semibold leading-6">{node.title}</h2>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="关闭节点详情">
          <X aria-hidden />
        </Button>
      </header>

      <Separator />

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {node.subtitle ? <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{node.subtitle}</p> : null}

        <dl className="grid gap-3 text-sm">
          {roleLabel ? <DetailTerm label="我的关系" value={roleLabel} /> : null}
          {projectTitle ? <DetailTerm label="所属项目" value={projectTitle} /> : null}
          {areaTitle ? <DetailTerm label="讨论分区" value={areaTitle} /> : null}
          {decisionTitle && node.type !== 'DECISION' ? <DetailTerm label="所属决策" value={decisionTitle} /> : null}
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="size-3.5" aria-hidden />
              业务时间
            </dt>
            <dd className="text-right">
              <time dateTime={node.timestamp}>{formatGraphDateTime(node.timestamp)}</time>
            </dd>
          </div>
        </dl>

        <section aria-labelledby="relationship-node-links-title">
          <div className="flex items-center justify-between gap-3">
            <h3 id="relationship-node-links-title" className="flex items-center gap-2 text-sm font-medium">
              <Link2 className="size-4" aria-hidden />
              直接关系
            </h3>
            <Badge variant="outline">{relatedNodes.length}</Badge>
          </div>
          {relatedNodes.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {relatedNodes.map((item) => (
                <RelatedNode
                  key={item.edge.id}
                  item={item}
                  onSelect={onRelatedNodeSelect}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">当前节点没有直接关系。</p>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t p-4">
        {href ? (
          <Button asChild className="w-full">
            <Link href={href}>
              <MapIcon aria-hidden />
              前往对应业务页面
            </Link>
          </Button>
        ) : (
          <p className="text-center text-xs leading-5 text-muted-foreground">成员详情页尚未开放，此处仅展示图谱中的安全摘要。</p>
        )}
      </footer>
    </article>
  );
}

/** 渲染详情中的一个名称和值。 */
function DetailTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words text-right">{value}</dd>
    </div>
  );
}

/** 渲染一项带方向和关系语义的相邻节点。 */
function RelatedNode({
  item,
  onSelect,
}: {
  item: RelatedNodeItem;
  onSelect?: (nodeId: string) => void;
}) {
  return (
    <li>
      {onSelect ? (
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full justify-start rounded-xl border bg-muted/30 px-3 py-2.5 text-left hover:bg-muted"
          onClick={() => onSelect(item.node.id)}
        >
          <RelatedNodeContent item={item} />
        </Button>
      ) : (
        <div className="rounded-xl border bg-muted/30 px-3 py-2.5">
          <RelatedNodeContent item={item} />
        </div>
      )}
    </li>
  );
}

/** 渲染相邻节点名称、类型和有向关系标签。 */
function RelatedNodeContent({ item }: { item: RelatedNodeItem }) {
  return (
    <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{item.node.title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {NODE_TYPE_META[item.node.type].label}
        </span>
      </span>
      <Badge variant="outline" className="shrink-0">
        {item.direction === 'outgoing' ? '指向' : '来自'} · {item.edge.label}
      </Badge>
    </span>
  );
}

/** 收集当前节点的全部有效相邻关系并按关系标签稳定排序。 */
function buildRelatedNodeItems(node: RelationshipGraphNode, data: RelationshipGraphResponse): RelatedNodeItem[] {
  const nodeById = new Map(data.nodes.map((item) => [item.id, item]));
  return data.edges
    .flatMap((edge): RelatedNodeItem[] => {
      if (edge.source === node.id) {
        const target = nodeById.get(edge.target);
        return target ? [{ edge, node: target, direction: 'outgoing' }] : [];
      }
      if (edge.target === node.id) {
        const source = nodeById.get(edge.source);
        return source ? [{ edge, node: source, direction: 'incoming' }] : [];
      }
      return [];
    })
    .sort((left, right) => left.edge.label.localeCompare(right.edge.label, 'zh-CN'));
}

/** 按实体主键查找节点所属范围的可读标题。 */
function findScopeTitle(
  data: RelationshipGraphResponse,
  type: Extract<RelationshipGraphNodeType, 'PROJECT' | 'AREA' | 'DECISION'>,
  entityId: number | null,
): string | null {
  if (!entityId) return null;
  return data.nodes.find((node) => node.type === type && node.entityId === entityId)?.title ?? null;
}

/** 使用上海时区格式化节点业务时间。 */
function formatGraphDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}
