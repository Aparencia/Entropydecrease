/**
 * CRDT 同步 — 类型与常量定义
 *
 * @ai-context: CRDTDocRecord/CRDTChangeRecord 是 Dexie crdt_docs/crdt_changes
 * 表的行结构（database.ts 引用），字段变更需同步 schema 版本。
 * @ai-context: CRDT_ENABLED_TABLES 试点阶段仅 notes；扩表前必须确认服务端
 * /api/v1/sync/crdt 已支持对应表，且该表实体可被 Automerge Map 语义表达。
 * @ai-context: 纯类型与常量，无运行时副作用。
 */
import type * as automerge from '@automerge/automerge';

/** CRDT 文档状态（一张表对应一个 Automerge 文档） */
export interface CRDTDocState {
  tableName: string;
  doc: automerge.Doc<CRDTTableDoc>;
  /** 上次持久化的 Automerge heads，用于增量 getChanges */
  lastHeads: automerge.Heads | null;
}

/** Automerge 文档内部结构：entityId → 实体数据 */
export interface CRDTTableDoc {
  entities: Record<string, Record<string, unknown>>;
  /** 墓碑标记：entityId → true（已删除） */
  tombstones: Record<string, boolean>;
}

/** 变更集：可在客户端 / 服务端之间传输 */
export interface CRDTChangeset {
  /** 自增序号（本地 Dexie 分配） */
  seq?: number;
  tableName: string;
  entityId: string;
  /** Automerge 二进制变更的 base64 编码 */
  changeset: string;
  /** 操作类型（便于服务端快速过滤） */
  operation: 'create' | 'update' | 'delete';
  createdAt: string;
}

/** 从服务端拉取的远程变更 */
export interface RemoteCRDTChange {
  seq: number;
  tableName: string;
  entityId: string;
  changeset: string;
  operation: string;
  deviceId: string;
  createdAt: string;
}

/** crdt_docs 表行类型 */
export interface CRDTDocRecord {
  tableName: string;
  snapshot: string;       // base64 编码的 Automerge 文档快照
  lastHeads: string;      // JSON 序列化的 Automerge heads
  updatedAt: string;      // ISO 8601
}

/** crdt_changes 表行类型 */
export interface CRDTChangeRecord {
  seq?: number;           // 自增主键
  tableName: string;
  entityId: string;
  changeset: string;      // base64 编码的 Automerge 变更
  operation: 'create' | 'update' | 'delete';
  createdAt: string;      // ISO 8601
}

/** 当前启用 CRDT 的表（试点阶段仅 notes） */
export const CRDT_ENABLED_TABLES: string[] = ['notes'];

/** feature flag key（localStorage） */
export const SYNC_MODE_FLAG = 'sync_mode';
