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
