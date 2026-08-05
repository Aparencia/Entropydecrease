/**
 * 声音记忆锚点管理页
 *
 * @ai-context: 3.11 声音锚点。绑定概念 ↔ 声音（学习/复习/考试场景），
 * 列表展示 + 试听 + 删除；数据存 localStorage（ed_sound_anchors）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Music2, Trash2, Link2 } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { Button, EmptyState, useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { BIND_MODE_LABELS, type BindMode, type SoundAnchor } from '../types';
import { SOUND_OPTIONS, SOUND_TYPE_LABELS, soundAssetUrl } from '../lib/soundOptions';
import { useSoundPreview } from '../lib/useSoundPreview';
import { addSoundAnchor, listSoundAnchors, removeSoundAnchor } from '../lib/soundAnchorStore';
import { SoundAnchorBadge } from '../components/SoundAnchorBadge';

export default function SoundAnchorPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { playingName, toggle, stop } = useSoundPreview();

  const [anchors, setAnchors] = useState<SoundAnchor[]>([]);
  const [conceptTitle, setConceptTitle] = useState('');
  const [soundName, setSoundName] = useState(SOUND_OPTIONS[0]?.fileName ?? '');
  const [bindMode, setBindMode] = useState<BindMode>('learn');

  const refresh = useCallback(() => setAnchors(listSoundAnchors()), []);

  useEffect(() => {
    refresh();
    return () => stop();
  }, [refresh, stop]);

  const handleBind = () => {
    const title = conceptTitle.trim();
    if (!title) {
      toast({ type: 'warning', message: '请输入要绑定声音的概念名称' });
      return;
    }
    const selected = SOUND_OPTIONS.find((o) => o.fileName === soundName);
    if (!selected) return;
    const anchor = addSoundAnchor({
      conceptId: `custom:${title}`,
      conceptTitle: title,
      soundName: selected.fileName,
      soundType: selected.type,
      bindMode,
    });
    if (!anchor) {
      toast({ type: 'warning', message: '该概念在此场景已绑定此声音' });
      return;
    }
    toast({ type: 'success', message: `已绑定「${title}」→ ${selected.name}` });
    setConceptTitle('');
    refresh();
  };

  const handleRemove = (id: string) => {
    removeSoundAnchor(id);
    refresh();
    toast({ type: 'info', message: '已解除声音锚点' });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* 顶栏 */}
      <div className="flex items-center gap-kb-sm px-kb-md py-3 flex-shrink-0 border-b border-border-subtle">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <ModuleRitualHeader title="声音记忆锚点" sealChar="声" sealColor="#8B7CC4" compact />
      </div>

      <div className="flex-1 overflow-y-auto px-kb-md py-4 flex flex-col gap-5">
        {/* 绑定表单 */}
        <section className="rounded-kb-xl border border-border-subtle bg-bg-elevated p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
            绑定概念声音
          </h3>
          <div className="flex flex-col gap-3">
            <input
              value={conceptTitle}
              onChange={(e) => setConceptTitle(e.target.value)}
              placeholder="概念名称（如：光合作用）"
              className="w-full rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-brand-400/60"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={soundName}
                onChange={(e) => setSoundName(e.target.value)}
                className="rounded-kb-lg border border-border-subtle bg-bg-secondary/60 px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-400/60"
              >
                {SOUND_OPTIONS.map((o) => (
                  <option key={o.fileName} value={o.fileName}>
                    {o.name}（{SOUND_TYPE_LABELS[o.type]}）
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => toggle(playingName === soundName ? null : soundName, soundAssetUrl(soundName))}
                className="rounded-kb-lg border border-border-subtle bg-bg-secondary/60 text-sm text-text-secondary hover:text-brand-600 transition-colors"
              >
                {playingName === soundName ? '停止试听' : '试听声音'}
              </button>
            </div>
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
            <Button onClick={handleBind} icon={<Music2 className="w-4 h-4" />}>
              绑定锚点
            </Button>
          </div>
        </section>

        {/* 锚点列表 */}
        <section className="flex-1">
          <h3 className="text-sm font-medium text-text-primary mb-3">已绑定锚点（{anchors.length}）</h3>
          {anchors.length === 0 ? (
            <EmptyState
              icon={<Music2 className="w-10 h-10" strokeWidth={1.2} />}
              title="还没有声音锚点"
              description="绑定概念与声音，复习时用听觉唤起记忆"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {anchors.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-kb-xl border border-border-subtle bg-bg-elevated px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate">{a.conceptTitle}</span>
                      <span className="text-[11px] text-text-tertiary rounded-kb-full bg-bg-tertiary px-2 py-0.5 flex-shrink-0">
                        {BIND_MODE_LABELS[a.bindMode]}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <SoundAnchorBadge anchor={a} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    className="p-1.5 rounded-kb-full text-text-tertiary hover:text-red-500 hover:bg-bg-tertiary transition-colors flex-shrink-0"
                    title="解除绑定"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
