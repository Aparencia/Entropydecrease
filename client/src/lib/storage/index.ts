/**
 * 存储层统一出口
 *
 * @ai-context: 预创建的 StorageAdapter 实例为 PWA 路径的既定用法；
 * Electron 路径请使用 storageFactory.createStorage（运行时自动选择）。
 * KeBanDatabase 为品牌重构前的兼容别名，新代码使用 EntropyDecreaseDatabase。
 */

export { db, EntropyDecreaseDatabase, KeBanDatabase, createDatabase } from './database';
export { StorageAdapter } from './StorageAdapter';
export type { IRepository, SyncResult } from './interfaces';
export type { SyncConflict } from '@/types/models';
export { logOperation, getUnsyncedLogs, markLogsSynced } from './operationLog';
export { SENSITIVE_FIELDS, NON_SENSITIVE_TABLES } from './sensitiveFields';

// 预创建的存储适配器实例
import { db } from './database';
import { StorageAdapter } from './StorageAdapter';

export const pomodoroSessionStore = new StorageAdapter(db.pomodoroSessions, 'pomodoroSessions');
export const pomodoroSettingsStore = new StorageAdapter(db.pomodoroSettings, 'pomodoroSettings');
export const noteStore = new StorageAdapter(db.notes, 'notes');
export const noteFolderStore = new StorageAdapter(db.noteFolders, 'noteFolders');
export const flashcardDeckStore = new StorageAdapter(db.flashcardDecks, 'flashcardDecks');
export const flashcardStore = new StorageAdapter(db.flashcards, 'flashcards');
export const flashcardReviewStore = new StorageAdapter(db.flashcardReviews, 'flashcardReviews');
export const feynmanNoteStore = new StorageAdapter(db.feynmanNotes, 'feynmanNotes');
export const feynmanSummaryStore = new StorageAdapter(db.feynmanSummaries, 'feynmanSummaries');
export const feynmanWeakPointStore = new StorageAdapter(db.feynmanWeakPoints, 'feynmanWeakPoints');
export const feynmanAIResultStore = new StorageAdapter(db.feynmanAIResults, 'feynmanAIResults');
export const operationLogStore = new StorageAdapter(db.operationLog, 'operationLog');
export const appSettingsStore = new StorageAdapter(db.appSettings, 'appSettings');
export const syncConflictsStore = new StorageAdapter(db.syncConflicts, 'syncConflicts');
export const offlineQueueStore = new StorageAdapter(db.offlineQueue, 'offlineQueue');
export const pomodoroGoalStore = new StorageAdapter(db.pomodoroGoals, 'pomodoroGoals');
export const pomodoroPresetStore = new StorageAdapter(db.pomodoroPresets, 'pomodoroPresets');
export const ritualRecordStore = new StorageAdapter(db.ritualRecords, 'ritualRecords');

// 导入导出与存储管理
export { exportAllData, downloadExport, importData, readFileAsText } from './exportImport';
export type { ExportData } from './exportImport';
export { getStorageInfo, formatBytes } from './StorageManager';
export type { StorageInfo } from './StorageManager';
