/**
 * CRDT 同步引擎 — 基于 Automerge 实现无冲突多设备同步
 *
 * 核心职责：
 * 1. 为每张核心表维护独立的 Automerge 文档
 * 2. 本地变更 → 生成 CRDT changeset
 * 3. 远程 changeset → 自动合并到本地文档
 * 4. 增量变更序列化管理
 *
 * 试点阶段：仅 notes 表启用 CRDT，其余表仍走 operationLog 路径
 */
import * as automerge from '@automerge/automerge';

// ─── 类型定义 ────────────────────────────────────────────────────────────────

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

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 当前启用 CRDT 的表（试点阶段仅 notes） */
export const CRDT_ENABLED_TABLES: string[] = ['notes'];

/** feature flag key */
export const SYNC_MODE_FLAG = 'sync_mode';

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/** 将 Automerge 二进制变更编码为 base64 字符串 */
function encodeChanges(changes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < changes.length; i++) {
    binary += String.fromCharCode(changes[i]);
  }
  return btoa(binary);
}

/**
 * 将多条 Automerge 变更（每条为独立的自描述 chunk）顺序拼接为单一二进制
 * 下行端通过 loadIncremental 解析，天然支持多 chunk 拼接格式
 */
function concatChanges(changes: Uint8Array[]): Uint8Array {
  const totalLength = changes.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of changes) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

/** 将 base64 字符串解码为 Automerge 二进制变更 */
function decodeChanges(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ─── 引擎类 ──────────────────────────────────────────────────────────────────

export class CRDTEngine {
  /** tableName → CRDTDocState */
  private docs: Map<string, CRDTDocState> = new Map();

  /** 初始化标记 */
  private initialized = false;

  // ─── 初始化 ──────────────────────────────────────────────────────────────

  /**
   * 初始化 CRDT 引擎
   * 从 IndexedDB crdt_docs 表恢复已有文档快照，或为空表创建新文档
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    for (const tableName of CRDT_ENABLED_TABLES) {
      await this.initDoc(tableName);
    }
    this.initialized = true;
  }

  /**
   * 为指定表初始化 CRDT 文档
   * 优先从 crdt_docs 表加载已持久化的快照，否则创建空文档
   */
  async initDoc(tableName: string): Promise<CRDTDocState> {
    // 尝试从 IndexedDB 恢复
    const { db } = await import('@/lib/storage/database');
    const existing = await db.crdtDocs.get(tableName);

    let doc: automerge.Doc<CRDTTableDoc>;
    let lastHeads: automerge.Heads | null = null;

    if (existing?.snapshot) {
      // 从保存的二进制快照恢复
      const snapshotBytes = decodeChanges(existing.snapshot);
      doc = automerge.load<CRDTTableDoc>(snapshotBytes);
      lastHeads = existing.lastHeads ? JSON.parse(existing.lastHeads) : null;
    } else {
      // 创建新文档
      doc = automerge.init<CRDTTableDoc>();
      doc = automerge.change(doc, (d) => {
        if (!d.entities) d.entities = {};
        if (!d.tombstones) d.tombstones = {};
      });
    }

    const state: CRDTDocState = { tableName, doc, lastHeads };
    this.docs.set(tableName, state);
    return state;
  }

  // ─── 本地变更 ──────────────────────────────────────────────────────────────

  /**
   * 应用本地变更并生成 CRDT changeset
   *
   * @param tableName 表名（如 'notes'）
   * @param entityId  实体 ID
   * @param changes   变更内容（create/update 时为完整或部分实体数据，delete 时为 null）
   * @param operation 操作类型
   * @returns CRDTChangeset 用于上传到服务端 / 存入 crdt_changes 表
   */
  applyLocalChange(
    tableName: string,
    entityId: string,
    changes: Record<string, unknown> | null,
    operation: 'create' | 'update' | 'delete',
  ): CRDTChangeset | null {
    if (!this.isCRDTEnabled(tableName)) return null;

    let state = this.docs.get(tableName);
    if (!state) {
      // 若未初始化则同步创建（initDoc 是 async，这里用惰性初始化兜底）
      const doc = automerge.init<CRDTTableDoc>();
      state = {
        tableName,
        doc: automerge.change(doc, (d) => {
          d.entities = {};
          d.tombstones = {};
        }),
        lastHeads: null,
      };
      this.docs.set(tableName, state);
    }

    const beforeHeads = automerge.getHeads(state.doc);

    if (operation === 'delete') {
      // 删除：设置墓碑 + 清除实体数据
      state.doc = automerge.change(state.doc, (d) => {
        delete d.entities[entityId];
        d.tombstones[entityId] = true;
      });
    } else if (operation === 'create' && changes) {
      // 创建：写入实体数据
      state.doc = automerge.change(state.doc, (d) => {
        d.entities[entityId] = { ...changes };
        // 清除可能存在的旧墓碑
        delete d.tombstones[entityId];
      });
    } else if (operation === 'update' && changes) {
      // 更新：合并字段（LWW 语义，Automerge 默认行为）
      state.doc = automerge.change(state.doc, (d) => {
        if (!d.entities[entityId]) {
          d.entities[entityId] = {};
        }
        const entity = d.entities[entityId];
        for (const [key, value] of Object.entries(changes)) {
          (entity as Record<string, unknown>)[key] = value;
        }
      });
    }

    // 提取增量变更（getChangesSince 接受 Heads；getChanges 只接受两个 Doc）
    const changeChunks = automerge.getChangesSince(state.doc, beforeHeads);
    if (changeChunks.length === 0) return null;

    const changeset = encodeChanges(concatChanges(changeChunks));

    return {
      tableName,
      entityId,
      changeset,
      operation,
      createdAt: new Date().toISOString(),
    };
  }

  // ─── 远程变更 ──────────────────────────────────────────────────────────────

  /**
   * 应用来自远程的 changeset（Automerge 自动合并）
   *
   * @returns 合并后本地实体的最新数据（若该实体受影响），否则 null
   */
  applyRemoteChange(tableName: string, changesetBase64: string): Record<string, unknown> | null {
    if (!this.isCRDTEnabled(tableName)) return null;

    const state = this.docs.get(tableName);
    if (!state) return null;

    const remoteChanges = decodeChanges(changesetBase64);

    // Automerge 核心：应用远程变更并自动合并
    // loadIncremental 可解析一条或多条拼接的变更 chunk，与上行端 concatChanges 格式对称
    state.doc = automerge.loadIncremental(state.doc, remoteChanges);

    // 返回合并后的完整文档数据（供上层写入 Dexie）
    return state.doc.entities as unknown as Record<string, unknown>;
  }

  /**
   * 批量应用远程变更
   * @returns 受影响的 entityId → 最新数据 映射
   */
  applyRemoteChanges(
    tableName: string,
    changesets: Array<{ entityId: string; changeset: string }>,
  ): Map<string, Record<string, unknown>> {
    const affected = new Map<string, Record<string, unknown>>();

    if (!this.isCRDTEnabled(tableName)) return affected;

    let state = this.docs.get(tableName);
    if (!state) {
      const doc = automerge.init<CRDTTableDoc>();
      state = {
        tableName,
        doc: automerge.change(doc, (d) => {
          d.entities = {};
          d.tombstones = {};
        }),
        lastHeads: null,
      };
      this.docs.set(tableName, state);
    }

    for (const { entityId, changeset } of changesets) {
      const remoteChanges = decodeChanges(changeset);
      state.doc = automerge.loadIncremental(state.doc, remoteChanges);

      // 检查是否为删除操作（墓碑存在但实体不存在）
      if (state.doc.tombstones[entityId] && !state.doc.entities[entityId]) {
        affected.set(entityId, { __deleted: true });
      } else if (state.doc.entities[entityId]) {
        affected.set(entityId, { ...state.doc.entities[entityId] });
      }
    }

    return affected;
  }

  // ─── 文档合并 ──────────────────────────────────────────────────────────────

  /**
   * 合并两个 CRDT 文档（例如从服务端全量快照合并）
   * 利用 Automerge 的 merge 能力自动解决冲突
   */
  mergeDocs(tableName: string, remoteDocBinary: Uint8Array): void {
    if (!this.isCRDTEnabled(tableName)) return;

    const state = this.docs.get(tableName);
    if (!state) return;

    const remoteDoc = automerge.load<CRDTTableDoc>(remoteDocBinary);
    // merge 直接返回合并后的 Doc（非元组）
    state.doc = automerge.merge(state.doc, remoteDoc);
  }

  // ─── 持久化 ────────────────────────────────────────────────────────────────

  /**
   * 将 CRDT 文档快照持久化到 IndexedDB crdt_docs 表
   * 在每次本地变更后调用，确保重启后可恢复
   */
  async persistDoc(tableName: string): Promise<void> {
    const state = this.docs.get(tableName);
    if (!state) return;

    const { db } = await import('@/lib/storage/database');
    const snapshotBytes = automerge.save(state.doc);
    const snapshot = encodeChanges(snapshotBytes);
    const heads = JSON.stringify(automerge.getHeads(state.doc));

    await db.crdtDocs.put({
      tableName,
      snapshot,
      lastHeads: heads,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * 将 changeset 存入 crdt_changes 表等待上传
   */
  async enqueueChange(changeset: CRDTChangeset): Promise<void> {
    const { db } = await import('@/lib/storage/database');
    await db.crdtChanges.add({
      tableName: changeset.tableName,
      entityId: changeset.entityId,
      changeset: changeset.changeset,
      operation: changeset.operation,
      createdAt: changeset.createdAt,
    });
  }

  /**
   * 获取待上传的 changesets（按 seq 排序）
   */
  async getPendingChanges(limit: number = 50): Promise<CRDTChangeRecord[]> {
    const { db } = await import('@/lib/storage/database');
    return db.crdtChanges
      .orderBy('seq')
      .limit(limit)
      .toArray();
  }

  /**
   * 标记 changesets 为已上传（按 seq 删除）
   */
  async markChangesUploaded(seqs: number[]): Promise<void> {
    const { db } = await import('@/lib/storage/database');
    await db.crdtChanges.bulkDelete(seqs);
  }

  // ─── 状态查询 ──────────────────────────────────────────────────────────────

  /**
   * 获取指定表中某实体的当前 CRDT 数据
   */
  getEntityData(tableName: string, entityId: string): Record<string, unknown> | null {
    const state = this.docs.get(tableName);
    if (!state) return null;
    return state.doc.entities[entityId] ?? null;
  }

  /**
   * 检查表是否已启用 CRDT
   */
  isCRDTEnabled(tableName: string): boolean {
    return CRDT_ENABLED_TABLES.includes(tableName);
  }

  /**
   * 检查 CRDT 引擎是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 导出文档二进制（用于全量同步或调试）
   */
  exportDoc(tableName: string): Uint8Array | null {
    const state = this.docs.get(tableName);
    if (!state) return null;
    return automerge.save(state.doc);
  }
}

// ─── Dexie 存储类型 ──────────────────────────────────────────────────────────

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

// ─── 单例 ────────────────────────────────────────────────────────────────────

export const crdtEngine = new CRDTEngine();

// ─── Feature Flag 工具 ───────────────────────────────────────────────────────

/** 获取当前同步模式 */
export function getSyncMode(): 'crdt' | 'oplog' {
  const mode = localStorage.getItem(SYNC_MODE_FLAG);
  return mode === 'crdt' ? 'crdt' : 'oplog';
}

/** 设置同步模式（需要重启同步引擎生效） */
export function setSyncMode(mode: 'crdt' | 'oplog'): void {
  localStorage.setItem(SYNC_MODE_FLAG, mode);
}

/** 检查指定表当前是否应使用 CRDT 路径 */
export function shouldUseCRDT(tableName: string): boolean {
  if (getSyncMode() !== 'crdt') return false;
  return CRDT_ENABLED_TABLES.includes(tableName);
}
