/**
 * 世界主权区块（阶段 D：世界之书导出/恢复）
 * World sovereignty section (export / restore your world)
 *
 * @ai-context: 宪法「数据归用户」的实体化——世界之书（图谱摘要 +
 * 世界快照 + 入籍记录 + 十张学习表）导出为单文件 JSON，恢复走主进程
 * sovereigntyHandlers：校验（版本/结构/上限/表白名单）先行，通过后
 * 整体事务幂等导入。导出包不含任何 AI 密钥/网关配置/账号凭据
 * （privacyNote 固定文案，宪法 P1 内层防御）。对话框由主进程弹出，
 * 渲染进程只触发与展示结果；恢复成功后 800ms reload 让图谱/搜索立即
 * 刷新。取消对话框时静默，不打扰用户。
 *
 * @ai-context: Export bundles the knowledge graph, world snapshot,
 * settling records and ten learning tables into one JSON file with no
 * secrets; restore validates first, then imports atomically.
 */
import { useState } from 'react';
import { BookOpen, Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { isElectron } from '@/lib/utils/platform';

/** 导出结果（主进程 sovereignty:export-world 返回形状） */
interface ExportResult {
  success: boolean;
  canceled?: boolean;
  path?: string | null;
  error?: string;
}

/** 恢复结果（主进程 sovereignty:import-world 返回形状） */
interface ImportResult {
  success: boolean;
  canceled?: boolean;
  rowsImported?: number;
  error?: string;
}

export function WorldSovereigntySection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  /** 导出我的世界：主进程弹保存框 → 写入 JSON → 音效 + 成功提示 */
  const handleExport = async () => {
    if (!window.electronAPI) return;
    try {
      setExporting(true);
      const res = (await window.electronAPI.invoke('sovereignty:export-world')) as ExportResult;
      if (!res) return;
      if (res.canceled) return; // 用户取消保存框：静默
      if (res.success) {
        soundPlayer.play('data_export');
        toast({
          type: 'success',
          message: res.path ? `世界之书已导出：${res.path}` : '世界之书已导出',
          silent: true,
        });
      } else {
        toast({ type: 'error', message: res.error ?? '世界导出失败，请重试' });
      }
    } catch {
      toast({ type: 'error', message: '世界导出失败：IPC 调用异常' });
    } finally {
      setExporting(false);
    }
  };

  /** 恢复世界：主进程弹选择框 → 校验 + 事务导入 → 成功则刷新 */
  const handleImport = async () => {
    if (!window.electronAPI) return;
    try {
      setImporting(true);
      const res = (await window.electronAPI.invoke('sovereignty:import-world')) as ImportResult;
      if (!res) return;
      if (res.canceled) return; // 用户取消选择框：静默
      if (res.success) {
        soundPlayer.play('data_import');
        toast({
          type: 'success',
          message: `世界已恢复（${res.rowsImported ?? 0} 行）——即将重新加载`,
          silent: true,
        });
        // 刷新页面以加载恢复后的图谱/搜索/快照
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast({ type: 'error', message: res.error ?? '世界恢复失败，请检查文件' });
      }
    } catch {
      toast({ type: 'error', message: '世界恢复失败：IPC 调用异常' });
    } finally {
      setImporting(false);
    }
  };

  if (!isElectron()) return null;

  return (
    <div className="rounded-kb-lg border border-border/50 bg-bg-secondary/30 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-focus" strokeWidth={1.5} />
        <span className="text-b2 font-medium text-text-primary">我的世界（世界之书）</span>
      </div>

      {/* 第一叙事：数据归用户，带走与归来（宪法 P1 内层防御） */}
      <p className="text-b3 text-text-secondary leading-relaxed">
        你的学习世界——图谱、世界快照与入籍记录——<b>归你所有</b>。导出为一份
        本地 JSON 文件，随时带走；恢复时它原样归来。导出包<b>不包含</b>任何
        AI 密钥、网关配置或账户凭据。
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          size="md"
          icon={<Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? '导出中…' : '导出我的世界'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          icon={<Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          className="w-full"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? '恢复中…' : '恢复世界'}
        </Button>
      </div>
    </div>
  );
}
