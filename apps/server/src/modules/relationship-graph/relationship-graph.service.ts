/**
 * 本文件按当前用户真实协作边界聚合项目、决策、会议和参与人的关系图谱快照。
 */
import { Injectable } from '@nestjs/common';
import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphNodeType,
  RelationshipGraphRelationType,
  RelationshipGraphResponse,
} from '@workspace/contracts/relationship-graph';
import { PrismaService } from '../../database/prisma.service';
import {
  DiscussionAreaType,
  MeetingInvitationStatus,
  type Prisma,
} from '../../generated/prisma';
import type { AuthorizationContext } from '../auth/types/auth.types';
import { AuthorizationService } from '../auth/services/authorization.service';

/** 图谱用户摘要只读取展示所需字段，禁止把邮箱等身份数据带入响应。 */
const graphUserSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

/** 图谱项目查询只加载安全摘要与显式成员关系。 */
const graphProjectSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  createdById: true,
  ownerId: true,
  createdBy: { select: graphUserSelect },
  owner: { select: graphUserSelect },
  members: {
    select: { role: true, user: { select: graphUserSelect } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.ProjectSelect;

/** 图谱分区查询只加载分区元数据、创建人和私有分区显式成员。 */
const graphAreaSelect = {
  id: true,
  projectId: true,
  name: true,
  description: true,
  type: true,
  status: true,
  createdAt: true,
  createdById: true,
  createdBy: { select: graphUserSelect },
  members: {
    select: { role: true, user: { select: graphUserSelect } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.DiscussionAreaSelect;

/** 图谱决策查询加载过程实体和直接人员关系，但明确不加载任务、选票或投票选择。 */
const graphDecisionSelect = {
  id: true,
  projectId: true,
  areaId: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  creatorId: true,
  ownerId: true,
  creator: { select: graphUserSelect },
  owner: { select: graphUserSelect },
  participants: {
    select: { role: true, user: { select: graphUserSelect } },
    orderBy: { id: 'asc' },
  },
  proposals: {
    select: {
      id: true,
      decisionId: true,
      creatorId: true,
      title: true,
      description: true,
      status: true,
      createdAt: true,
      creator: { select: graphUserSelect },
    },
    orderBy: { id: 'asc' },
  },
  voteRounds: {
    select: {
      id: true,
      decisionId: true,
      creatorId: true,
      title: true,
      description: true,
      status: true,
      isAnonymous: true,
      openedAt: true,
      createdAt: true,
      creator: { select: graphUserSelect },
      options: {
        select: { proposalId: true },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  },
  resolutions: {
    select: {
      id: true,
      decisionId: true,
      sourceProposalId: true,
      sourceVoteRoundId: true,
      decidedById: true,
      supersedesId: true,
      title: true,
      content: true,
      status: true,
      decidedAt: true,
      decidedBy: { select: graphUserSelect },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.DecisionSelect;

/** 图谱会议查询加载会议摘要、参与人及决策关联，不读取聊天或音视频明细。 */
const graphMeetingSelect = {
  id: true,
  areaId: true,
  title: true,
  description: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  createdAt: true,
  createdById: true,
  area: { select: { projectId: true } },
  createdBy: { select: graphUserSelect },
  participants: {
    select: {
      role: true,
      invitationStatus: true,
      joinedAt: true,
      user: { select: graphUserSelect },
    },
    orderBy: { id: 'asc' },
  },
  decisionLinks: {
    select: { decisionId: true },
    orderBy: { decisionId: 'asc' },
  },
} satisfies Prisma.MeetingSessionSelect;

/** 数据库返回的图谱用户安全摘要。 */
type GraphUserRecord = Prisma.UserGetPayload<{
  select: typeof graphUserSelect;
}>;
/** 数据库返回的图谱项目记录。 */
type GraphProjectRecord = Prisma.ProjectGetPayload<{
  select: typeof graphProjectSelect;
}>;
/** 数据库返回的图谱分区记录。 */
type GraphAreaRecord = Prisma.DiscussionAreaGetPayload<{
  select: typeof graphAreaSelect;
}>;
/** 数据库返回的图谱决策及过程记录。 */
type GraphDecisionRecord = Prisma.DecisionGetPayload<{
  select: typeof graphDecisionSelect;
}>;
/** 数据库返回的图谱会议记录。 */
type GraphMeetingRecord = Prisma.MeetingSessionGetPayload<{
  select: typeof graphMeetingSelect;
}>;

/** 数据库返回的单条会议参与关系。 */
type GraphMeetingParticipantRecord = GraphMeetingRecord['participants'][number];

/** 各关系类型面向页面展示的中文标签。 */
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

/** 生成不同实体之间不会碰撞的稳定节点 ID。 */
function nodeId(type: RelationshipGraphNodeType, entityId: number): string {
  return `${type.toLowerCase()}:${entityId}`;
}

/** 创建全部节点类型都为零的响应计数器。 */
function createEmptyCounts(): Record<RelationshipGraphNodeType, number> {
  return {
    PROJECT: 0,
    AREA: 0,
    DECISION: 0,
    MEETING: 0,
    PROPOSAL: 0,
    VOTE_ROUND: 0,
    RESOLUTION: 0,
    USER: 0,
  };
}

/** 以稳定 ID 写入节点，并保留首次加入时已经计算好的业务上下文。 */
function addNode(
  nodes: Map<string, RelationshipGraphNode>,
  node: RelationshipGraphNode,
): void {
  if (!nodes.has(node.id)) {
    nodes.set(node.id, node);
  }
}

/** 将安全用户摘要转换成用户节点并执行全图去重。 */
function addUserNode(
  nodes: Map<string, RelationshipGraphNode>,
  user: GraphUserRecord,
  currentUserId: number,
  businessTimestamp: Date,
): void {
  const id = nodeId('USER', user.id);
  const timestamp = businessTimestamp.toISOString();
  const existingNode = nodes.get(id);
  if (existingNode) {
    if (Date.parse(timestamp) < Date.parse(existingNode.timestamp)) {
      existingNode.timestamp = timestamp;
    }
    return;
  }

  addNode(nodes, {
    id,
    entityId: user.id,
    type: 'USER',
    title: user.name?.trim() || `用户 ${user.id}`,
    subtitle: null,
    status: null,
    projectId: null,
    areaId: null,
    decisionId: null,
    timestamp,
    avatarUrl: user.avatarUrl,
    isCurrentUser: user.id === currentUserId,
    currentUserRole: user.id === currentUserId ? 'SELF' : null,
  });
}

/**
 * 判断会议参与记录是否可以表达“参与”关系。
 * 明确拒绝、仅待响应或已经错过的邀请不会被误报；历史空状态、已接受或实际加入记录继续兼容。
 */
function isMeetingParticipation(
  participant: GraphMeetingParticipantRecord,
): boolean {
  return (
    participant.joinedAt !== null ||
    participant.invitationStatus === null ||
    participant.invitationStatus === MeetingInvitationStatus.ACCEPTED
  );
}

/** 向同一有向节点对追加关系，重复关系不会增加权重。 */
function addRelation(
  edges: Map<string, RelationshipGraphEdge>,
  source: string,
  target: string,
  relation: RelationshipGraphRelationType,
): void {
  const id = `edge:${source}->${target}`;
  const current = edges.get(id);

  if (current) {
    if (!current.relations.includes(relation)) {
      current.relations.push(relation);
      current.label = current.relations
        .map((item) => RELATION_LABELS[item])
        .join('、');
      current.weight = current.relations.length;
    }
    return;
  }

  edges.set(id, {
    id,
    source,
    target,
    relations: [relation],
    label: RELATION_LABELS[relation],
    weight: 1,
    directed: true,
  });
}

@Injectable()
export class RelationshipGraphService {
  /** 注入数据库与复用既有决策授权条件的统一授权服务。 */
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** 查询当前账号的全部可见实体，并在内存中生成稳定、无敏感数据的图谱快照。 */
  async getGraph(
    authorization: AuthorizationContext,
  ): Promise<RelationshipGraphResponse> {
    const userId = authorization.userId;
    const decisionWhere = await this.authorizationService.buildDecisionWhere(
      authorization,
      'decision:read',
    );
    const visibleAreaWhere: Prisma.DiscussionAreaWhereInput = {
      project: { members: { some: { userId } } },
      OR: [
        { type: DiscussionAreaType.PUBLIC },
        { members: { some: { userId } } },
      ],
    };

    const [projects, areas, decisions, meetings] = await Promise.all([
      this.prisma.project.findMany({
        where: { members: { some: { userId } } },
        select: graphProjectSelect,
        orderBy: { id: 'asc' },
      }),
      this.prisma.discussionArea.findMany({
        where: visibleAreaWhere,
        select: graphAreaSelect,
        orderBy: { id: 'asc' },
      }),
      this.prisma.decision.findMany({
        where: decisionWhere,
        select: graphDecisionSelect,
        orderBy: { id: 'asc' },
      }),
      this.prisma.meetingSession.findMany({
        where: {
          OR: [
            { area: visibleAreaWhere },
            { areaId: null, participants: { some: { userId } } },
          ],
        },
        select: graphMeetingSelect,
        orderBy: { id: 'asc' },
      }),
    ]);

    return this.buildGraph(userId, projects, areas, decisions, meetings);
  }

  /** 将已经完成权限裁剪的数据库记录映射为节点和合并关系边。 */
  private buildGraph(
    currentUserId: number,
    projects: GraphProjectRecord[],
    areas: GraphAreaRecord[],
    decisions: GraphDecisionRecord[],
    meetings: GraphMeetingRecord[],
  ): RelationshipGraphResponse {
    const nodes = new Map<string, RelationshipGraphNode>();
    const edges = new Map<string, RelationshipGraphEdge>();
    const projectsById = new Map(
      projects.map((project) => [project.id, project]),
    );

    for (const project of projects) {
      this.addProject(nodes, edges, project, currentUserId);
    }
    for (const area of areas) {
      this.addArea(
        nodes,
        edges,
        area,
        projectsById.get(area.projectId),
        currentUserId,
      );
    }
    for (const decision of decisions) {
      this.addDecision(nodes, edges, decision, currentUserId);
    }
    for (const meeting of meetings) {
      this.addMeeting(nodes, edges, meeting, currentUserId);
    }

    const sortedNodes = [...nodes.values()].sort(
      (left, right) =>
        left.type.localeCompare(right.type) || left.entityId - right.entityId,
    );
    const sortedEdges = [...edges.values()]
      .filter((edge) => nodes.has(edge.source) && nodes.has(edge.target))
      .sort((left, right) => left.id.localeCompare(right.id));
    const counts = createEmptyCounts();
    for (const node of sortedNodes) {
      counts[node.type] += 1;
    }

    return {
      nodes: sortedNodes,
      edges: sortedEdges,
      currentUserId,
      generatedAt: new Date().toISOString(),
      counts,
    };
  }

  /** 添加项目、项目成员及创建和负责关系。 */
  private addProject(
    nodes: Map<string, RelationshipGraphNode>,
    edges: Map<string, RelationshipGraphEdge>,
    project: GraphProjectRecord,
    currentUserId: number,
  ): void {
    const projectNodeId = nodeId('PROJECT', project.id);
    const currentMembership = project.members.find(
      (member) => member.user.id === currentUserId,
    );
    addNode(nodes, {
      id: projectNodeId,
      entityId: project.id,
      type: 'PROJECT',
      title: project.title,
      subtitle: project.description,
      status: project.status,
      projectId: project.id,
      areaId: null,
      decisionId: null,
      timestamp: project.createdAt.toISOString(),
      avatarUrl: null,
      isCurrentUser: false,
      currentUserRole: currentMembership?.role ?? null,
    });

    for (const member of project.members) {
      addUserNode(nodes, member.user, currentUserId, project.createdAt);
      addRelation(
        edges,
        nodeId('USER', member.user.id),
        projectNodeId,
        'MEMBER',
      );
    }
    addUserNode(nodes, project.createdBy, currentUserId, project.createdAt);
    addRelation(
      edges,
      nodeId('USER', project.createdById),
      projectNodeId,
      'CREATED',
    );
    if (project.owner && project.ownerId !== null) {
      addUserNode(nodes, project.owner, currentUserId, project.createdAt);
      addRelation(
        edges,
        nodeId('USER', project.ownerId),
        projectNodeId,
        'OWNS',
      );
    }
  }

  /** 添加可见分区及其项目包含、创建和成员关系。 */
  private addArea(
    nodes: Map<string, RelationshipGraphNode>,
    edges: Map<string, RelationshipGraphEdge>,
    area: GraphAreaRecord,
    project: GraphProjectRecord | undefined,
    currentUserId: number,
  ): void {
    const areaNodeId = nodeId('AREA', area.id);
    const explicitMembership = area.members.find(
      (member) => member.user.id === currentUserId,
    );
    const projectMembership = project?.members.find(
      (member) => member.user.id === currentUserId,
    );
    addNode(nodes, {
      id: areaNodeId,
      entityId: area.id,
      type: 'AREA',
      title: area.name,
      subtitle: area.description,
      status: area.status,
      projectId: area.projectId,
      areaId: area.id,
      decisionId: null,
      timestamp: area.createdAt.toISOString(),
      avatarUrl: null,
      isCurrentUser: false,
      currentUserRole:
        explicitMembership?.role ??
        (area.type === DiscussionAreaType.PUBLIC
          ? (projectMembership?.role ?? null)
          : null),
    });
    addRelation(
      edges,
      nodeId('PROJECT', area.projectId),
      areaNodeId,
      'CONTAINS',
    );
    addUserNode(nodes, area.createdBy, currentUserId, area.createdAt);
    addRelation(edges, nodeId('USER', area.createdById), areaNodeId, 'CREATED');

    const members =
      area.type === DiscussionAreaType.PUBLIC
        ? (project?.members ?? [])
        : area.members;
    for (const member of members) {
      addUserNode(nodes, member.user, currentUserId, area.createdAt);
      addRelation(edges, nodeId('USER', member.user.id), areaNodeId, 'MEMBER');
    }
  }

  /** 添加一项授权决策、全部过程节点及直接参与关系。 */
  private addDecision(
    nodes: Map<string, RelationshipGraphNode>,
    edges: Map<string, RelationshipGraphEdge>,
    decision: GraphDecisionRecord,
    currentUserId: number,
  ): void {
    const decisionNodeId = nodeId('DECISION', decision.id);
    const currentParticipant = decision.participants.find(
      (participant) => participant.user.id === currentUserId,
    );
    const currentUserRole =
      decision.ownerId === currentUserId
        ? 'OWNER'
        : (currentParticipant?.role ??
          (decision.creatorId === currentUserId ? 'CREATOR' : null));
    addNode(nodes, {
      id: decisionNodeId,
      entityId: decision.id,
      type: 'DECISION',
      title: decision.title,
      subtitle: decision.description,
      status: decision.status,
      projectId: decision.projectId,
      areaId: decision.areaId,
      decisionId: decision.id,
      timestamp: decision.createdAt.toISOString(),
      avatarUrl: null,
      isCurrentUser: false,
      currentUserRole,
    });
    addRelation(
      edges,
      decision.areaId === null
        ? nodeId('PROJECT', decision.projectId)
        : nodeId('AREA', decision.areaId),
      decisionNodeId,
      'CONTAINS',
    );
    addUserNode(nodes, decision.creator, currentUserId, decision.createdAt);
    addRelation(
      edges,
      nodeId('USER', decision.creatorId),
      decisionNodeId,
      'CREATED',
    );
    if (decision.owner && decision.ownerId !== null) {
      addUserNode(nodes, decision.owner, currentUserId, decision.createdAt);
      addRelation(
        edges,
        nodeId('USER', decision.ownerId),
        decisionNodeId,
        'OWNS',
      );
    }
    for (const participant of decision.participants) {
      addUserNode(nodes, participant.user, currentUserId, decision.createdAt);
      addRelation(
        edges,
        nodeId('USER', participant.user.id),
        decisionNodeId,
        'PARTICIPATES',
      );
    }

    for (const proposal of decision.proposals) {
      const proposalNodeId = nodeId('PROPOSAL', proposal.id);
      addNode(nodes, {
        id: proposalNodeId,
        entityId: proposal.id,
        type: 'PROPOSAL',
        title: proposal.title,
        subtitle: proposal.description,
        status: proposal.status,
        projectId: decision.projectId,
        areaId: decision.areaId,
        decisionId: decision.id,
        timestamp: proposal.createdAt.toISOString(),
        avatarUrl: null,
        isCurrentUser: false,
        currentUserRole:
          proposal.creatorId === currentUserId ? 'CREATOR' : null,
      });
      addRelation(edges, decisionNodeId, proposalNodeId, 'PROCESS_COMPONENT');
      addUserNode(nodes, proposal.creator, currentUserId, proposal.createdAt);
      addRelation(
        edges,
        nodeId('USER', proposal.creatorId),
        proposalNodeId,
        'CREATED',
      );
    }

    for (const round of decision.voteRounds) {
      const roundNodeId = nodeId('VOTE_ROUND', round.id);
      addNode(nodes, {
        id: roundNodeId,
        entityId: round.id,
        type: 'VOTE_ROUND',
        title: round.title,
        subtitle: round.description,
        status: round.status,
        projectId: decision.projectId,
        areaId: decision.areaId,
        decisionId: decision.id,
        timestamp: (round.openedAt ?? round.createdAt).toISOString(),
        avatarUrl: null,
        isCurrentUser: false,
        currentUserRole: round.creatorId === currentUserId ? 'CREATOR' : null,
      });
      addRelation(edges, decisionNodeId, roundNodeId, 'PROCESS_COMPONENT');
      addUserNode(
        nodes,
        round.creator,
        currentUserId,
        round.openedAt ?? round.createdAt,
      );
      addRelation(
        edges,
        nodeId('USER', round.creatorId),
        roundNodeId,
        'CREATED',
      );
      for (const option of round.options) {
        if (option.proposalId !== null) {
          addRelation(
            edges,
            nodeId('PROPOSAL', option.proposalId),
            roundNodeId,
            'CANDIDATE',
          );
        }
      }
    }

    for (const resolution of decision.resolutions) {
      const resolutionNodeId = nodeId('RESOLUTION', resolution.id);
      addNode(nodes, {
        id: resolutionNodeId,
        entityId: resolution.id,
        type: 'RESOLUTION',
        title: resolution.title,
        subtitle: resolution.content,
        status: resolution.status,
        projectId: decision.projectId,
        areaId: decision.areaId,
        decisionId: decision.id,
        timestamp: resolution.decidedAt.toISOString(),
        avatarUrl: null,
        isCurrentUser: false,
        currentUserRole:
          resolution.decidedById === currentUserId ? 'CONFIRMER' : null,
      });
      addRelation(edges, decisionNodeId, resolutionNodeId, 'PROCESS_COMPONENT');
      addUserNode(
        nodes,
        resolution.decidedBy,
        currentUserId,
        resolution.decidedAt,
      );
      addRelation(
        edges,
        nodeId('USER', resolution.decidedById),
        resolutionNodeId,
        'CONFIRMED',
      );
      if (resolution.sourceProposalId !== null) {
        addRelation(
          edges,
          nodeId('PROPOSAL', resolution.sourceProposalId),
          resolutionNodeId,
          'BASIS',
        );
      }
      if (resolution.sourceVoteRoundId !== null) {
        addRelation(
          edges,
          nodeId('VOTE_ROUND', resolution.sourceVoteRoundId),
          resolutionNodeId,
          'BASIS',
        );
      }
      if (resolution.supersedesId !== null) {
        addRelation(
          edges,
          nodeId('RESOLUTION', resolution.supersedesId),
          resolutionNodeId,
          'SUPERSEDED_BY',
        );
      }
    }
  }

  /** 添加可见会议、承载范围、决策讨论以及创建和参与关系。 */
  private addMeeting(
    nodes: Map<string, RelationshipGraphNode>,
    edges: Map<string, RelationshipGraphEdge>,
    meeting: GraphMeetingRecord,
    currentUserId: number,
  ): void {
    const meetingNodeId = nodeId('MEETING', meeting.id);
    const currentParticipant = meeting.participants.find(
      (participant) => participant.user.id === currentUserId,
    );
    const meetingTimestamp =
      meeting.scheduledAt ?? meeting.startedAt ?? meeting.createdAt;
    addNode(nodes, {
      id: meetingNodeId,
      entityId: meeting.id,
      type: 'MEETING',
      title: meeting.title,
      subtitle: meeting.description,
      status: meeting.status,
      projectId: meeting.area?.projectId ?? null,
      areaId: meeting.areaId,
      decisionId: null,
      timestamp: meetingTimestamp.toISOString(),
      avatarUrl: null,
      isCurrentUser: false,
      currentUserRole:
        currentParticipant && isMeetingParticipation(currentParticipant)
          ? currentParticipant.role
          : meeting.createdById === currentUserId
            ? 'CREATOR'
            : currentParticipant?.invitationStatus ===
                MeetingInvitationStatus.INVITED
              ? 'INVITED'
              : null,
    });
    if (meeting.areaId !== null) {
      addRelation(
        edges,
        nodeId('AREA', meeting.areaId),
        meetingNodeId,
        'HOSTS',
      );
    }
    for (const link of meeting.decisionLinks) {
      addRelation(
        edges,
        meetingNodeId,
        nodeId('DECISION', link.decisionId),
        'DISCUSSES',
      );
    }
    addUserNode(nodes, meeting.createdBy, currentUserId, meetingTimestamp);
    addRelation(
      edges,
      nodeId('USER', meeting.createdById),
      meetingNodeId,
      'CREATED',
    );
    for (const participant of meeting.participants) {
      if (!isMeetingParticipation(participant)) continue;
      addUserNode(nodes, participant.user, currentUserId, meetingTimestamp);
      addRelation(
        edges,
        nodeId('USER', participant.user.id),
        meetingNodeId,
        'PARTICIPATES',
      );
    }
  }
}
