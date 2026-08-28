/**
 * draftStore — 笔记编辑草稿 localStorage 层（v0.14 子项目 A）。
 *
 * @ai-context: 自动保存双计时器只能防"正常退出丢失"，防不了崩溃/强杀——草稿层在
 *              doc 变化后节流写入 localStorage，崩溃后重开可恢复零丢失（spec §4.4）。
 *              与版本链正交：恢复后走正常保存，不污染版本历史。损坏 JSON 丢弃降级
 *              不阻塞编辑。storage 参数注入便于单测隔离（spec §6.1）。
 */

/** 草稿载荷：标题 + 正文 + 本地写入时间戳（ms） */
export interface Draft {
  title: string;
  content: string;
  updatedAt: number;
}

const KEY_PREFIX = "note-draft:";

export function draftKey(noteId: number): string {
  return `${KEY_PREFIX}${noteId}`;
}

/** 读草稿：无草稿 / 结构不符 / JSON 损坏 → null（损坏静默降级，不阻塞编辑） */
export function readDraft(noteId: number, storage: Storage = localStorage): Draft | null {
  try {
    const raw = storage.getItem(draftKey(noteId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.content !== "string" ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    return parsed as Draft;
  } catch {
    return null;
  }
}

/** 写草稿：QuotaExceeded 等异常静默失败——草稿是增强层，失败不阻塞编辑 */
export function writeDraft(noteId: number, title: string, content: string, storage: Storage = localStorage): void {
  try {
    const draft: Draft = { title, content, updatedAt: Date.now() };
    storage.setItem(draftKey(noteId), JSON.stringify(draft));
  } catch {
    /* 静默失败（配额满/隐私模式等） */
  }
}

/** 清草稿：保存成功 / 正常退出编辑时调用 */
export function clearDraft(noteId: number, storage: Storage = localStorage): void {
  try {
    storage.removeItem(draftKey(noteId));
  } catch {
    /* 同写：增强层失败不阻塞 */
  }
}
