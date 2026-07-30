/**
 * 采集会话存储
 *
 * @ai-context: segments 以整数组覆盖方式追加（Dexie 不支持数组原子
 * push），高频调用 addSegment 存在读改写竞态，调用方需串行化。
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
   * 添加提取片段到会话
   * 将 segment 追加到 segments 数组
   */
  async addSegment(
    sessionId: string,
    segment: ExtractedSegment
  ): Promise<void> {
    const session = await db.windowCaptures.get(sessionId);
    if (!session) {
      throw new Error(`[captureStore] Session not found: ${sessionId}`);
    }
    await db.windowCaptures.update(sessionId, {
      segments: [...session.segments, segment],
    });
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
   * 获取会话的所有片段
   */
  async getSegments(sessionId: string): Promise<ExtractedSegment[]> {
    const session = await db.windowCaptures.get(sessionId);
    return session?.segments ?? [];
  },

  /**
   * 删除会话（及其关联的所有片段）
   */
  async deleteSession(id: string): Promise<void> {
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
