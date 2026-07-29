/**
 * 增量笔记生成器
 * 将融合后的内容自动格式化为 TipTap 节点并插入编辑器
 *
 * 核心能力：
 * 1. FusionSegment → TipTap JSON 节点转换（委托 tipTapNodeBuilder）
 * 2. 基于文本指纹的去重（30s 滑动窗口）
 * 3. 自动插入 / 手动暂存双模式
 *
 * @ai-context: 2026-07 拆分——TipTap 节点构建与 LaTeX 提取在
 * tipTapNodeBuilder；本类保留去重/暂存/插入状态管理，旧导入路径经
 * 文末 re-export 全兼容。
 * @ai-context: 指纹 = 前 50 字符 + '::' + 总长度，非哈希——同前缀同长度
 * 的不同文本会误判重复（30s 窗口内），为性能取舍的已知局限。
 */

import type { FusionSegment } from './crossFusion';
import { segmentToTipTapNodes, type TipTapNode } from './tipTapNodeBuilder';

// ================================================================
// 类型定义
// ================================================================

/** NoteGenerator 配置 */
export interface NoteGeneratorConfig {
  /** 是否自动插入（false 时仅暂存待手动插入） */
  autoInsert: boolean;
  /** 最大缓存片段数，默认 100 */
  maxSegments: number;
  /** 去重时间窗口（ms），默认 30000 */
  deduplicateWindow: number;
}

/** 已插入的片段记录 */
export interface InsertedSegment extends FusionSegment {
  /** 插入时间戳 */
  insertedAt: number;
  /** TipTap 节点 ID（可选） */
  nodeId?: string;
}

/** 插入命令，供编辑器执行 */
export interface NoteInsertCommand {
  /** TipTap JSON 内容节点 */
  content: TipTapNode[];
  /** 插入位置 */
  position: 'end';
}

/** addSegment 返回结果 */
export interface AddSegmentResult {
  shouldInsert: boolean;
  reason: string;
}

// ================================================================
// 常量
// ================================================================

const DEFAULT_CONFIG: NoteGeneratorConfig = {
  autoInsert: true,
  maxSegments: 100,
  deduplicateWindow: 30_000,
};

/** 文本指纹取前 N 字符 */
const FINGERPRINT_LENGTH = 50;

// ================================================================
// NoteGenerator
// ================================================================

export class NoteGenerator {
  private config: NoteGeneratorConfig;
  private pendingSegments: FusionSegment[] = [];
  private insertedSegments: InsertedSegment[] = [];
  /** 已插入文本指纹 → 插入时间戳 */
  private insertedFingerprints: Map<string, number> = new Map();

  constructor(config: Partial<NoteGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ================================================================
  // 公共 API
  // ================================================================

  /**
   * 接收融合片段，决定是否自动插入
   * 供 captureEventBus 'fusion:segment_complete' 事件消费者调用
   */
  addSegment(segment: FusionSegment): AddSegmentResult {
    // 去重检查
    if (this.isDuplicate(segment.mergedText)) {
      return { shouldInsert: false, reason: 'duplicate' };
    }

    // 手动模式 → 暂存
    if (!this.config.autoInsert) {
      this.pendingSegments.push(segment);
      this.trimPending();
      return { shouldInsert: false, reason: 'pending' };
    }

    // 自动模式 → 标记插入
    return { shouldInsert: true, reason: 'auto' };
  }

  /**
   * 将 FusionSegment 转换为 TipTap JSON 节点数组（委托 tipTapNodeBuilder）
   */
  segmentToTipTapNodes(segment: FusionSegment): TipTapNode[] {
    return segmentToTipTapNodes(segment);
  }

  /**
   * 生成插入命令（供 TipTap editor 执行）
   */
  generateInsertCommand(segment: FusionSegment): NoteInsertCommand {
    return {
      content: segmentToTipTapNodes(segment),
      position: 'end',
    };
  }

  /**
   * 确认已插入（编辑器执行插入后回调）
   */
  markInserted(segment: FusionSegment, nodeId?: string): void {
    const fingerprint = this.textFingerprint(segment.mergedText);
    this.insertedFingerprints.set(fingerprint, Date.now());
    this.insertedSegments.push({
      ...segment,
      insertedAt: Date.now(),
      nodeId,
    });

    // 限制已插入记录数
    if (this.insertedSegments.length > this.config.maxSegments) {
      this.insertedSegments.shift();
    }

    // 如果该片段在 pending 中，移除
    this.pendingSegments = this.pendingSegments.filter(s => s.id !== segment.id);
  }

  /**
   * 获取待插入片段（手动模式下使用）
   */
  getPendingSegments(): FusionSegment[] {
    return [...this.pendingSegments];
  }

  /**
   * 获取已插入片段
   */
  getInsertedSegments(): InsertedSegment[] {
    return [...this.insertedSegments];
  }

  /**
   * 清空待插入队列
   */
  clearPending(): void {
    this.pendingSegments = [];
  }

  /**
   * 重置所有状态
   */
  reset(): void {
    this.pendingSegments = [];
    this.insertedSegments = [];
    this.insertedFingerprints.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(patch: Partial<NoteGeneratorConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * 获取当前配置（只读快照）
   */
  getConfig(): NoteGeneratorConfig {
    return { ...this.config };
  }

  // ================================================================
  // 私有方法
  // ================================================================

  /**
   * 去重检查：文本指纹是否已存在于滑动窗口内
   */
  private isDuplicate(text: string): boolean {
    const fp = this.textFingerprint(text);
    const insertedAt = this.insertedFingerprints.get(fp);

    if (insertedAt === undefined) return false;

    const elapsed = Date.now() - insertedAt;
    if (elapsed < this.config.deduplicateWindow) {
      return true;
    }

    // 超过窗口，清除旧指纹
    this.insertedFingerprints.delete(fp);
    return false;
  }

  /**
   * 生成文本指纹（前 FINGERPRINT_LENGTH 字符 + 长度）
   */
  private textFingerprint(text: string): string {
    const prefix = text.slice(0, FINGERPRINT_LENGTH);
    return `${prefix}::${text.length}`;
  }

  /**
   * 裁剪待插入队列，保持在 maxSegments 以内
   */
  private trimPending(): void {
    while (this.pendingSegments.length > this.config.maxSegments) {
      this.pendingSegments.shift();
    }
  }
}

// ================================================================
// 向后兼容 re-export
// ================================================================

export { formatTimestamp, extractLatexFormulas } from './tipTapNodeBuilder';
export type { TipTapNode } from './tipTapNodeBuilder';
