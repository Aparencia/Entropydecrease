/**
 * CRDT 同步引擎 — 基于 Automerge 的无冲突多设备同步（内存文档管理）
 *
 * @ai-context: 2026-07 拆分——类型/常量在 crdtTypes，编解码在 crdtCodec，
 * crdt_changes 纯 db 操作在 crdtPersistence，feature flag 在 syncMode；
 * 旧导入路径 '@/lib/sync/crdtEngine' 经文末 re-export 全部兼容。
 * @ai-context: Automerge API 约束（历史踩坑）：增量提取用 getChangesSince
 * (doc, heads)；合并远程用 loadIncremental；merge 返回 Doc 而非元组。
 * @ai-context: db 动态 import 打破 database.ts ↔ 本文件的循环依赖。
 */
import * as automerge from '@automerge/automerge';
import {
  CRDT_ENABLED_TABLES,
  type CRDTDocState,
  type CRDTTableDoc,
  type CRDTChangeset,
} from './crdtTypes';
import { encodeChanges, concatChanges, decodeChanges } from './crdtCodec';

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

  /** 惰性创建空文档状态（applyLocalChange/applyRemoteChanges 兜底共用） */
  private ensureDocState(tableName: string): CRDTDocState {
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

    const state = this.ensureDocState(tableName);

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

    const state = this.ensureDocState(tableName);

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

  /**
   * 重置 CRDT 引擎（导入备份后调用）
   * 清空内存文档，清空 initialized 标记，下次 init 从新数据重建
   */
  reset(): void {
    this.docs.clear();
    this.initialized = false;
  }

  /**
   * 重置单表 CRDT 文档（SYNC2-L5: 本地变更持久化失败后调用）
   * 从 crdt_docs 最新快照重建该表内存状态，丢弃本次未落盘的变更——
   * 避免内存 doc 前滚而队列/快照未跟上导致的基线漂移
   *（下次 applyLocalChange 基于漂移基线生成非法 changeset）。
   * 该变更最终仍会随下次业务写入重新生成，数据不丢。
   */
  async resetTable(tableName: string): Promise<void> {
    this.docs.delete(tableName);
    await this.initDoc(tableName);
  }
}

// ─── 单例 ────────────────────────────────────────────────────────────────────

export const crdtEngine = new CRDTEngine();

// ─── Feature Flag（迁至 syncMode.ts，re-export 保持旧路径兼容） ──────────────

export { getSyncMode, setSyncMode, shouldUseCRDT } from './syncMode';

// ─── 向后兼容 re-export（旧导入路径保持有效） ────────────────────────────────

export { CRDT_ENABLED_TABLES, SYNC_MODE_FLAG } from './crdtTypes';
export type {
  CRDTDocState,
  CRDTTableDoc,
  CRDTChangeset,
  RemoteCRDTChange,
  CRDTDocRecord,
  CRDTChangeRecord,
} from './crdtTypes';
