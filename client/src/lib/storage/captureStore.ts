/**
 * 采集会话存储
 *
 * @ai-context: P2-14——segments 拆至独立表 windowCaptureSegments：addSegment
 * 由原来的整数组读改写（Dexie 不支持原子 push，O(n)+高频竞态）变为单行原子
 * 追加。getSegments 优先读独立表，空则回退旧会话内嵌 segments（向后兼容，
 * 无数据迁移）。
 */
import { db } from './database';
import type { WindowCapture, ExtractedSegment } from '@/types/models';

export const captureStore = {
  /**
   * 创建采集会话
   * 自动生成 id 和 startedAt
   */
  async createSession(
    capture: Omit<WindowCapture, 'id' | 'startedAt'>
  ): Promise<WindowCapture> {
    const record: WindowCapture = {
      ...capture,
      id: crypto.randomUUID(),
      startedAt: new Date(),
    };
    await db.windowCaptures.add(record);
    return record;
  },

  /**
   * 更新会话状态（部分字段）
   */
  async updateSession(
    id: string,
    updates: Partial<WindowCapture>
  ): Promise<void> {
    // 不允许修改主键
    const { id: _omit, ...rest } = updates;
    if (Object.keys(rest).length === 0) return;
    const count = await db.windowCaptures.update(id, rest);
    if (count === 0) {
      throw new Error(`[captureStore] Session not found: ${id}`);
    }
  },

  /**
   * 添加提取片段到会话（P2-14：写入独立表，原子追加，无读改写竞态）
   */
  async addSegment(
    sessionId: string,
    segment: ExtractedSegment
  ): Promise<void> {
    await db.windowCaptureSegments.add({ ...segment, sessionId });
  },

  /**
   * 获取会话列表
   * @param noteId 可选，按关联笔记过滤
   */
  async listSessions(noteId?: string): Promise<WindowCapture[]> {
    if (noteId) {
      return db.windowCaptures.where('noteId').equals(noteId).toArray();
    }
    return db.windowCaptures.toArray();
  },

  /**
   * 获取会话的所有片段（P2-14：独立表优先，空则回退旧会话内嵌 segments）
   */
  async getSegments(sessionId: string): Promise<ExtractedSegment[]> {
    const rows = await db.windowCaptureSegments.where('sessionId').equals(sessionId).toArray();
    if (rows.length > 0) return rows;
    const session = await db.windowCaptures.get(sessionId);
    return session?.segments ?? [];
  },

  /**
   * 删除会话（及其关联的所有片段：独立表 + 内嵌）
   */
  async deleteSession(id: string): Promise<void> {
    await db.windowCaptureSegments.where('sessionId').equals(id).delete();
    await db.windowCaptures.delete(id);
  },

  /**
   * 将会话关联到指定笔记
   */
  async linkToNote(sessionId: string, noteId: string): Promise<void> {
    const count = await db.windowCaptures.update(sessionId, { noteId });
    if (count === 0) {
      throw new Error(`[captureStore] Session not found: ${sessionId}`);
    }
  },
};
