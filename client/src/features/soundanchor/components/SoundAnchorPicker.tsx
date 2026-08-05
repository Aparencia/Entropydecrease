/**
 * 声音锚点选择器 — 为概念绑定声音
 *
 * @ai-context: 3.11 声音锚点。弹窗内选择绑定场景（学习/复习/考试）与声音，
 * 网格试听选中态 + 独立试听按钮（避免嵌套 button）；确认后写入
 * soundAnchorStore 并 toast 反馈。
 */
import { useState } from 'react';
import { Volume2, Music2, Check, Play, Square } from 'lucide-react';
import { Modal, Button, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BIND_MODE_LABELS, type BindMode, type SoundType } from '../types';
import { SOUND_OPTIONS, SOUND_TYPE_LABELS, soundAssetUrl } from '../lib/soundOptions';
import { useSoundPreview } from '../lib/useSoundPreview';
import { addSoundAnchor, findAnchorsByConcept } from '../lib/soundAnchorStore';

interface SoundAnchorPickerProps {
  open: boolean;
  conceptId: string;
  conceptTitle: string;
  onClose: () => void;
  onBound?: () => void;
}

export function SoundAnchorPicker({ open, conceptId, conceptTitle, onClose, onBound }: SoundAnchorPickerProps) {
  const { toast } = useToast();
  const { playingName, toggle } = useSoundPreview();
  const [bindMode, setBindMode] = useState<BindMode>('learn');
  const [selected, setSelected] = useState<string | null>(null);

  const existing = findAnchorsByConcept(conceptId);
  const selectedType: SoundType = SOUND_OPTIONS.find((o) => o.fileName === selected)?.type ?? 'ambient';

  const handleConfirm = () => {
    if (!selected) {
      toast({ type: 'warning', message: '请先选择一个声音' });
      return;
    }
    const anchor = addSoundAnchor({
      conceptId,
      conceptTitle,
      soundName: selected,
      soundType: selectedType,
      bindMode,
    });
    if (!anchor) {
      toast({ type: 'warning', message: '该概念在此场景已绑定此声音' });
      return;
    }
    toast({ type: 'success', message: `已为「${conceptTitle}」绑定 ${BIND_MODE_LABELS[bindMode]}声音锚点` });
    toggle(null, null);
    onBound?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => { toggle(null, null); onClose(); }}
      title="绑定声音锚点"
      description={`为「${conceptTitle}」选择一段声音，复习时播放可唤起记忆`}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => { toggle(null, null); onClose(); }}>
            取消
          </Button>
          <Button onClick={handleConfirm} icon={<Music2 className="w-4 h-4" />}>
            绑定声音
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* 绑定场景 */}
        <div>
          <div className="text-xs text-text-tertiary mb-2">绑定场景</div>
          <div className="flex items-center gap-1.5">
            {(Object.keys(BIND_MODE_LABELS) as BindMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setBindMode(m)}
                className={cn(
                  'px-3 py-1.5 rounded-kb-full text-xs font-medium border transition-colors',
                  bindMode === m
                    ? 'bg-brand-500/10 text-brand-600 border-brand-300/50'
                    : 'text-text-tertiary border-border-subtle hover:text-text-primary',
                )}
              >
                {BIND_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {/* 已绑定提示 */}
        {existing.length > 0 && (
          <div className="text-xs text-text-tertiary bg-bg-secondary/60 rounded-kb-lg px-3 py-2">
            已绑定 {existing.length} 个声音锚点（可在声音锚点页管理）
          </div>
        )}

        {/* 声音网格 */}
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
          {SOUND_OPTIONS.map((opt) => {
            const active = selected === opt.fileName;
            const playing = playingName === opt.fileName;
            return (
              <div
                key={opt.fileName}
                className={cn(
                  'flex items-center gap-2 rounded-kb-lg border px-3 py-2 cursor-pointer transition-colors',
                  active
                    ? 'border-brand-400/60 bg-brand-500/10'
                    : 'border-border-subtle bg-bg-secondary/40 hover:border-brand-300/40',
                )}
                onClick={() => setSelected(opt.fileName)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm text-text-primary">
                    {opt.name}
                    {active && <Check className="w-3.5 h-3.5 text-brand-600" strokeWidth={2} />}
                  </div>
                  <div className="text-[11px] text-text-tertiary truncate">
                    {SOUND_TYPE_LABELS[opt.type]} · {opt.description}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(playing ? null : opt.fileName, soundAssetUrl(opt.fileName));
                  }}
                  className={cn(
                    'p-1.5 rounded-kb-full transition-colors flex-shrink-0',
                    playing
                      ? 'text-brand-600 bg-brand-500/15'
                      : 'text-text-tertiary hover:text-brand-600 hover:bg-brand-500/10',
                  )}
                  title={playing ? '停止试听' : '试听'}
                >
                  {playing ? (
                    <Square className="w-4 h-4" strokeWidth={1.5} />
                  ) : (
                    <Volume2 className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
        {!selected && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
            <Play className="w-3 h-3" strokeWidth={1.5} />
            先试听再选择，选中后点击「绑定声音」完成
          </div>
        )}
      </div>
    </Modal>
  );
}
