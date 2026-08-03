/**
 * 可导入表白名单（零依赖纯逻辑，供 migration.ts 与测试共用）
 * Import whitelist (zero-dependency; shared by migration.ts and tests)
 *
 * @ai-context: importTable 的合法表 = IndexedDB 迁移白名单（TABLE_MAPPING
 * 派生，migration.ts 持有）+ 世界恢复扩展（world_snapshots/imports，
 * schema.ts 新增表）。扩展表单独声明，避免污染迁移流程；isImportableTable
 * 供世界导出白名单（worldExport.ts WORLD_TABLE_WHITELIST）与迁移白名单
 * 做一致性校验——导出/恢复信任动作的表名必须可被 importTable 接受。
 *
 * @ai-context: Importable tables = migration whitelist + restore-only
 * extras. Kept separate so the migration flow is untouched; tests assert
 * every exportable table is importable to prevent whitelist drift.
 */

/** 世界恢复扩展白名单（schema.ts 新增表，非 IndexedDB 迁移表） */
export const RESTORE_EXTRA_TABLES = ['world_snapshots', 'imports'] as const;
export type RestoreExtraTable = (typeof RESTORE_EXTRA_TABLES)[number];

/**
 * 判断表名是否可被 importTable 导入
 * @param table - SQLite 表名
 * @param migrationTables - 迁移白名单（TABLE_MAPPING 派生，由调用方传入）
 */
export function isImportableTable(table: string, migrationTables: readonly string[]): boolean {
  return migrationTables.includes(table) || (RESTORE_EXTRA_TABLES as readonly string[]).includes(table);
}
