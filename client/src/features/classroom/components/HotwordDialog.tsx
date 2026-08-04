/**
 * HotwordDialog — 课堂助手热词/替换词表管理对话框（P1-3）
 * Vocabulary management dialog: CRUD + enable toggle, grouped by course.
 *
 * @ai-context: 组装共享 Modal（Radix Dialog，参照批次二 ConfirmDialog 的组装
 * 方式）。词条存储走 hotwordStore（Dexie 本地优先）；按课程分组展示
 * （当前课程 / 全局 / 其他课程）。kind='replace' 词条在转写后处理生效
 * （hotwordApply），kind='boost' 为 ASR 热词增强预留（当前本地模型不支持，
 * 见 local-asr TODO）。courseId 即课程名，与 CourseMeta.courseName 对齐。
 * @ai-context: EN: local-first vocab CRUD; empty courseId = global terms.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { hotwordStore, type HotwordEntry, type HotwordKind } from '@/lib/storage/hotwordStore';

export interface HotwordDialogProps {
  open: boolean;
  /** 当前配置的课程名（作为"当前课程"分组的 courseId），可为空 */
  courseId?: string;
  onClose: () => void;
}

/** 表单草稿状态 */
interface DraftState {
  term: string;
  target: string;
  kind: HotwordKind;
  scope: 'global' | 'course';
  /** 编辑"其他课程"词条时保持其原课程绑定，避免被改挂到当前课程 */
  keepCourseId?: string;
}

const EMPTY_DRAFT: DraftState = { term: '', target: '', kind: 'replace', scope: 'course' };

const inputCls = 'w-full px-3 py-2 rounded-kb-lg text-b3 bg-bg-secondary border border-border/30 '
  + 'text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-500/60 transition-colors';
const ghostBtnCls = 'p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary '
  + 'active:scale-95 transition-all';

export function HotwordDialog({ open, courseId, onClose }: HotwordDialogProps) {
  const [entries, setEntries] = useState<HotwordEntry[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setEntries(await hotwordStore.listAll());
    } catch (err) {
      console.warn('[HotwordDialog] 词表加载失败:', err);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void reload();
      // 打开时重置表单：有当前课程则默认课程专属作用域，否则全局
      setDraft({ ...EMPTY_DRAFT, scope: courseId ? 'course' : 'global' });
      setEditingId(null);
    }
  }, [open, courseId, reload]);

  /** 按课程分组：当前课程 / 全局 / 其他课程（空组不渲染） */
  const groups = useMemo(() => {
    const current = courseId ? entries.filter((e) => e.courseId === courseId) : [];
    const global = entries.filter((e) => !e.courseId);
    const other = entries.filter((e) => e.courseId && e.courseId !== courseId);
    return [
      { label: courseId ? `当前课程 · ${courseId}` : '', items: current },
      { label: '全局词条（所有课堂生效）', items: global },
      { label: '其他课程', items: other },
    ].filter((g) => g.items.length > 0);
  }, [entries, courseId]);

  const resetDraft = () => {
    setDraft({ ...EMPTY_DRAFT, scope: courseId ? 'course' : 'global' });
    setEditingId(null);
  };

  /** 保存（新增或更新）：term 为空忽略 */
  const handleSave = async () => {
    const term = draft.term.trim();
    if (!term) return;
    // 课程归属：编辑其他课程词条时保持原绑定；否则按作用域选择
    const entryCourseId = draft.keepCourseId
      ?? (draft.scope === 'course' && courseId ? courseId : undefined);
    const target = draft.kind === 'replace' ? draft.target.trim() : undefined;
    try {
      if (editingId) {
        await hotwordStore.update(editingId, { term, target, kind: draft.kind, courseId: entryCourseId });
      } else {
        await hotwordStore.add({ term, target, kind: draft.kind, courseId: entryCourseId, enabled: true });
      }
      resetDraft();
      await reload();
    } catch (err) {
      console.warn('[HotwordDialog] 保存词条失败:', err);
    }
  };

  const handleEdit = (entry: HotwordEntry) => {
    setEditingId(entry.id);
    const isForeignCourse = !!entry.courseId && entry.courseId !== courseId;
    setDraft({
      term: entry.term,
      target: entry.target ?? '',
      kind: entry.kind,
      scope: entry.courseId ? 'course' : 'global',
      keepCourseId: isForeignCourse ? entry.courseId : undefined,
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await hotwordStore.remove(id);
      if (editingId === id) resetDraft();
      await reload();
    } catch (err) {
      console.warn('[HotwordDialog] 删除词条失败:', err);
    }
  };

  const handleToggle = async (entry: HotwordEntry) => {
    try {
      await hotwordStore.update(entry.id, { enabled: !entry.enabled });
      await reload();
    } catch (err) {
      console.warn('[HotwordDialog] 切换启用状态失败:', err);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="热词 / 替换词表"
      description="替换词条自动纠正课堂转写错误；热词为语音增强预留。原始转写始终保留可回溯。"
      size="lg"
      footer={
        <button onClick={onClose}
          className="px-4 py-2 rounded-kb-lg text-b3 font-semibold text-white bg-brand-600 hover:bg-brand-700 active:scale-[0.98] transition-all">
          完成
        </button>
      }
    >
      <div className="space-y-4">
        {/* ── 新增 / 编辑表单 ── */}
        <div className="p-3 rounded-kb-lg bg-bg-secondary/60 border border-border/20 space-y-2.5">
          <div className="flex items-center gap-2">
            <select value={draft.kind}
              onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value as HotwordKind }))}
              className={`${inputCls} w-28 flex-shrink-0`}>
              <option value="replace">替换纠错</option>
              <option value="boost">热词增强</option>
            </select>
            <input value={draft.term} placeholder={draft.kind === 'replace' ? '错误转写形态，如：机气' : '需增强的术语，如：反向传播'}
              onChange={(e) => setDraft((d) => ({ ...d, term: e.target.value }))} className={inputCls} />
          </div>
          {/* 大小写录入提示：替换匹配刻意不做大小写宽容（保真优先），
              词条必须与转写实际形态一致才能命中 */}
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            英文词条请按转写实际大小写录入（匹配区分大小写，如 GPT 与 gpt 不互通）。
          </p>
          {draft.kind === 'replace' && (
            <input value={draft.target} placeholder="替换为（留空 = 删除误词），如：机器"
              onChange={(e) => setDraft((d) => ({ ...d, target: e.target.value }))} className={inputCls} />
          )}
          <div className="flex items-center gap-2">
            <select value={draft.scope} disabled={!courseId || !!draft.keepCourseId}
              onChange={(e) => setDraft((d) => ({ ...d, scope: e.target.value as 'global' | 'course' }))}
              className={`${inputCls} w-44 flex-shrink-0`}>
              {courseId && !draft.keepCourseId && <option value="course">仅当前课程</option>}
              {draft.keepCourseId && <option value="course">仅 {draft.keepCourseId}</option>}
              <option value="global">全局（所有课堂）</option>
            </select>
            <div className="flex-1" />
            {editingId && (
              <button onClick={resetDraft}
                className="px-3 py-1.5 rounded-kb-lg text-b3 text-text-secondary hover:text-text-primary transition-colors">
                取消编辑
              </button>
            )}
            <button onClick={() => void handleSave()} disabled={!draft.term.trim()}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-kb-lg text-b3 font-semibold transition-all active:scale-[0.98] ${
                draft.term.trim()
                  ? 'bg-brand-600 text-white hover:bg-brand-700'
                  : 'bg-bg-secondary text-text-tertiary cursor-not-allowed'
              }`}>
              {editingId ? <Pencil className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingId ? '保存修改' : '添加词条'}
            </button>
          </div>
        </div>

        {/* ── 词条列表（按课程分组） ── */}
        <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
          {groups.length === 0 && (
            <p className="py-6 text-center text-b3 text-text-tertiary">
              暂无词条。添加替换词条可纠正常见转写错误（如学科名词、教师口头禅）。
            </p>
          )}
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[11px] font-medium text-text-tertiary tracking-wide">{group.label}</p>
              <ul className="space-y-1">
                {group.items.map((entry) => (
                  <li key={entry.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-kb-lg bg-bg-secondary/40 border border-border/15">
                    {/* 启用开关 */}
                    <button onClick={() => void handleToggle(entry)} role="switch" aria-checked={entry.enabled}
                      className={`relative w-8 h-[18px] flex-shrink-0 rounded-full transition-colors ${
                        entry.enabled ? 'bg-brand-600' : 'bg-bg-tertiary'
                      }`}>
                      <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${
                        entry.enabled ? 'left-[16px]' : 'left-0.5'
                      }`} />
                    </button>
                    {/* 类型徽标 */}
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      entry.kind === 'replace'
                        ? 'bg-brand-50 text-brand-600'
                        : 'bg-bg-tertiary text-text-secondary'
                    }`}>
                      {entry.kind === 'replace' ? '替换' : '热词'}
                    </span>
                    {/* 词条内容 */}
                    <span className={`flex-1 min-w-0 truncate text-b3 ${entry.enabled ? 'text-text-primary' : 'text-text-tertiary line-through'}`}>
                      {entry.term}
                      {entry.kind === 'replace' && <span className="text-text-tertiary"> → {entry.target || '（删除）'}</span>}
                      {entry.courseId && group.label === '其他课程' && (
                        <span className="ml-1.5 text-[11px] text-text-tertiary">[{entry.courseId}]</span>
                      )}
                    </span>
                    <button onClick={() => handleEdit(entry)} title="编辑" className={ghostBtnCls}>
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => void handleDelete(entry.id)} title="删除"
                      className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-semantic-error hover:bg-semantic-error/10 active:scale-95 transition-all">
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default HotwordDialog;
