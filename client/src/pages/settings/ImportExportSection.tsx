/**
 * 数据导入/导出区块
 *
 * @ai-context: 从 DataSettings 拆出。导出走 exportAllData→downloadExport；
 * 导入成功后 800ms 延迟 reload 加载新数据。导入/导出音效经 soundPlayer。
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { Download, Upload } from 'lucide-react';
import { exportAllData, downloadExport, importData, readFileAsText } from '@/lib/storage';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

export function ImportExportSection() {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      const json = await exportAllData();
      downloadExport(json);
      soundPlayer.play('data_export');
      toast({ type: 'success', message: '数据导出成功', silent: true });
    } catch {
      toast({ type: 'error', message: '导出失败，请重试' });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input 以便同一文件可以再次选择
    e.target.value = '';

    try {
      setImporting(true);
      const text = await readFileAsText(file);
      const result = await importData(text);
      if (result.success) {
        soundPlayer.play('data_import');
        toast({ type: 'success', message: result.message, silent: true });
        // 刷新页面以加载新数据
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast({ type: 'error', message: result.message });
      }
    } catch {
      toast({ type: 'error', message: '导入失败，请检查文件格式' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        variant="secondary"
        size="md"
        icon={<Download className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        className="w-full"
        onClick={handleExport}
        disabled={exporting}
      >
        {exporting ? '导出中…' : '导出数据'}
      </Button>
      <Button
        variant="secondary"
        size="md"
        icon={<Upload className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
      >
        {importing ? '导入中…' : '导入数据'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
