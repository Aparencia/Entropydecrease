import Dexie, { type Table } from 'dexie';
import type {
  PomodoroSession, PomodoroSettings, Note, NoteFolder,
  FlashcardDeck, Flashcard, FlashcardReview,
  FeynmanNote, FeynmanSummary, FeynmanWeakPoint,
  OperationLog, AppSettings, SyncConflict, OfflineQueueItem,
  StudyCheckIn, Achievement, PomodoroGoal, WindowCapture,
  Consent, UserProfile, Inspiration, SearchIndexEntry
} from '@/types/models';
import type { ClassroomNote } from './classroomNoteStore';
import type { CRDTDocRecord, CRDTChangeRecord } from '@/lib/sync/crdtEngine';

export class KeBanDatabase extends Dexie {
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

  constructor() {
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
  }
}

export const db = new KeBanDatabase();
export { captureStore } from './captureStore';
