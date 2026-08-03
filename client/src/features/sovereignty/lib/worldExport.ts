/**
 * 世界导出纯函数（阶段 D 信任问题）
 * World export pure functions (sovereignty, stage D)
 *
 * @ai-context: 「世界之书」的组成与校验。零依赖纯函数——渲染进程
 * （主权页预览）与主进程（sovereigntyHandlers 导出/恢复）复用同一实现，
 * 保证导出文件自洽。bundle 分两层：叙述层（graph 图谱摘要 + world
 * 世界快照 + settlingRecords 入籍记录 + privacyNote 隐私声明）与
 * 恢复层（tables 完整行，幂等 INSERT OR REPLACE 数据源）。
 * validateWorldImport 走 Result 模式：校验 formatVersion、结构完整性、
 * 节点 ≤5000、表名白名单与总行数上限，任一不过即整体拒绝——恢复是
 * 信任动作，宁可拒绝也不半途写库。
 *
 * @ai-context: Zero-dependency pure functions shared by renderer and
 * main process. Bundle = narrative layer (graph/world/settlingRecords/
 * privacyNote) + restore layer (full table rows). Validation uses a
 * Result pattern; any violation rejects the whole import.
 */

/** 当前导出格式版本 / Current bundle format version */
export const WORLD_EXPORT_FORMAT_VERSION = 1;
/** 图谱节点数上限（防超大导出文件拖垮恢复流程） / Max graph nodes */
export const WORLD_EXPORT_MAX_NODES = 5000;
/** 恢复层总行数上限 / Max total restore rows */
export const WORLD_EXPORT_MAX_ROWS = 100_000;

/** 恢复层表名白名单（与 schema.ts / importTable 白名单对齐） / Restore whitelist */
export const WORLD_TABLE_WHITELIST = [
  'note_folders',
  'notes',
  'flashcard_decks',
  'flashcards',
  'flashcard_reviews',
  'feynman_notes',
  'feynman_summaries',
  'feynman_weak_points',
  'imports',
  'world_snapshots',
] as const;
export type WorldTableName = (typeof WORLD_TABLE_WHITELIST)[number];

/** 恢复层：单表完整行 / Restore rows for one table */
export interface WorldTableBundle {
  table: WorldTableName;
  rows: Array<Record<string, unknown>>;
}

/** 导出包元数据 / Export metadata */
export interface WorldExportMeta {
  /** ISO 时间戳 / ISO timestamp */
  exportedAt: string;
  /** 恢复层完整行（按表分组） / Full table rows grouped by table */
  tables: WorldTableBundle[];
}

/** 世界之书导出包 / World export bundle */
export interface WorldExportBundle {
  formatVersion: typeof WORLD_EXPORT_FORMAT_VERSION;
  exportedAt: string;
  /** 知识图谱摘要（memoryQueries.queryKnowledgeGraph 产物） / Graph summary */
  graph: Record<string, unknown>;
  /** 世界快照（world_snapshots.latest payload 解析对象；无快照为 null） / World snapshot */
  world: Record<string, unknown> | null;
  /** 入籍记录（imports 表全量） / Settling records */
  settlingRecords: Array<Record<string, unknown>>;
  /** 隐私声明：导出不含密钥 / Privacy note */
  privacyNote: string;
  /** 恢复层：完整表行（幂等导入数据源） / Restore layer */
  tables: WorldTableBundle[];
}

/** 导入校验结果（Result 模式） / Import validation result */
export type WorldImportResult =
  | { ok: true; bundle: WorldExportBundle }
  | { ok: false; error: string };

/** 隐私声明固定文案——导出包永不含 AI 密钥/网关配置/账号凭据 */
const PRIVACY_NOTE =
  '本导出仅包含你的学习世界：图谱摘要、世界快照、入籍记录与学习数据行。' +
  '不包含任何 AI 密钥、网关配置或账号凭据。';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * 组装世界之书导出包 / Build a world export bundle.
 *
 * @param graph - 知识图谱摘要（主进程 queryKnowledgeGraph 产物）
 * @param snapshot - world_snapshots 行（{ payload: JSON 字符串 }），无快照传 null
 * @param records - imports 表行（snake_case）
 * @param meta - 元数据（exportedAt + 恢复层 tables）
 */
export function buildWorldExport(
  graph: Record<string, unknown>,
  snapshot: { payload?: unknown } | null,
  records: Array<Record<string, unknown>>,
  meta: WorldExportMeta,
): WorldExportBundle {
  let world: Record<string, unknown> | null = null;
  if (snapshot && typeof snapshot.payload === 'string') {
    try {
      const parsed: unknown = JSON.parse(snapshot.payload);
      if (isPlainObject(parsed)) world = parsed;
    } catch {
      // 快照 payload 损坏时按无快照处理（导出不因此失败）
      world = null;
    }
  }
  return {
    formatVersion: WORLD_EXPORT_FORMAT_VERSION,
    exportedAt: meta.exportedAt,
    graph,
    world,
    settlingRecords: records,
    privacyNote: PRIVACY_NOTE,
    tables: meta.tables,
  };
}

/**
 * 校验外部导入文件（Result 模式：任一不过即整体拒绝）
 * Validate an external file before restore. Any violation rejects all.
 */
export function validateWorldImport(raw: unknown): WorldImportResult {
  if (!isPlainObject(raw)) {
    return { ok: false, error: '不是有效的世界导出文件（应为 JSON 对象）' };
  }

  if (raw.formatVersion !== WORLD_EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `版本不符：仅支持 v${WORLD_EXPORT_FORMAT_VERSION} 导出文件（当前文件为 v${String(raw.formatVersion)}）`,
    };
  }

  if (!isPlainObject(raw.graph)) {
    return { ok: false, error: '图谱数据缺失或格式不正确' };
  }
  const nodes = raw.graph.nodes;
  if (nodes !== undefined) {
    if (!Array.isArray(nodes)) {
      return { ok: false, error: '图谱节点格式不正确' };
    }
    if (nodes.length > WORLD_EXPORT_MAX_NODES) {
      return {
        ok: false,
        error: `图谱节点数超出上限（${nodes.length} > ${WORLD_EXPORT_MAX_NODES}）`,
      };
    }
  }

  if (raw.world !== null && !isPlainObject(raw.world)) {
    return { ok: false, error: '世界快照格式不正确' };
  }

  if (!Array.isArray(raw.settlingRecords)) {
    return { ok: false, error: '入籍记录格式不正确' };
  }

  if (!Array.isArray(raw.tables)) {
    return { ok: false, error: '恢复数据缺失（tables 不是数组）' };
  }
  let totalRows = 0;
  for (const item of raw.tables) {
    if (!isPlainObject(item) || typeof item.table !== 'string') {
      return { ok: false, error: '恢复数据格式不正确（缺少表名）' };
    }
    if (!(WORLD_TABLE_WHITELIST as readonly string[]).includes(item.table)) {
      return { ok: false, error: `包含不支持的恢复表：${item.table}` };
    }
    if (!Array.isArray(item.rows)) {
      return { ok: false, error: `恢复数据格式不正确（${item.table}.rows 不是数组）` };
    }
    totalRows += item.rows.length;
  }
  if (totalRows > WORLD_EXPORT_MAX_ROWS) {
    return {
      ok: false,
      error: `恢复数据量超出上限（${totalRows} 行 > ${WORLD_EXPORT_MAX_ROWS}）`,
    };
  }

  return { ok: true, bundle: raw as unknown as WorldExportBundle };
}
