/**
 * 深潜设置页 — 预设管理区块
 *
 * @ai-context: 从 PomodoroSettingsPage 拆分。包含预设列表（编辑/删除/排序）
 * 与 PresetEditor 弹窗（弹窗状态为本区块局部状态）。
 */
import { useState } from 'react';
import { Layers, Plus, Pencil, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button, Card, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Tip } from '@/components/ui/Tip';
import PresetEditor from '../PresetEditor';
import { SettingsBlock } from './shared';
import type { PomodoroPreset } from '@/types/models';

interface PresetManagerProps {
  presets: PomodoroPreset[];
  canCreate: boolean;
  onDelete: (id: string, name: string) => Promise<void>;
  onMove: (id: string, dir: -1 | 1) => void;
  onSavePreset: (data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>, editing: PomodoroPreset | null) => Promise<void>;
}

export function PresetManager({ presets, canCreate, onDelete, onMove, onSavePreset }: PresetManagerProps) {
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PomodoroPreset | null>(null);

  const handleSave = async (data: Omit<PomodoroPreset, 'id' | 'sortOrder' | 'createdAt' | 'builtin'>) => {
    try {
      await onSavePreset(data, editingPreset);
      toast({ type: 'success', message: editingPreset
        ? `预设「${data.name}」已更新`
        : `预设「${data.name}」已创建` });
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : '保存失败' });
    }
  };

  return (
    <SettingsBlock className="mb-kb-md">
      <Card variant="default" padding="lg">
        <div className="flex items-center justify-between mb-kb-md">
          <div className="flex items-center gap-2">
            <Layers className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            <h2 className="text-h3 font-medium text-text-primary">预设管理</h2>
          </div>
          {canCreate && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => { setEditingPreset(null); setEditorOpen(true); }}
            >
              新建
            </Button>
          )}
        </div>
        <p className="text-c1 text-text-tertiary mb-kb-md">
          每个预设拥有独立的节律参数，循环标记数量随预设变化。最多 6 个。
        </p>
        <div className="space-y-2">
          {presets.map((preset, index) => (
            <div
              key={preset.id}
              className="flex items-center justify-between p-3 rounded-kb-md bg-bg-secondary/40 border border-border/20"
            >
              <div className="flex-1 min-w-0">
                <p className="text-b2 font-medium text-text-primary">
                  {preset.name}
                  {preset.builtin && <span className="ml-2 text-c1 text-text-tertiary">(内置)</span>}
                </p>
                <p className="text-c1 text-text-tertiary mt-0.5">
                  {preset.workDuration}min · 短休{preset.shortBreakDuration}min
                  {preset.longBreakInterval > 0 ? ` · 每${preset.longBreakInterval}个长休` : ' · 无长休'}
                  {preset.silent && ' · 静默'}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Tip text="上移">
                <button
                  onClick={() => onMove(preset.id, -1)}
                  disabled={index === 0}
                  className="p-1.5 rounded-md hover:bg-bg-tertiary text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                </Tip>
                <Tip text="下移">
                <button
                  onClick={() => onMove(preset.id, 1)}
                  disabled={index === presets.length - 1}
                  className="p-1.5 rounded-md hover:bg-bg-tertiary text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                </Tip>
                <Tip text="编辑预设">
                <button
                  onClick={() => { setEditingPreset(preset); setEditorOpen(true); }}
                  className="p-1.5 rounded-md hover:bg-bg-tertiary text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                </Tip>
                <Tip text={preset.builtin ? '内置预设不可删除' : '删除预设'}>
                <button
                  onClick={() => !preset.builtin && onDelete(preset.id, preset.name)}
                  disabled={preset.builtin}
                  className={cn(
                    'p-1.5 rounded-md transition-colors',
                    preset.builtin
                      ? 'text-text-tertiary/30 cursor-not-allowed'
                      : 'hover:bg-semantic-error/10 text-text-tertiary hover:text-semantic-error',
                  )}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                </Tip>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <PresetEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        initial={editingPreset}
        onSave={handleSave}
      />
    </SettingsBlock>
  );
}
