/**
 * importWhitelist 单元测试（阶段 D 致命修复：恢复表可导入性）
 * Import whitelist tests (stage-D fix: restore tables must be importable)
 *
 * @ai-context: 回归覆盖阶段 D 致命 bug——importTable 白名单曾不含
 * world_snapshots/imports，世界恢复必然失败。本测试验证：
 * ① 世界导出白名单（WORLD_TABLE_WHITELIST）全部表可被 importTable 接受
 * （防双白名单漂移）；② 迁移白名单表仍可导入（未破坏迁移流程）；
 * ③ 白名单外表拒绝。零依赖——不加载 better-sqlite3（Electron ABI），
 * 纯逻辑验证 isImportableTable。
 *
 * @ai-context: Regression for the stage-D bug where world_snapshots and
 * imports were rejected by importTable. Asserts every exportable table
 * is importable (no whitelist drift), migration tables still work, and
 * unknown tables are rejected.
 */
import { describe, it, expect } from 'vitest';
import {
  isImportableTable,
  RESTORE_EXTRA_TABLES,
} from '../../../../electron/db/importWhitelist.js';
import { WORLD_TABLE_WHITELIST } from './worldExport';

/** 迁移白名单样例（migration.ts TABLE_MAPPING 子集，覆盖代表性表） */
const MIGRATION_TABLES = [
  'note_folders',
  'notes',
  'flashcard_decks',
  'flashcards',
  'flashcard_reviews',
  'feynman_notes',
  'feynman_summaries',
  'feynman_weak_points',
  'app_settings',
  'pomodoro_sessions',
] as const;

describe('isImportableTable（可导入表白名单）', () => {
  it('世界导出白名单全部表均可导入（防双白名单漂移）', () => {
    // Arrange & Act & Assert
    for (const table of WORLD_TABLE_WHITELIST) {
      expect(isImportableTable(table, MIGRATION_TABLES), `表 ${table} 应可导入`).toBe(true);
    }
  });

  it('世界恢复扩展表含 world_snapshots 与 imports（阶段 D 致命修复回归）', () => {
    // Arrange & Act & Assert
    expect(RESTORE_EXTRA_TABLES).toContain('world_snapshots');
    expect(RESTORE_EXTRA_TABLES).toContain('imports');
    expect(isImportableTable('world_snapshots', MIGRATION_TABLES)).toBe(true);
    expect(isImportableTable('imports', MIGRATION_TABLES)).toBe(true);
  });

  it('迁移白名单表仍可导入（扩展不破坏迁移流程）', () => {
    // Arrange & Act & Assert
    for (const table of MIGRATION_TABLES) {
      expect(isImportableTable(table, MIGRATION_TABLES), `迁移表 ${table} 应可导入`).toBe(true);
    }
  });

  it('白名单外表拒绝（evil_table / 空串）', () => {
    // Arrange & Act & Assert
    expect(isImportableTable('evil_table', MIGRATION_TABLES)).toBe(false);
    expect(isImportableTable('', MIGRATION_TABLES)).toBe(false);
    expect(isImportableTable('notes', [])).toBe(false); // 迁移列表为空时仅扩展表可导入
    expect(isImportableTable('world_snapshots', [])).toBe(true);
  });
});
