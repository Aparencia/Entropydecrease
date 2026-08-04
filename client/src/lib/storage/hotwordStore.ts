/**
 * 热词/替换词表存储（课堂助手 P1-3）
 * Hotword / replace-term storage for the classroom assistant.
 *
 * @ai-context: 本地优先词表（Dexie hotwords 表，database.ts v24 新增）。
 * kind='boost' 为热词增强词条（预留送 ASR 引擎；当前本地 SenseVoice /
 * Paraformer 模型不支持 hotwords，见 electron/ai/local-asr TODO），
 * kind='replace' 为替换纠错词条（转写后处理，见 lib/capture/hotwordApply）。
 * courseId 绑定课程名（与 CourseMeta.courseName 对齐），为空 = 全局词条；
 * 会话启动时由 features/classroom/utils/hotwordRuntime 加载"课程专属 + 全局"。
 * @ai-context: EN: local-first vocabulary CRUD; courseId empty means global.
 * Not synced to cloud. Original transcripts are never rewritten by this store.
 */
import { db } from './database';

/** 词条类型：boost=热词增强（送 ASR 引擎），replace=替换纠错（转写后处理） */
export type HotwordKind = 'boost' | 'replace';

/** 词表条目 */
export interface HotwordEntry {
  id: string;
  /** 源词：boost=需增强的术语；replace=需匹配的错误转写形态 */
  term: string;
  /** 替换目标（仅 replace 有效；空字符串 = 删除误词） */
  target?: string;
  kind: HotwordKind;
  /** 绑定课程名；空 = 全局词条（任意会话生效） */
  courseId?: string;
  /** 启用开关（停用不删除，便于临时关闭） */
  enabled: boolean;
  createdAt: number;
}

/** 新增词条输入（id/createdAt 自动生成） */
export type HotwordInput = Omit<HotwordEntry, 'id' | 'createdAt'>;

/** 按课程过滤：全局词条（无 courseId）+ 指定课程词条 */
function filterForCourse(all: HotwordEntry[], courseId?: string): HotwordEntry[] {
  return all.filter((w) => !w.courseId || (courseId != null && w.courseId === courseId));
}

export const hotwordStore = {
  /** 新增词条，返回含自动生成 id 的完整记录 */
  async add(input: HotwordInput): Promise<HotwordEntry> {
    const record: HotwordEntry = { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
    await db.hotwords.add(record);
    return record;
  },

  /** 更新词条（部分字段；主键不可改） */
  async update(id: string, updates: Partial<HotwordInput>): Promise<void> {
    if (Object.keys(updates).length === 0) return;
    await db.hotwords.update(id, updates);
  },

  /** 删除词条 */
  async remove(id: string): Promise<void> {
    await db.hotwords.delete(id);
  },

  /** 全量列表（管理 UI 分组展示用） */
  async listAll(): Promise<HotwordEntry[]> {
    return db.hotwords.toArray();
  },

  /** 按课程过滤查询：全局词条 + 该课程词条（无课程参数时仅全局） */
  async listForCourse(courseId?: string): Promise<HotwordEntry[]> {
    const all = await db.hotwords.toArray();
    return filterForCourse(all, courseId);
  },

  /** 会话生效的替换规则源数据：启用 + replace + 非空 term */
  async listActiveReplaces(courseId?: string): Promise<HotwordEntry[]> {
    const entries = filterForCourse(await db.hotwords.toArray(), courseId);
    return entries.filter((w) => w.enabled && w.kind === 'replace' && w.term.length > 0);
  },

  /** 会话生效的热词增强词列表：启用 + boost + 非空 term */
  async listActiveBoosts(courseId?: string): Promise<string[]> {
    const entries = filterForCourse(await db.hotwords.toArray(), courseId);
    return entries
      .filter((w) => w.enabled && w.kind === 'boost' && w.term.length > 0)
      .map((w) => w.term);
  },
};
