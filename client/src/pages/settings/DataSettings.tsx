/**
 * 数据与存储设置页（组合入口）
 *
 * @ai-context: 2026-07 拆分——原 639 行单文件按功能区块拆为 4 个子组件：
 * StoragePathSection（存储信息/路径切换）、ImportExportSection（导入导出）、
 * EncryptedBackupSection（加密备份/恢复）、ClearDataSection（清除数据）。
 * 本文件仅负责布局组合，无业务逻辑。
 */
import { Card } from '@/components/ui';
import { StoragePathSection } from './StoragePathSection';
import { ImportExportSection } from './ImportExportSection';
import { EncryptedBackupSection } from './EncryptedBackupSection';
import { ClearDataSection } from './ClearDataSection';
import { MemoryServerSection } from './MemoryServerSection';
import { WorldSovereigntySection } from './WorldSovereigntySection';

export default function DataSettings() {
  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <h2 className="text-b1 font-semibold text-text-primary">数据与存储</h2>

      <StoragePathSection />
      <MemoryServerSection />
      <ImportExportSection />
      <WorldSovereigntySection />
      <EncryptedBackupSection />
      <ClearDataSection />
    </Card>
  );
}
