import Dexie, { type Table } from 'dexie';
import type {
  PomodoroSession, PomodoroSettings, PomodoroPreset, Note, NoteFolder, NoteLink,
  FlashcardDeck, Flashcard, FlashcardReview,
  FeynmanNote, FeynmanSummary, FeynmanWeakPoint, FeynmanAIResult,
  OperationLog, AppSettings, SyncConflict, OfflineQueueItem,
  StudyCheckIn, Achievement, PomodoroGoal, WindowCapture, WindowCaptureSegment,
  Consent, UserProfile, Inspiration, SearchIndexEntry, RitualRecord, PredictionRecord
} from '@/types/models';
import type { DeepSeaDiscovery, CoralRecord, StreakState } from '@/features/retention/types';
import type { ClassroomNote } from './classroomNoteStore';
import type { CRDTDocRecord, CRDTChangeRecord } from '@/lib/sync/crdtEngine';

/**
 * IndexedDB 数据库定义（Dexie）
 *
 * @ai-context: 警告——IndexedDB 数据库名 'keban' 与 v8 迁移读取的
 * 'keban-inspirations' localStorage 键均为存量用户数据标识，绝对不可
 * 改名（改名等于清空全体用户本地数据）。品牌统一任务明确豁免这两处。
 * @ai-context: schema 版本只增不改——历史 version(n) 定义是既有用户
 * 升级链路的一部分，修改历史版本会破坏升级；新增字段/表必须开新版本号。
 * @ai-context: 类名 EntropyDecreaseDatabase 为 2026-07 品牌重构后命名，
 * KeBanDatabase 为兼容别名，新代码禁止使用。
 */
export class EntropyDecreaseDatabase extends Dexie {
  pomodoroSessions!: Table<PomodoroSession, string>;
  pomodoroSettings!: Table<PomodoroSettings, string>;
  notes!: Table<Note, string>;
  noteFolders!: Table<NoteFolder, string>;
  flashcardDecks!: Table<FlashcardDeck, string>;
  flashcards!: Table<Flashcard, string>;
  flashcardReviews!: Table<FlashcardReview, string>;
  feynmanNotes!: Table<FeynmanNote, string>;
  feynmanSummaries!: Table<FeynmanSummary, string>;
  feynmanWeakPoints!: Table<FeynmanWeakPoint, string>;
  operationLog!: Table<OperationLog, string>;
  appSettings!: Table<AppSettings, string>;
  syncConflicts!: Table<SyncConflict, string>;
  offlineQueue!: Table<OfflineQueueItem, string>;
  studyCheckIns!: Table<StudyCheckIn, string>;
  achievements!: Table<Achievement, string>;
  pomodoroGoals!: Table<PomodoroGoal, string>;
  windowCaptures!: Table<WindowCapture, string>;
  consent!: Table<Consent, string>;
  userProfile!: Table<UserProfile, string>;
  inspirations!: Table<Inspiration, string>;
  searchIndex!: Table<SearchIndexEntry, number>;
  classroomNotes!: Table<ClassroomNote, string>;
  crdtDocs!: Table<CRDTDocRecord, string>;
  crdtChanges!: Table<CRDTChangeRecord, number>;
  ritualRecords!: Table<RitualRecord, string>;
  pomodoroPresets!: Table<PomodoroPreset, string>;
  deepSeaDiscoveries!: Table<DeepSeaDiscovery, string>;
  coralEcosystem!: Table<CoralRecord, string>;
  streakState!: Table<StreakState, string>;
  windowCaptureSegments!: Table<WindowCaptureSegment, string>;
  noteLinks!: Table<NoteLink, string>;
  feynmanAIResults!: Table<FeynmanAIResult, string>;
  /** AI 预测题记录表 — 持久化预测驱动学习的结果 */
  predictions!: Table<PredictionRecord, string>;

  constructor() {
    // 数据库名 'keban' 不可修改（存量用户数据），见文件头 @ai-context
    super('keban');

    this.version(1).stores({
      pomodoroSessions: '++id, completedAt, mode, subject',
      pomodoroSettings: '++id',
      notes: '++id, title, folderId, createdAt, updatedAt, *tags, pinned',
      noteFolders: '++id, parentId, name, order',
      flashcardDecks: '++id, parentId, name, order',
      flashcards: '++id, deckId, dueDate, type, createdAt, order',
      flashcardReviews: '++id, cardId, deckId, reviewedAt',
      feynmanSessions: '++id, status, concept, createdAt, updatedAt',
      operationLog: '++id, entityType, entityId, synced, createdAt',
      appSettings: '++id, &key',
    });

    // 拆分 feynmanSessions 为三张独立表
    this.version(2).stores({
      feynmanSessions: null,
      feynmanNotes: '++id, status, concept, createdAt, updatedAt',
      feynmanSummaries: '++id, noteId',
      feynmanWeakPoints: '++id, noteId',
    });

    // MVP-2: 自增 number ID -> UUID string 主键 + 新增同步表
    this.version(3).stores({
      pomodoroSessions: 'id, completedAt, mode, subject',
      pomodoroSettings: 'id',
      notes: 'id, title, folderId, createdAt, updatedAt, *tags, pinned',
      noteFolders: 'id, name, parentId, createdAt, order',
      flashcardDecks: 'id, name, createdAt, updatedAt, description',
      flashcards: 'id, deckId, front, back, createdAt, dueDate, interval, easeFactor, repetitions, lapses',
      flashcardReviews: 'id, cardId, deckId, reviewedAt',
      feynmanNotes: 'id, status, concept, createdAt, updatedAt',
      feynmanSummaries: 'id, noteId',
      feynmanWeakPoints: 'id, noteId',
      operationLog: 'id, entityType, entityId, synced, createdAt, version, deviceId',
      appSettings: 'id',
      syncConflicts: 'id, entityType, entityId, status, createdAt',
      offlineQueue: 'id, entityType, entityId, createdAt, retryCount',
    }).upgrade(async (tx) => {
      // Schema v2 -> v3 迁移：自增 number ID -> UUID string

      const genId = () => crypto.randomUUID();

      await tx.table('appSettings').put({
        id: genId(),
        key: 'migration_v3_log',
        value: JSON.stringify({ from: 2, to: 3, detail: 'number IDs -> UUID strings', timestamp: new Date().toISOString() }),
        updatedAt: new Date(),
      });

      const migrateTable = async (tableName: string) => {
        const table = tx.table(tableName);
        const allItems = await table.toArray();
        if (allItems.length === 0) return;

        const idMap = new Map<number, string>();
        allItems.forEach((item: Record<string, unknown>) => {
          if (typeof item.id === 'number') {
            idMap.set(item.id, genId());
          }
        });

        if (idMap.size === 0) return;

        await table.clear();
        for (const item of allItems) {
          const newItem = { ...item };
          if (typeof newItem.id === 'number') {
            newItem.id = idMap.get(newItem.id) || genId();
          }
          await table.add(newItem);
        }
      };

      const tables = [
        'pomodoroSessions', 'pomodoroSettings', 'notes', 'noteFolders',
        'flashcardDecks', 'flashcards', 'flashcardReviews',
        'feynmanNotes', 'feynmanSummaries', 'feynmanWeakPoints',
        'appSettings',
      ];

      // Bug #17: 记录迁移结果，关键表失败时 throw
      const migrationResults = new Map<string, { success: boolean; error?: unknown }>();
      const criticalTables = new Set(['flashcards', 'notes']);

      for (const tableName of tables) {
        try {
          await migrateTable(tableName);
          migrationResults.set(tableName, { success: true });
        } catch (e) {
          console.warn(`[DB] Failed to migrate table ${tableName}:`, e);
          migrationResults.set(tableName, { success: false, error: e });
          if (criticalTables.has(tableName)) {
            throw new Error(`[DB] Critical table "${tableName}" migration failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }

      try {
        const opLogs = await tx.table('operationLog').toArray();
        if (opLogs.length > 0) {
          await tx.table('operationLog').clear();
          for (const log of opLogs) {
            await tx.table('operationLog').add({
              ...log,
              id: typeof log.id === 'number' ? genId() : log.id,
              version: log.version || 0,
              deviceId: log.deviceId || 'migration',
            });
          }
        }
      } catch (e) {
        console.warn('[DB] Failed to migrate operationLog:', e);
      }
    });

    this.version(4).stores({
      studyCheckIns: 'id, &date, checkInTime, streakDays',
      achievements: 'id, &key, unlockedAt',
      pomodoroGoals: 'id, text, useCount, lastUsedAt',
    });

    this.version(5).stores({
      windowCaptures: 'id, noteId, status, startedAt',
    });

    this.version(6).stores({
      flashcards: 'id, deckId, front, back, createdAt, dueDate, interval, easeFactor, repetitions, lapses, sourceNoteId',
      notes: 'id, title, folderId, createdAt, updatedAt, *tags, pinned, videoNoteType',
    });

    this.version(7).stores({
      consent: 'id, &type, version, acceptedAt',
    });

    this.version(8).stores({
      userProfile: 'id, userId, email, updatedAt',
      inspirations: 'id, createdAt, updatedAt, [tags.content_nature+tags.cognitive_depth+tags.subject]',
    }).upgrade(async (tx) => {
      try {
        // 历史迁移键，不可改名（见文件头 @ai-context）
        const raw = localStorage.getItem('keban-inspirations');
        if (raw) {
          const items = JSON.parse(raw);
          if (Array.isArray(items) && items.length > 0) {
            await tx.table('inspirations').bulkPut(items);
            localStorage.removeItem('keban-inspirations');
          }
        }
      } catch {
        // 迁移失败不阻塞，保留 localStorage
      }
    });

    // v0.9.0: 新增全文搜索索引表
    this.version(9).stores({
      searchIndex: '++id, noteId, *tokens, title, content, updatedAt',
    }).upgrade(async (tx) => {
      // v8 -> v9 迁移：确保搜索索引表干净可用
      try {
        await tx.table('searchIndex').clear();
      } catch {
        // 搜索索引表不存在时忽略
      }
    });

    // 去掉 studyCheckIns.date 的唯一约束，允许并发写入安全
    this.version(10).stores({
      studyCheckIns: 'id, date, checkInTime, streakDays',
    });

    // 新增 sortStatus 索引，支持灵感分拣状态查询
    this.version(11).stores({
      inspirations: 'id, createdAt, updatedAt, sortStatus, [tags.content_nature+tags.cognitive_depth+tags.subject]',
    });

    // v1.2.0: 新增课堂笔记表（课堂助手 AI 分析结果持久化）
    this.version(12).stores({
      classroomNotes: 'id, sessionId, sourceType, createdAt',
    });

    // v1.3.0: FSRS-5 算法扩展字段（stability / difficulty）
    this.version(13).stores({
      flashcards: 'id, deckId, front, back, createdAt, dueDate, interval, easeFactor, repetitions, lapses, sourceNoteId, stability, difficulty',
    });

    // v1.2.0: 全局统一搜索 —— searchIndex 表增加 entityId / entityType 索引字段
    this.version(14).stores({
      searchIndex: '++id, entityId, noteId, entityType, *tokens, title, content, updatedAt',
    }).upgrade(async (tx) => {
      // v12/v13 -> v14 迁移：为现有 searchIndex 记录补充 entityType = 'note'
      try {
        const entries = await tx.table('searchIndex').toArray();
        if (entries.length > 0) {
          for (const entry of entries) {
            // 补充 entityId（等于 noteId）和 entityType
            if (!entry.entityType) {
              await tx.table('searchIndex').update(entry.id, {
                entityType: 'note',
                entityId: entry.noteId,
              });
            }
          }
        }
      } catch {
        // 迁移失败不阻塞启动
      }
    });

    // v1.4.0: CRDT 同步引擎 — 新增 crdt_docs / crdt_changes 表
    this.version(15).stores({
      crdtDocs: 'tableName',
      crdtChanges: '++seq, tableName, entityId, createdAt',
    });

    // v0.26.0: 学习启动仪式记录表（掌握标记/微目标/编排埋点，FEAT RIT-06/09）
    this.version(16).stores({
      ritualRecords: 'id, date, createdAt',
    });

    // v0.28.0: 番茄钟模式预设表（自定义节律 + 循环标记数量随预设变化）
    this.version(17).stores({
      pomodoroPresets: 'id, sortOrder, builtin, createdAt',
    });

    // v0.29.0: 留存机制 — 深海发现 / 珊瑚生态 / 防断裂 streak
    this.version(18).stores({
      deepSeaDiscoveries: 'id, type, rarity, discoveredAt, sourceType',
      coralEcosystem: 'id, type, health, plantedAt, depth',
      streakState: 'id, lastActiveDate',
    });

    // P2-14: 采集片段独立表 — 将 segments 从 windowCaptures 内嵌数组拆出，
    // addSegment 由全量读改写（O(n)+竞态）变为原子追加；旧会话内嵌 segments
    // 仍可读（captureStore.getSegments 回退），无需数据迁移。
    this.version(19).stores({
      windowCaptureSegments: 'id, sessionId, timestamp',
    });

    // P2-14 存量迁移（用户数据量小，直接搬迁）：将旧会话内嵌 segments
    // 物理搬迁至 windowCaptureSegments 独立表并清空内嵌数组，彻底瘦身
    // windowCaptures 记录。windowCaptures 不参与 CRDT 同步，迁移无跨端副作用。
    this.version(20).stores({}).upgrade(async (tx) => {
      const sessions = await tx.table('windowCaptures').toArray();
      for (const session of sessions) {
        const segs = (session as { segments?: unknown[] }).segments;
        if (Array.isArray(segs) && segs.length > 0) {
          const rows = segs.map((s) => ({ ...(s as object), sessionId: session.id }));
          await tx.table('windowCaptureSegments').bulkPut(rows);
          await tx.table('windowCaptures').update(session.id, { segments: [] });
        }
      }
    });

    // 阶段二：笔记双向链接索引表（由笔记内容 wiki-link 推导的出链，本地派生索引）
    this.version(21).stores({
      noteLinks: 'id, fromId, toId',
    });

    // v0.30.0: 费曼会话 AI 交互结果持久化（用户反馈“AI 反馈内容返回列表后消失”）
    this.version(22).stores({
      feynmanAIResults: 'id, &noteId, updatedAt',
    });

    // AI 预测题持久化 — 保存预测驱动学习的结果，跨会话可回顾
    this.version(23).stores({
      predictions: 'id, noteId, createdAt',
    });
  }
}

/** @deprecated 品牌重构前的旧类名，仅为兼容保留，新代码使用 EntropyDecreaseDatabase */
export { EntropyDecreaseDatabase as KeBanDatabase };

/**
 * 数据库实例工厂（测试可创建隔离实例）
 *
 * @ai-context: 测试中请使用本工厂配合 fake-indexeddb，禁止直接使用下方
 * db 单例连接真实浏览器 IndexedDB。
 */
export function createDatabase(): EntropyDecreaseDatabase {
  return new EntropyDecreaseDatabase();
}

/**
 * 应用级共享单例
 *
 * @ai-context: 25+ 消费方直接 import { db }，属既定架构（模块级单例）。
 * 渐进重构方向：新代码优先通过参数注入 db（参考 achievements/evaluator.ts
 * 的默认参数 DI 模式），存量消费方在各自迁移批次中逐步改造。
 */
export const db = createDatabase();
export { captureStore } from './captureStore';
