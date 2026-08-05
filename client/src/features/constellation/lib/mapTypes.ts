/**
 * 知识可视化（阶段 4：三维脑图 / 地铁图 / 进化树 / 记忆宫殿）共享类型
 * Knowledge visualization · shared types (phase 4)
 *
 * @ai-context: 四种可视化共享的视图层类型。全部由 features/constellation/lib
 * 下的纯函数派生层产出（mapData/metroData/evolutionData），组件层只消费、
 * 不直接接触 knowledge:get-graph 原始数据。mastery 复用知识图谱 glow
 * （宪法第一条：牢固=1.0 清冽明亮，朦胧=0.45），sourceModule 取卡片
 * source_ref 溯源（知识入籍）。lastReviewedAt 用 Date 保持 IPC structured
 * clone 原样传递。
 *
 * @ai-context: View-layer types shared by the four phase-4 visualizations;
 * produced only by the pure derivation layers below.
 */

/** 三维脑图节点（4.8） / 3D map node */
export interface MapNode3D {
  id: string;
  /** 概念名（卡片正面/费曼概念，HTML 剥离后截断） */
  title: string;
  /** 掌握度 0-1（复用知识图谱 glow 口径） */
  mastery: number;
  /** 相连节点 id（派生自知识图谱三种链） */
  connections: string[];
  /** 世界坐标；z 轴随掌握度分层（越高 → 越上层） */
  position3D: [number, number, number];
  /** 来源模块（卡片 source_ref；费曼薄弱点归入 synthetic 模块） */
  sourceModule: string;
}

/** 地铁图概念站（4.9） / Metro station concept */
export interface MetroConcept {
  id: string;
  title: string;
  mastery: number;
}

/** 地铁图线路（课程） / Metro line (course) */
export interface MetroCourse {
  id: string;
  name: string;
  color: string;
  concepts: MetroConcept[];
}

/** 换乘关系（跨课程概念互连） / Transfer between courses */
export interface MetroTransfer {
  from: string;
  to: string;
}

/** 地铁图数据 / Metro map data */
export interface MetroData {
  courses: MetroCourse[];
  transfers: MetroTransfer[];
  /** AI 推荐学习路径（概念 id 序列，按掌握度升序取最薄弱者） */
  journey: string[];
}

/** 进化阶段（4.10）：种子 → 萌芽 → 成长 → 开花 → 结果 */
export type EvolutionStage = 'seed' | 'sprout' | 'growing' | 'bloom' | 'fruit';

/** 进化树节点 / Evolution tree node */
export interface EvolutionNode {
  id: string;
  title: string;
  mastery: number;
  /** 父节点 id（树形派生自知识图谱链，已破环）；无父则 null（根） */
  parentId: string | null;
  /** 最近复习时间；无复习记录为 null */
  lastReviewedAt: Date | null;
  stage: EvolutionStage;
  /** 枯萎预警：非种子且长期未复习（>30 天或从未复习） */
  wilted: boolean;
}

/** 进化树数据：节点 + 嫁接关系（跨分支虚线边） */
export interface EvolutionData {
  nodes: EvolutionNode[];
  grafts: Array<{ from: string; to: string }>;
}

/** 记忆宫殿房间记忆项（4.10） / Memory palace item */
export interface MemoryItem {
  concept: string;
  hint: string;
}

/** 记忆宫殿房间 / Memory palace room */
export interface MemoryRoom {
  id: string;
  name: string;
  items: MemoryItem[];
}
