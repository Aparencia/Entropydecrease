/**
 * 数据同步领域类型
 *
 * @ai-context: 本地优先同步链路的数据契约。OperationLog.version 与
 * deviceId 是服务端冲突检测的依据，与 CRDT（Automerge v3）同步链路
 * 并存：结构化实体走 OperationLog 增量推送，笔记正文走 CRDT 二进制
 * 变更（见 crdtEngine）。两条链路的版本号语义不同，禁止混用。
 * @ai-context: OfflineQueueItem.nextRetryAt 实现指数退避重试，
 * 未设置或已过期表示可立即重试。
 * @ai-context: 纯类型文件，无运行时代码，可安全重构。
 */

// 操作日志（为后续同步预留）
export interface OperationLog {
  id: string;
  entityType: string;            // 'note' | 'flashcard' | 'pomodoro' | 'feynman' 等
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload?: string;              // JSON 格式的变更数据
  createdAt: Date;
  synced: boolean;               // 是否已同步到云端
  // MVP-2 新增同步字段
  version: number;
  deviceId: string;
  patch?: string;
}

// MVP-2 同步相关接口
export interface SyncConflict {
  id: string;
  entityType: string;
  entityId: string;
  localData: string;  // JSON serialized
  remoteData: string; // JSON serialized
  localVersion: number;
  remoteVersion: number;
  status: 'pending' | 'resolved-local' | 'resolved-remote' | 'resolved-manual';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface OfflineQueueItem {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload?: string;
  version: number;
  deviceId: string;
  createdAt: Date;
  retryCount: number;
  /** 下次可重试的时间戳（ms），未设置或已过期表示可立即重试 */
  nextRetryAt?: number;
}
