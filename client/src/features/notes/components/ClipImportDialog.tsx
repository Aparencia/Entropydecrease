/**
 * @ai-context: 剪藏弹窗：URL 网页剪藏 + PDF 导入为笔记。
 * 自 NotesPage.tsx 原样拆出；URL 输入、剪藏状态与三个动作（URL 剪藏/PDF 导入/关闭）经 props 注入。
 * @ai-context: Clip-import dialog (web URL + PDF into notes) extracted verbatim
 * from NotesPage.tsx. URL input, loading state and actions are injected via props.
 */
import { Modal, Button } from '@/components/ui';
import { Input } from '@/components/ui/Input';

interface ClipImportDialogProps {
  /** 是否打开 */
  open: boolean;
  /** 网页 URL 输入值 */
  clipUrl: string;
  /** 剪藏进行中（禁用按钮） */
  clipLoading: boolean;
  /** URL 输入变化 */
  onUrlChange: (v: string) => void;
  /** 剪藏当前 URL */
  onClipUrl: () => void;
  /** 选择 PDF 文件导入 */
  onClipPdf: () => void;
  /** 关闭弹窗 */
  onClose: () => void;
}

export default function ClipImportDialog({
  open,
  clipUrl,
  clipLoading,
  onUrlChange,
  onClipUrl,
  onClipPdf,
  onClose,
}: ClipImportDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="剪藏"
      description="将网页内容或 PDF 文件导入为笔记"
      size="sm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-c1 text-text-tertiary">网页 URL</label>
          <div className="flex gap-2">
            <Input
              placeholder="输入网页链接…"
              value={clipUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onClipUrl(); }}
              className="flex-1"
            />
            <Button size="sm" onClick={onClipUrl} disabled={clipLoading || !clipUrl.trim()}>
              {clipLoading ? '剪藏中…' : '剪藏'}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 h-px bg-border/30" />
          <span className="text-c1 text-text-tertiary">或</span>
          <span className="flex-1 h-px bg-border/30" />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { onClipPdf(); onClose(); }}
          disabled={clipLoading}
          className="w-full"
        >
          选择 PDF 文件导入
        </Button>
      </div>
    </Modal>
  );
}
