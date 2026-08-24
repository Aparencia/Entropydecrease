/**
 * knowledge.ts — v0.13.1 知识体系领域类型（与 Rust serde camelCase 契约对齐）。
 *
 * @ai-context: 覆盖体系四层实体（System/Node/Concept/Model）与唯一引用通道 Link。
 *              命名纪律（AGENTS.md §3）：业务术语贯穿全栈——system/node/concept/
 *              model/link 与 Tauri command 同名；字段 camelCase（Rust 侧已 rename
 *              snake_case 字段为 camelCase 返回，勿改以免破坏契约）。
 * @ai-context: 体系「只引用、不收纳（§一）」——Link 是内容进入体系的唯一通道；
 *              无 content 搬进体系命令，这里只描述引用关系。
 * @ai-context: 概念名全局唯一（§二 UNIQUE）——交叉点判定前提；名称归一化
 *              （trim + 连续空格合并）在 command 层执行，前端只做展示层校验。
 */
import type { NoteGroup } from "./notes";

/** 体系类别：global 全局体系（唯一）/ domain 领域体系 */
export type SystemKind = "global" | "domain";

/** 体系状态（command 层白名单校验） */
export type SystemStatus = "active" | "watching" | "archived";

/** 节点类型：question 问题 / scenario 场景 / domain_entry 领域入口 */
export type KnowledgeNodeType = "question" | "scenario" | "domain_entry";

/** 节点状态（command 层白名单校验） */
export type KnowledgeNodeStatus = "active" | "watching" | "archived";

/** 概念状态：core 核心 / watching 关注 / archived 归档 */
export type KnowledgeConceptStatus = "core" | "watching" | "archived";

/** 模型状态（command 层白名单校验） */
export type KnowledgeModelStatus = "active" | "watching" | "archived";

/** 引用目标类型：note_group / note / flashcard / fragment（command 层白名单校验） */
export type KnowledgeLinkTargetType = "note_group" | "note" | "flashcard" | "fragment";

/** 知识体系（含计数——list_knowledge_systems 返回；create/update 可能缺省计数） */
export interface KnowledgeSystem {
  id: number;
  /** 父体系 id（domain 挂全局；global 为 null） */
  parentSystemId: number | null;
  name: string;
  kind: SystemKind;
  /** global 体系的核心问题（必填；domain 可空） */
  coreQuestion: string | null;
  status: SystemStatus;
  createdAt: number;
  updatedAt: number;
  /** 体系内节点计数（list 返回含计数；create/update 后可能缺省——UI 按 0 呈现） */
  nodeCount?: number;
  /** 体系内概念计数 */
  conceptCount?: number;
  /** 体系内模型计数 */
  modelCount?: number;
}

/** 知识节点（问题树节点——不是概念/模型） */
export interface KnowledgeNode {
  id: number;
  systemId: number;
  /** 父节点 id（null=根节点） */
  parentId: number | null;
  type: KnowledgeNodeType;
  text: string;
  /** 同层排序索引（v0.13.1 移动顺序未接 UI，仅预埋字段） */
  orderIdx: number;
  status: KnowledgeNodeStatus;
  createdAt: number;
  /**
   * v0.13.8 画布：节点画布位置（左上角坐标；null=未布局——首次打开画布
   * 触发辐射布局批量初始化）。概念/模型无画布列（浮动参照，每次打开重排）。
   */
  canvasX?: number | null;
  canvasY?: number | null;
}

/** 知识概念（三问：本质/边界/联系；name 全局唯一） */
export interface KnowledgeConcept {
  id: number;
  systemId: number;
  name: string;
  /** 本质：它"是"什么 */
  essence: string | null;
  /** 边界：它"不是"什么 */
  boundary: string | null;
  /** 联系：它和什么相关 */
  relation: string | null;
  status: KnowledgeConceptStatus;
  /** 最近一次应用时刻（null=从未应用；用于 concept_stale 判定） */
  lastAppliedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 知识模型（跨学科可验证断言；disciplines ≥1） */
export interface KnowledgeModel {
  id: number;
  systemId: number;
  name: string;
  /** 学科数组（DB 存 JSON 数组字符串；command 层校验非空） */
  disciplines: string[];
  /** 断言主张 */
  claim: string | null;
  /** 成立条件 */
  validWhen: string | null;
  /** 失效条件 */
  invalidWhen: string | null;
  /** 交叉检查 JSON（v0.13.1 预埋，可空） */
  crossChecks: unknown[] | null;
  status: KnowledgeModelStatus;
  createdAt: number;
  updatedAt: number;
}

/** 知识引用（体系引用内容的唯一通道——只引用、不收纳） */
export interface KnowledgeLink {
  id: number;
  systemId: number;
  nodeId: number | null;
  conceptId: number | null;
  modelId: number | null;
  targetType: KnowledgeLinkTargetType;
  targetId: number;
  createdAt: number;
}

// ────────────────────────────────────────────────────────────
// 入参类型（与 Tauri command 参数一一对应；camelCase，Rust 侧自动映射 snake_case）
// ────────────────────────────────────────────────────────────

/** 新建体系入参（global 时 coreQuestion 必填、不可带 parent） */
export interface NewKnowledgeSystem {
  name: string;
  kind: SystemKind;
  parentSystemId?: number | null;
  coreQuestion?: string;
}

/** 更新体系入参（可选字段；status 白名单） */
export interface UpdateKnowledgeSystem {
  id: number;
  name?: string;
  coreQuestion?: string;
  status?: SystemStatus;
}

/** 新建节点入参 */
export interface NewKnowledgeNode {
  systemId: number;
  parentId?: number | null;
  type: KnowledgeNodeType;
  text: string;
}

/** 更新节点入参 */
export interface UpdateKnowledgeNode {
  id: number;
  text?: string;
  orderIdx?: number;
  status?: KnowledgeNodeStatus;
}

/** 新建概念入参（name 全局唯一冲突→command 明确报错） */
export interface NewKnowledgeConcept {
  systemId: number;
  name: string;
  essence?: string | null;
  boundary?: string | null;
  relation?: string | null;
}

/** 更新概念入参 */
export interface UpdateKnowledgeConcept {
  id: number;
  name?: string;
  essence?: string | null;
  boundary?: string | null;
  relation?: string | null;
  status?: KnowledgeConceptStatus;
}

/** 新建模型入参（disciplines ≥1；JSON 数组） */
export interface NewKnowledgeModel {
  systemId: number;
  name: string;
  disciplines: string[];
  claim?: string | null;
  validWhen?: string | null;
  invalidWhen?: string | null;
}

/** 更新模型入参 */
export interface UpdateKnowledgeModel {
  id: number;
  name?: string;
  disciplines?: string[];
  claim?: string | null;
  validWhen?: string | null;
  invalidWhen?: string | null;
  status?: KnowledgeModelStatus;
}

/** 新建引用入参（node/concept/model 三者至少一） */
export interface NewKnowledgeLink {
  systemId: number;
  nodeId?: number | null;
  conceptId?: number | null;
  modelId?: number | null;
  targetType: KnowledgeLinkTargetType;
  targetId: number;
}

// ────────────────────────────────────────────────────────────
// 审计探测（v0.13.4 前置读；list_knowledge_... 之外的单命令）
// ────────────────────────────────────────────────────────────

/** 审计信号（由调用方聚合；不带 DB 依赖的纯函数入参） */
export interface KnowledgeAuditSignal {
  itemCount: number;
  lastAuditAtMs: number | null;
  createdAtMs: number;
  nowMs: number;
}

/** 审计探测返回值 */
export interface KnowledgeAuditStatus {
  due: boolean;
  signal: KnowledgeAuditSignal;
}

// ────────────────────────────────────────────────────────────
// v0.13.8 画布：节点位置与视口契约（与 Rust serde camelCase 对齐）
//
// @ai-context: 画布=手动画布非自动图（REQ-029 P3 维持）——节点位置由用户拖拽
//              决定，首次打开时以辐射布局初始化（BFS），算法只在首次生效。
//              坐标口径：React Flow 左上角（node.position 语义），与 DB 存储一致。
// ────────────────────────────────────────────────────────────

/** 画布节点位置（batch_initialize_canvas_positions 入参；x/y 为左上角坐标） */
export interface CanvasNodePosition {
  nodeId: number;
  x: number;
  y: number;
}

/** 画布视口（get_canvas_viewport 返回；save_canvas_viewport 存储态） */
export interface CanvasViewport {
  viewportX: number;
  viewportY: number;
  zoom: number;
}

// ────────────────────────────────────────────────────────────
// 展示层常量（类型标签/状态徽标文案——决策仪表盘质感，非文档树）
// ────────────────────────────────────────────────────────────

/** 节点类型中文标签（问题树/树渲染用） */
export const nodeTypeLabel: Record<KnowledgeNodeType, string> = {
  question: "问题",
  scenario: "场景",
  domain_entry: "领域入口",
};

/** 体系类别中文标签 */
export const systemKindLabel: Record<SystemKind, string> = {
  global: "全局体系",
  domain: "领域体系",
};

/** 体系状态中文徽标 */
export const systemStatusLabel: Record<SystemStatus, string> = {
  active: "活跃",
  watching: "关注",
  archived: "已归档",
};

/** 概念状态中文徽标 */
export const conceptStatusLabel: Record<KnowledgeConceptStatus, string> = {
  core: "核心",
  watching: "关注",
  archived: "已归档",
};

/** 引用目标类型中文标签（「挂引用」下拉用） */
export const linkTargetTypeLabel: Record<KnowledgeLinkTargetType, string> = {
  note_group: "笔记组",
  note: "笔记",
  flashcard: "闪卡",
  fragment: "碎片",
};

/** 详情面板选中实体的分发类型（node/concept/model；id=null 表示新建） */
export type KnowledgeEntityType = "node" | "concept" | "model";

/** 详情面板选中实体（id=null 表示进入新建态——编辑器与列表复用同一 UI） */
export interface KnowledgeSelection {
  type: KnowledgeEntityType;
  id: number | null;
}

/** 供「挂引用」note_group 下拉使用的组（复用既有 NoteGroup 契约——避免重复定义） */
export type KnowledgeGroupOption = NoteGroup;

// ────────────────────────────────────────────────────────────
// v0.13.2 概念双面体：模型卡（记忆面）× 概念（思辨面）单向升格
//
// @ai-context: 双面体单向升格（§五）——组内 model 卡（记忆面）→ 体系概念
//              （思辨面）单向；概念→卡不反向（杜绝"概念卡与闪卡重复记账"）。
//              组仍是唯一容器：model 卡在组内（flashcards.group_id），概念在体系；
//              升格不搬运内容，只建引用（knowledge_links 唯一通道）与回链锚点。
// @ai-context: 前端只读这些返回与 decision，不解释后端 promote_rules 内部结构；
//              仅按 action 四态分支渲染结果文案。
// ────────────────────────────────────────────────────────────

/** 模型卡背面（三问：本质/边界/联系——记忆面卡面契约 §三） */
export interface ModelCardBack {
  essence: string | null;
  boundary: string | null;
  relation: string | null;
}

/** 新建 model 卡入参（对应 create_model_card 契约；组仍是唯一容器 §一） */
export interface NewModelCard {
  groupId: number;
  name: string;
  essence?: string | null;
  boundary?: string | null;
  relation?: string | null;
}

/** 升格动作（promote_card_to_concept 返回的 action 枚举——四态） */
export type PromoteAction = "created" | "merged" | "hinted" | "already";

/** 升格决策（后端 promote_rules 决策序列化——前端只读不解释其内部结构） */
export interface PromoteDecision {
  [key: string]: unknown;
}

/**
 * 升格结果（promote_card_to_concept 返回；camelCase 契约）。
 * @ai-context: action 四态——created 新建概念 / merged 关联既有 / hinted 跨体系
 *               不落库（v0.13.4 交叉点数据源，仅提示）/ already 已纳入免重复。
 *               link 在 created/merged 为新建引用，hinted/already 为 null
 *               （未落库/既有——不新增引用）。
 */
export interface PromoteResult {
  action: PromoteAction;
  concept: KnowledgeConcept;
  link: KnowledgeLink | null;
  /** 后端决策枚举序列化（只读；前端仅据 action 分支渲染） */
  decision?: PromoteDecision;
}

// ────────────────────────────────────────────────────────────
// v0.13.3 决策与应用：一表两面（REQ-208~210）
//
// @ai-context: 一表两面（§一）——knowledge_decisions 用 kind 区分 decision
//              （思辨面：我依据什么判断）/ application（学习面：我用它做了什么）。
//              不双表双记，避免同一经历在两面各记一遍造成膨胀。
// @ai-context: 只记"我的决策"（红线）——本记录是唯一写入路径，仅存用户显式输入；
//              禁止从产物层 ArtifactKind::Decision（笔记内容里的"决策"）自动升格。
//              前端本批也**不做**任何"决策→记录"回路。
// @ai-context: 引用必填防膨胀（§一）——used_refs 非空才计入指标；引用是记录成立的
//              前提（挂概念或证据），前端提交前拦截空引用，command 层再强制一次。
// @ai-context: 字段契约与 Rust serde camelCase 对齐；used_refs 是 JSON 字符串
//              （结构见 UsedRefs），前端用 parseUsedRefs 解析展示，不直接展开。
// ────────────────────────────────────────────────────────────

/** 记录类型：decision 思辨面 / application 学习面（一表两面，命名纪律 §一） */
export type DecisionKind = "decision" | "application";

/**
 * 引用（used_refs JSON 结构）——体系实体 + 证据，二者至少其一。
 * @ai-context: 体系实体（node/concept/model）指向体系内结构；证据
 *               （group/card/note/fragment）指向内容层（笔记/闪卡/碎片/组）。
 *               数组为空、证据为 null 即"未引用"；command 层据此拒绝空引用。
 */
export interface UsedRefs {
  /** 体系实体：节点 id 列表 */
  nodeIds: number[];
  /** 体系实体：概念 id 列表 */
  conceptIds: number[];
  /** 体系实体：模型 id 列表 */
  modelIds: number[];
  /** 证据：笔记组 id（null=未选） */
  groupId: number | null;
  /** 证据：闪卡 id（null=未选） */
  cardId: number | null;
  /** 证据：笔记 id（null=未选） */
  noteId: number | null;
  /** 证据：碎片 id（null=未选） */
  fragmentId: number | null;
}

/** 决策/应用记录（used_refs 以 JSON 字符串存储；解析见 parseUsedRefs） */
export interface KnowledgeDecision {
  id: number;
  kind: DecisionKind;
  systemId: number | null;
  questionId: number | null;
  /** 引用 JSON 字符串（损坏时 parseUsedRefs 回退空结构，不崩 UI） */
  usedRefs: string;
  /** 决策内容 / 应用动作（必填，≤2000） */
  content: string;
  /** 预期结果（四行法第 2 行） */
  expectation: string | null;
  /** 实际结果（四行法第 3 行；允许负面——失败真实记录，不评质量） */
  actual: string | null;
  /** 反思：如果重来改变什么（四行法第 4 行） */
  reflection: string | null;
  /** 决策/应用时刻（Unix 毫秒；与 created_at 分离——可回填旧决策） */
  decidedAt: number;
  createdAt: number;
}

/** 新建决策/应用入参（log_decision / log_application 的参数契约） */
export interface NewKnowledgeDecision {
  /** 所属体系（decision 必填；application 与 conceptId 至少其一） */
  systemId?: number | null;
  /** 关联问题节点 id（decision 可选；application 传 conceptId 不用） */
  questionId?: number | null;
  /** 挂载概念 id（application 概念模式：usedRefs 必含 conceptIds=[conceptId]） */
  conceptId?: number | null;
  content: string;
  expectation?: string | null;
  actual?: string | null;
  reflection?: string | null;
  /** 引用（序列化为 JSON 字符串提交） */
  usedRefs: UsedRefs;
}

/** 空引用结构（parseUsedRefs 防御回退 & 初始态共用） */
const EMPTY_USEREFS: UsedRefs = {
  nodeIds: [], conceptIds: [], modelIds: [],
  groupId: null, cardId: null, noteId: null, fragmentId: null,
};

/** 将未知值归一为 id 数组（过滤非正整数；损坏值防御） */
function toIdArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === "number" && Number.isInteger(x) && x > 0);
}

/** 将未知值归一为 id 或 null（仅正整数合法；其余防御为 null） */
function toIdOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

/**
 * 解析 used_refs JSON 字符串 → UsedRefs。
 * @ai-context: 防御性解析（AGENTS.md §3）——DB 里 used_refs 可能因旧版本/手工
 *               编辑为损坏 JSON；解析失败或结构不符时回退空结构（仅"无引用"展示），
 *               不抛错、不崩列表。兼容 camelCase（本批契约）与 snake_case（§二 SQL
 *               存法）两种键名，避免键名漂移导致旧记录解析为空。
 */
export function parseUsedRefs(json: string): UsedRefs {
  if (!json) return { ...EMPTY_USEREFS };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ...EMPTY_USEREFS };
  }
  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_USEREFS };
  const o = parsed as Record<string, unknown>;
  return {
    nodeIds: toIdArray(o.nodeIds ?? o.node_ids),
    conceptIds: toIdArray(o.conceptIds ?? o.concept_ids),
    modelIds: toIdArray(o.modelIds ?? o.model_ids),
    groupId: toIdOrNull(o.groupId ?? o.group_id),
    cardId: toIdOrNull(o.cardId ?? o.card_id),
    noteId: toIdOrNull(o.noteId ?? o.note_id),
    fragmentId: toIdOrNull(o.fragmentId ?? o.fragment_id),
  };
}

/** 引用摘要文本（决策日志行：计数标签） */
export function countUsedRefs(refs: UsedRefs): number {
  return refs.nodeIds.length + refs.conceptIds.length + refs.modelIds.length
    + (refs.groupId != null ? 1 : 0) + (refs.cardId != null ? 1 : 0)
    + (refs.noteId != null ? 1 : 0) + (refs.fragmentId != null ? 1 : 0);
}

/** 引用是否有任何实体（used_refs 非空判定——command 层强制，前端预拦截） */
export function hasUsedRefs(refs: UsedRefs): boolean {
  return countUsedRefs(refs) > 0;
}

/**
 * used_refs → 规范化 JSON 字符串（后端存储契约 snake_case 键）。
 * @ai-context: 后端 validate_decision_input 的键白名单为 snake_case（node_ids…）且
 *               校验 id>0——null/空数组字段必须省略（null 会被判"无效的 id"）；
 *               字段顺延固定，输出紧凑序列化（存储态一致性）。
 */
export function serializeUsedRefs(refs: UsedRefs): string {
  const out: Record<string, number | number[]> = {};
  if (refs.nodeIds.length) out.node_ids = refs.nodeIds;
  if (refs.conceptIds.length) out.concept_ids = refs.conceptIds;
  if (refs.modelIds.length) out.model_ids = refs.modelIds;
  if (refs.groupId != null) out.group_id = refs.groupId;
  if (refs.cardId != null) out.card_id = refs.cardId;
  if (refs.noteId != null) out.note_id = refs.noteId;
  if (refs.fragmentId != null) out.fragment_id = refs.fragmentId;
  return JSON.stringify(out);
}
