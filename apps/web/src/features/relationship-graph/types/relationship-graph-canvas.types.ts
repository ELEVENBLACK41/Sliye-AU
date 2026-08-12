/**
 * 本文件定义关系图谱 Canvas 的运行时节点、主题颜色与外部控制接口。
 */

import type { SimulationNodeDatum, ZoomTransform } from 'd3';
import type {
  RelationshipGraphEdge,
  RelationshipGraphNode,
  RelationshipGraphNodeType,
} from '@workspace/contracts/relationship-graph';

/** D3 模拟过程中附加坐标和固定位置的节点。 */
export type RelationshipGraphSimulationNode = RelationshipGraphNode & SimulationNodeDatum;

/** D3 力连接使用的可变端点结构。 */
export type RelationshipGraphSimulationEdge = Omit<RelationshipGraphEdge, 'source' | 'target'> & {
  /** D3 初始化前为节点标识，初始化后为节点对象。 */
  source: string | RelationshipGraphSimulationNode;
  /** D3 初始化前为节点标识，初始化后为节点对象。 */
  target: string | RelationshipGraphSimulationNode;
};

/** 从现有 CSS 变量读取的图谱绘制主题。 */
export type RelationshipGraphCanvasTheme = {
  /** 每类业务节点的默认颜色。 */
  nodeColors: Record<RelationshipGraphNodeType, string>;
  /** 普通连线颜色。 */
  linkColor: string;
  /** 节点标签颜色。 */
  labelColor: string;
  /** 选中和聚焦轮廓颜色。 */
  focusColor: string;
  /** 画布背景颜色。 */
  backgroundColor: string;
};

/** 画布当前尺寸和缩放状态。 */
export type RelationshipGraphViewport = {
  /** CSS 像素宽度。 */
  width: number;
  /** CSS 像素高度。 */
  height: number;
  /** 当前 D3 缩放变换。 */
  transform: ZoomTransform;
};

/** 页面工具栏可以调用的画布命令。 */
export type RelationshipGraphCanvasHandle = {
  /** 将全部可见节点缩放并居中到画布内。 */
  fitCanvas: () => void;
  /** 放大一级。 */
  zoomIn: () => void;
  /** 缩小一级。 */
  zoomOut: () => void;
  /** 重新加热力模拟并生成新布局。 */
  restartLayout: () => void;
  /** 将指定节点移动到画布中心。 */
  focusNode: (nodeId: string) => void;
};

