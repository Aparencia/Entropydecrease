/**
 * 导入导出统一出口（兼容层）
 *
 * @ai-context: 历史上本文件是 552 行单体，2026-07 迁移重构时按职责拆分为
 * deckExchange（牌组交换）/ fullExport（全量导出导入）/ backupService
 * （加密与自动备份）。本文件保留为 re-export barrel，外部 2 处
 * `@/lib/storage/exportImport` 导入无需改动。新代码建议直接从子模块导入。
 */

export {
  exportDeck,
  downloadDeckFile,
  importDeck,
  importDeckNew,
  importDeckOverwrite,
  importDeckSkip,
  importDeckMerge,
} from './deckExchange';

export {
  exportAllData,
  downloadExport,
  importData,
  readFileAsText,
  type ExportData,
} from './fullExport';

export {
  createEncryptedBackup,
  restoreFromBackup,
  createAutoBackup,
  listAutoBackups,
  restoreFromAutoBackup,
  type EncryptedBackupFile,
} from './backupService';
