/**
 * worldExport 单元测试 / Unit tests for the world export layer
 *
 * @ai-context: 覆盖阶段 D 验收——build→validate 往返一致、损坏/非对象
 * 拒绝、版本不符拒绝、节点超限（>5000）拒绝、表名白名单、总行数超限
 * 拒绝。BDD AAA 模式（Arrange/Act/Assert）。
 * @ai-context: Covers round-trip consistency, malformed input, version
 * mismatch, node-count overflow, whitelist enforcement and row overflow.
 */
import { describe, it, expect } from 'vitest';
import {
  buildWorldExport,
  validateWorldImport,
  WORLD_EXPORT_FORMAT_VERSION,
  WORLD_EXPORT_MAX_NODES,
  type WorldExportMeta,
} from './worldExport';

// ─── 测试工厂 ───────────────────────────────────────────────

function makeMeta(overrides: Partial<WorldExportMeta> = {}): WorldExportMeta {
  return {
    exportedAt: '2026-08-03T10:00:00.000Z',
    tables: [
      { table: 'notes', rows: [{ id: 'n1', title: '费曼技巧', content: '…' }] },
      { table: 'flashcards', rows: [{ id: 'c1', front: '什么是费曼技巧？', back: '…' }] },
    ],
    ...overrides,
  };
}

/** 合法导出包工厂（来自 buildWorldExport 或直接构造） */
function makeBundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: WORLD_EXPORT_FORMAT_VERSION,
    exportedAt: '2026-08-03T10:00:00.000Z',
    graph: { total: 1, nodes: [{ id: 'card:c1', concept: '费曼技巧', tier: '成长中' }], note: '图谱摘要' },
    world: { corals: { total: 3 }, discoveries: { count: 2 }, capturedAt: '2026-08-03T09:00:00.000Z' },
    settlingRecords: [{ id: 'r1', source: 'pdf', raw_name: 'book.pdf', concept_count: 3, settled_at: '2026-08-01T00:00:00.000Z' }],
    privacyNote: '本导出仅包含你的学习世界',
    tables: [
      { table: 'notes', rows: [{ id: 'n1', title: '费曼技巧' }] },
      { table: 'imports', rows: [{ id: 'r1', source: 'pdf', raw_name: 'book.pdf', concept_count: 3, settled_at: '2026-08-01T00:00:00.000Z' }] },
    ],
    ...overrides,
  };
}

// ─── buildWorldExport ───────────────────────────────────────

describe('buildWorldExport（组装世界之书）', () => {
  it('完整组装：字段逐一往返一致，formatVersion 固定为 1', () => {
    // Arrange
    const graph = { total: 2, nodes: [{ id: 'card:c1', concept: '费曼技巧' }] };
    const snapshot = { payload: JSON.stringify({ corals: { total: 3 }, discoveries: { count: 2 } }) };
    const records = [{ id: 'r1', source: 'pdf', raw_name: 'book.pdf', concept_count: 3, settled_at: '2026-08-01T00:00:00.000Z' }];
    const meta = makeMeta();

    // Act
    const bundle = buildWorldExport(graph, snapshot, records, meta);

    // Assert
    expect(bundle.formatVersion).toBe(WORLD_EXPORT_FORMAT_VERSION);
    expect(bundle.exportedAt).toBe(meta.exportedAt);
    expect(bundle.graph).toEqual(graph);
    expect(bundle.world).toEqual({ corals: { total: 3 }, discoveries: { count: 2 } });
    expect(bundle.settlingRecords).toEqual(records);
    expect(bundle.tables).toEqual(meta.tables);
    expect(bundle.privacyNote).toContain('不包含任何 AI 密钥');
  });

  it('无快照（null）→ world 字段为 null', () => {
    // Arrange & Act
    const bundle = buildWorldExport({ total: 0, nodes: [] }, null, [], makeMeta({ tables: [] }));

    // Assert
    expect(bundle.world).toBeNull();
  });

  it('快照 payload 损坏时按无快照处理且不抛错', () => {
    // Arrange
    const snapshot = { payload: '{broken json' };

    // Act
    const bundle = buildWorldExport({ total: 0, nodes: [] }, snapshot, [], makeMeta({ tables: [] }));

    // Assert
    expect(bundle.world).toBeNull();
  });
});

// ─── validateWorldImport ────────────────────────────────────

describe('validateWorldImport（恢复前校验）', () => {
  it('接受 buildWorldExport 产物（导出→校验往返一致）', () => {
    // Arrange
    const bundle = buildWorldExport(
      { total: 1, nodes: [{ id: 'card:c1', concept: '费曼技巧', tier: '成长中' }] },
      { payload: JSON.stringify({ corals: { total: 3 } }) },
      [{ id: 'r1', source: 'text', raw_name: '', concept_count: 1, settled_at: '2026-08-01T00:00:00.000Z' }],
      makeMeta(),
    );

    // Act
    const result = validateWorldImport(bundle);

    // Assert
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bundle.exportedAt).toBe(bundle.exportedAt);
      expect(result.bundle.graph).toEqual(bundle.graph);
      expect(result.bundle.world).toEqual(bundle.world);
      expect(result.bundle.settlingRecords).toEqual(bundle.settlingRecords);
      expect(result.bundle.tables).toEqual(bundle.tables);
    }
  });

  it.each([null, 'not-json', 42, ['array']])('拒绝非对象输入：%s', (raw) => {
    // Arrange & Act & Assert
    const result = validateWorldImport(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不是有效的世界导出文件');
  });

  it('拒绝版本不符（formatVersion=2）', () => {
    // Arrange
    const raw = makeBundle({ formatVersion: 2 });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('版本不符');
  });

  it('拒绝结构缺失（缺 graph）', () => {
    // Arrange
    const raw = makeBundle();
    delete raw.graph;

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('图谱数据缺失');
  });

  it('拒绝结构缺失（缺 tables 恢复层）', () => {
    // Arrange
    const raw = makeBundle();
    delete raw.tables;

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('恢复数据缺失');
  });

  it(`拒绝节点超限（${WORLD_EXPORT_MAX_NODES + 1} > ${WORLD_EXPORT_MAX_NODES}）`, () => {
    // Arrange
    const bigNodes = Array.from({ length: WORLD_EXPORT_MAX_NODES + 1 }, (_, i) => ({ id: `card:${i}` }));
    const raw = makeBundle({ graph: { total: bigNodes.length, nodes: bigNodes } });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('节点数超出上限');
  });

  it('拒绝表名不在白名单', () => {
    // Arrange
    const raw = makeBundle({ tables: [{ table: 'app_settings', rows: [{ id: '1', key: 'x', value: 'y' }] }] });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('不支持的恢复表');
  });

  it('拒绝总行数超限（100001 行 > 100000）', () => {
    // Arrange
    const rows = Array.from({ length: 100_001 }, (_, i) => ({ id: `r${i}` }));
    const raw = makeBundle({ tables: [{ table: 'notes', rows }] });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('恢复数据量超出上限');
  });

  it('拒绝 rows 含非对象行（防 Object.keys(null) 崩溃与空列 SQL）', () => {
    // Arrange
    const raw = makeBundle({ tables: [{ table: 'notes', rows: [{ id: 'n1' }, null, 'raw', 42] }] });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('含非对象行');
  });

  it('拒绝入籍记录超限（100001 条 > 100000）', () => {
    // Arrange
    const records = Array.from({ length: 100_001 }, (_, i) => ({ id: `r${i}` }));
    const raw = makeBundle({ settlingRecords: records });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('入籍记录超出上限');
  });

  it('接受空世界（零记录 + 空恢复层）：迁移前或清库后仍可恢复', () => {
    // Arrange
    const raw = makeBundle({ settlingRecords: [], tables: [] });

    // Act
    const result = validateWorldImport(raw);

    // Assert
    expect(result.ok).toBe(true);
  });
});
