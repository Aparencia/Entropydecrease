/**
 * 世界主权 IPC handlers（sovereignty:*，阶段 D 信任问题）
 * World sovereignty IPC handlers (export / restore)
 *
 * @ai-context: 「世界之书」的落盘与恢复。导出=知识图谱摘要
 * （memoryQueries.queryKnowledgeGraph，摘要级）+ 世界快照（world_snapshots
 * 单行 latest）+ 入籍记录（imports）+ 十张学习表完整行（恢复层），
 * 复用 worldExport 纯函数组装——bundle 不含任何 AI 密钥/网关配置。
 * 恢复=validateWorldImport Result 校验（版本/结构/节点≤5000/表白名单/
 * 总行数）→ 按白名单顺序重排 → 整体事务内循环 importTable
 * （INSERT OR REPLACE 幂等，better-sqlite3 嵌套事务自动降级 savepoint，
 * 任一表失败整体回滚）→ FTS 索引重建让搜索立即覆盖恢复内容。
 *
 * @ai-context: Export bundles the graph summary, world snapshot, settling
 * records and ten whitelisted tables (never any secrets). Restore validates
 * first, then imports in one transaction (idempotent INSERT OR REPLACE),
 * then rebuilds the FTS index.
 */
import { dialog } from 'electron';
import { writeFile, readFile } from 'fs/promises';
import { safeHandle } from './ipcUtils.js';
import { logger } from './logger.js';
import { getConnection } from './db/sqliteService.js';
import { importTable } from './db/migration.js';
import { queryKnowledgeGraph } from './mcp/memoryQueries.js';
import { collectIndexableData, rebuildIndex } from './db/fts5Search.js';
import {
  buildWorldExport,
  validateWorldImport,
  WORLD_TABLE_WHITELIST,
  type WorldTableBundle,
} from '../src/features/sovereignty/lib/worldExport.js';

/** 快照单行 id（与 useWorldSnapshotSync 的 SNAPSHOT_ID 对齐） / Snapshot row id */
const SNAPSHOT_ID = 'latest';
/** 入籍记录导出上限（叙述层防超大响应；恢复层 tables.imports 不受限） */
const MAX_RECORDS = 5000;

/** 恢复层表白名单（父表在前，满足外键约束；与 worldExport 白名单同源） */
const EXPORT_TABLES = WORLD_TABLE_WHITELIST;

/** 读取单表全量行（表名来自编译期白名单，非用户输入） / Read all rows of a whitelisted table */
function readTableRows(db: ReturnType<typeof getConnection>, table: string): Array<Record<string, unknown>> {
  return db.prepare(`SELECT * FROM "${table}"`).all() as Array<Record<string, unknown>>;
}

/**
 * 注册世界主权 IPC handlers（app ready 后调用一次）
 */
export function registerSovereigntyHandlers(): void {
  /**
   * sovereignty:export-world — 导出世界之书到 JSON 文件。
   * 保存对话框由主进程弹出；导出内容不含任何密钥/配置。
   */
  safeHandle('sovereignty:export-world', async () => {
    try {
      const db = getConnection();

      // 叙述层：图谱摘要（摘要级：概念前 60 字 + 档位 + 关联数）
      const graph = queryKnowledgeGraph(db, 100);
      // 叙述层：世界快照（world_snapshots 单行 latest 的 payload 对象）
      const snapshotRow = db.prepare(
        `SELECT id, payload FROM world_snapshots WHERE id = ?`,
      ).get(SNAPSHOT_ID) as { payload: string } | undefined;
      // 叙述层：入籍记录（倒序，上限防超大）
      const records = db.prepare(
        `SELECT id, source, raw_name, concept_count, settled_at
         FROM imports ORDER BY settled_at DESC LIMIT ?`,
      ).all(MAX_RECORDS) as Array<Record<string, unknown>>;
      // 恢复层：十张白名单表完整行（外键顺序）
      const tables: WorldTableBundle[] = EXPORT_TABLES.map((table) => ({
        table,
        rows: readTableRows(db, table),
      }));

      const bundle = buildWorldExport(graph, snapshotRow ?? null, records, {
        exportedAt: new Date().toISOString(),
        tables,
      });

      const defaultName = `entropy-world-${new Date().toISOString().slice(0, 10)}.json`;
      const result = await dialog.showSaveDialog({
        title: '导出我的世界',
        defaultPath: defaultName,
        filters: [
          { name: '世界之书', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true, path: null };
      }

      await writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf-8');
      const rowCount = tables.reduce((s, t) => s + t.rows.length, 0);
      const nodeCount = Array.isArray(bundle.graph.nodes) ? bundle.graph.nodes.length : 0;
      logger.info(`[Sovereignty] World exported to ${result.filePath} (${rowCount} rows, ${nodeCount} nodes)`);
      return { success: true, canceled: false, path: result.filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Sovereignty] Export failed', err);
      return { success: false, canceled: false, path: null, error: `世界导出失败：${msg}` };
    }
  });

  /**
   * sovereignty:import-world — 从 JSON 文件恢复世界。
   * 校验先行（Result 模式），通过后整体事务幂等导入。
   */
  safeHandle('sovereignty:import-world', async () => {
    const result = await dialog.showOpenDialog({
      title: '恢复我的世界',
      filters: [
        { name: '世界之书', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    try {
      const text = await readFile(result.filePaths[0], 'utf-8');
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { success: false, error: '文件不是有效的 JSON，无法恢复' };
      }

      const check = validateWorldImport(parsed);
      if (!check.ok) {
        logger.warn(`[Sovereignty] Import rejected: ${check.error}`);
        return { success: false, error: check.error };
      }

      // 按白名单顺序重排（防御手改文件打乱顺序破坏外键约束）
      const ordered = [...check.bundle.tables].sort(
        (a, b) => EXPORT_TABLES.indexOf(a.table) - EXPORT_TABLES.indexOf(b.table),
      );

      const db = getConnection();
      let rowsImported = 0;
      // 整体事务：importTable 内部嵌套事务自动降级 savepoint，任一表失败整体回滚
      const txn = db.transaction((tables: WorldTableBundle[]) => {
        for (const t of tables) {
          rowsImported += importTable(t.table, t.rows);
        }
      });
      txn(ordered);

      // FTS 索引重建：让搜索立即覆盖恢复的笔记/卡片
      try {
        rebuildIndex(collectIndexableData(db));
      } catch (ftsErr) {
        logger.warn(`[Sovereignty] FTS rebuild after restore failed: ${ftsErr instanceof Error ? ftsErr.message : String(ftsErr)}`);
      }

      logger.info(`[Sovereignty] World restored from ${result.filePaths[0]} (${rowsImported} rows)`);
      return {
        success: true,
        rowsImported,
        tables: ordered.map((t) => ({ table: t.table, rows: t.rows.length })),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[Sovereignty] Import failed', err);
      return { success: false, error: `世界恢复失败：${msg}` };
    }
  });
}
