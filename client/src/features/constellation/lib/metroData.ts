/**
 * 知识地铁图 · 派生纯函数层（4.9）
 * Knowledge metro map · derivation layer (pure)
 *
 * @ai-context: 把知识图谱转化为地铁图数据：线路=来源课程（source_ref
 * 溯源分组，颜色取自模块色板），车站=课程内卡片概念（尺寸随掌握度），
 * 换乘=跨课程互连的图谱链（shared-note/review-chain/weakpoint）。
 * journey 为 AI 推荐学习路径：按掌握度升序取最薄弱 N 个车站（先补
 * 薄弱点，宪法「雾永远可拨开」的学习序）；顺序内同课程相邻车站会
 * 自然落在同一条线上，跨课程由 overlay 边连接。费曼薄弱点不占线路
 * 站台（非课程概念），仅作为换乘端点参与。纯函数、无副作用。
 *
 * @ai-context: Courses become metro lines (color from the module
 * palette), concepts become stations (size by mastery), cross-course
 * links become transfers; journey is the weakest-first study path.
 */
import { UNKNOWN_MODULE, moduleColor } from './mapData';
import type { MetroCourse, MetroData, MetroTransfer } from './mapTypes';
import type { KnowledgeGraph } from './knowledgeGraph';

/** 推荐路径车站数上限 / Journey station cap */
const JOURNEY_MAX_STOPS = 10;

/** 换乘链类型（跨课程才有意义） */
const TRANSFER_KINDS = new Set(['shared-note', 'review-chain', 'weakpoint']);

/**
 * 派生地铁图数据 / Derive metro map data
 * @param graph - 派生知识图谱
 * @param sourceRefs - 卡片 id → 课程名（source_ref；缺失归「未分类」）
 */
export function deriveMetroData(
  graph: KnowledgeGraph,
  sourceRefs: Map<string, string> = new Map(),
): MetroData {
  if (graph.coldStart || graph.nodes.length === 0) {
    return { courses: [], transfers: [], journey: [] };
  }

  // 卡片概念节点（费曼薄弱点不作为线路站台）
  const cardNodes = graph.nodes.filter((n) => n.id.startsWith('card:'));
  if (cardNodes.length === 0) {
    return { courses: [], transfers: [], journey: [] };
  }

  // 1. 按课程分组（保持输入顺序 = 最近更新优先）
  const byCourse = new Map<string, MetroCourse>();
  const courseOf = new Map<string, string>();
  for (const node of cardNodes) {
    const cardId = node.id.slice('card:'.length);
    const name = sourceRefs.get(cardId)?.trim() || UNKNOWN_MODULE;
    courseOf.set(node.id, name);
    let course = byCourse.get(name);
    if (!course) {
      course = { id: `course:${name}`, name, color: moduleColor(name), concepts: [] };
      byCourse.set(name, course);
    }
    course.concepts.push({ id: node.id, title: node.concept, mastery: node.glow });
  }

  // 2. 换乘：跨课程互连的链（端点都在站台上，去重）
  const stationIds = new Set(cardNodes.map((n) => n.id));
  const seen = new Set<string>();
  const transfers: MetroTransfer[] = [];
  for (const link of graph.links) {
    if (!TRANSFER_KINDS.has(link.kind)) continue;
    if (!stationIds.has(link.source) || !stationIds.has(link.target)) continue;
    if (courseOf.get(link.source) === courseOf.get(link.target)) continue;
    const key = [link.source, link.target].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    transfers.push({ from: link.source, to: link.target });
  }

  // 3. AI 推荐路径：最薄弱车站优先（掌握度升序，截断上限）
  const journey = cardNodes
    .slice()
    .sort((a, b) => a.glow - b.glow || a.concept.localeCompare(b.concept))
    .slice(0, JOURNEY_MAX_STOPS)
    .map((n) => n.id);

  return { courses: [...byCourse.values()], transfers, journey };
}

/** 地铁图布局：线路纵向排布，站台横向铺开（纯函数，供组件复用） */
export interface MetroLayout {
  /** 车站 id → 像素坐标 */
  positions: Map<string, { x: number; y: number }>;
  /** 线路 id → 途经车站像素路径点（渲染背景线用） */
  linePaths: Map<string, Array<{ x: number; y: number }>>;
}

/** 行间距 / 站台间距（像素） */
const LINE_GAP_Y = 170;
const STATION_GAP_X = 200;
const PADDING = 80;

/** 计算地铁图布局 / Compute metro layout */
export function layoutMetro(data: MetroData): MetroLayout {
  const positions = new Map<string, { x: number; y: number }>();
  const linePaths = new Map<string, Array<{ x: number; y: number }>>();

  data.courses.forEach((course, row) => {
    const y = PADDING + row * LINE_GAP_Y;
    const points: Array<{ x: number; y: number }> = [];
    course.concepts.forEach((station, col) => {
      const x = PADDING + col * STATION_GAP_X;
      positions.set(station.id, { x, y });
      points.push({ x, y });
    });
    linePaths.set(course.id, points);
  });

  return { positions, linePaths };
}

/** 换乘边两端都存在于站台时保留（悬空过滤） */
export function filterTransferEndpoints(
  transfers: MetroTransfer[],
  stationIds: Set<string>,
): MetroTransfer[] {
  return transfers.filter((t) => stationIds.has(t.from) && stationIds.has(t.to));
}
