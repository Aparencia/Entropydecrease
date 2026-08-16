/**
 * 未保存更改导航拦截确认框（M19）
 * Unsaved-changes navigation blocker dialog (M19)
 *
 * @ai-context: 从 NoteEditPage 拆出。导航被 useBlocker 拦截时弹确认框，不再
 * 静默卡住页面：保存并离开（走页面 handleSaveAndLeave 落盘管线）/ 放弃更改
 * （proceed）/ 取消（reset）。保存失败态文案与按钮标签区分展示。纯展示层，
 * blocker 状态与保存动作由页面注入。
 * @ai-context: Extracted from NoteEditPage. When navigation is intercepted by
 * useBlocker, shows a confirm dialog instead of silently blocking: save &
 * leave (page handleSaveAndLeave persists first) / discard changes (proceed) /
 * cancel (reset). Failed-save wording and button labels differ. Pure
 * presentational; the blocker state and save action are injected by the page.
 */
import type { Blocker } from 'react-router-dom';
import { Button } from '@/components/ui';
import type { SaveStatus } from './NoteEditHeader';

interface NoteEditBlockerDialogProps {
  blocker: Blocker;
  saveStatus: SaveStatus;
  onSaveAndLeave: () => void;
}

export function NoteEditBlockerDialog({ blocker, saveStatus, onSaveAndLeave }: NoteEditBlockerDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-dialog-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-bg-secondary p-5 shadow-xl">
        <h3 id="unsaved-dialog-title" className="text-b1 font-semibold text-text-primary mb-2">
          {saveStatus === 'failed' ? '保存失败' : '有未保存的更改'}
        </h3>
        <p className="text-c1 text-text-secondary mb-4">
          {saveStatus === 'failed'
            ? '上次保存失败，离开将丢失未保存的内容'
            : '离开前要保存这次编辑吗？'}
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="primary" size="sm" onClick={onSaveAndLeave}>
            {saveStatus === 'failed' ? '仍要离开' : '保存并离开'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { if (blocker.state === 'blocked') blocker.proceed(); }}>
            放弃更改
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { if (blocker.state === 'blocked') blocker.reset(); }}>
            取消
          </Button>
        </div>
      </div>
    </div>
  );
}
