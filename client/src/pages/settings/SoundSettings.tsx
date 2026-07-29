import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui';
import { Volume2, VolumeX, ChevronDown, Play, Volume1 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import {
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  getSoundsByCategory,
  type SoundCategory,
  type CategorySoundSettings,
} from '@/lib/audio/audioConfig';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useShallow } from 'zustand/react/shallow';

const CATEGORIES: SoundCategory[] = ['operation', 'achievement', 'ai', 'pomodoro', 'ui', 'feedback'];

/**
 * Toggle 开关组件
 * @param checked - 是否开启
 * @param onChange - 切换回调
 * @param disabled - 是否禁用
 */
function Toggle({ checked, onChange, disabled }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-kb-full transition-colors duration-kb-fast flex-shrink-0',
        checked ? 'bg-brand-500' : 'bg-bg-tertiary',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
      aria-label={checked ? '关闭' : '开启'}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-kb-full bg-white shadow-kb-sm transition-transform duration-kb-fast',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}

/**
 * 音量滑块组件
 * @param value - 音量值 0-100
 * @param onChange - 变更回调
 * @param disabled - 是否禁用
 */
function VolumeSlider({ value, onChange, disabled }: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const Icon = value === 0 ? VolumeX : value < 50 ? Volume1 : Volume2;
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-icon-sm h-icon-sm text-text-tertiary flex-shrink-0" strokeWidth={1.5} />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={cn(
          'flex-1 h-1.5 rounded-kb-full appearance-none cursor-pointer',
          'bg-bg-tertiary',
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4',
          '[&::-webkit-slider-thumb]:rounded-kb-full [&::-webkit-slider-thumb]:bg-brand-500',
          '[&::-webkit-slider-thumb]:shadow-kb-sm [&::-webkit-slider-thumb]:cursor-pointer',
          disabled && 'opacity-40 cursor-not-allowed',
        )}
      />
      <span className="text-c1 text-text-tertiary tabular-nums w-8 text-right">{value}%</span>
    </div>
  );
}

/**
 * 单个类别区块
 * @param category - 音效类别
 * @param settings - 该类别的设置
 * @param onUpdate - 更新回调
 */
function CategorySection({ category, settings, onUpdate, masterMute }: {
  category: SoundCategory;
  settings: CategorySoundSettings;
  onUpdate: (patch: Partial<CategorySoundSettings>) => void;
  masterMute: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const sounds = getSoundsByCategory(category);

  return (
    <div className={cn(
      'border border-[#1e3456] rounded-kb-md overflow-hidden transition-opacity duration-kb-normal',
      masterMute && 'opacity-40',
    )}>
      {/* 类别头部 */}
      <div
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col text-left">
            <span className="text-b2 font-medium text-[#e8edf5]">
              {CATEGORY_LABELS[category]}
            </span>
            <span className="text-c1 text-[#8b9bb8]">
              {CATEGORY_DESCRIPTIONS[category]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span onClick={(e) => e.stopPropagation()}>
            <Toggle
              checked={settings.enabled}
              onChange={(v) => onUpdate({ enabled: v })}
              disabled={masterMute}
            />
          </span>
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-[#8b9bb8]" />
          </motion.div>
        </div>
      </div>

      {/* 展开内容 */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-3 border-t border-[#1e3456] pt-3">
              {/* 音量滑块 */}
              <VolumeSlider
                value={settings.volume}
                onChange={(v) => onUpdate({ volume: v })}
                disabled={!settings.enabled || masterMute}
              />

              {/* 音效列表 */}
              <div className="space-y-1">
                {sounds.map((sound) => (
                  <div
                    key={sound.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded-kb-sm hover:bg-white/[0.03]"
                  >
                    <span className="text-c1 text-[#8b9bb8]">{sound.name}</span>
                    <button
                      onClick={() => soundPlayer.previewSound(sound.id)}
                      disabled={masterMute}
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-1 rounded-kb-sm text-c1 font-medium',
                        'bg-white/[0.05] text-[#8b9bb8] border border-[#1e3456]/60',
                        !masterMute && 'hover:bg-[#6366f1]/20 hover:text-[#e8edf5] hover:border-[#6366f1]/40',
                        'active:scale-95 transition-all duration-kb-fast',
                        masterMute && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      <Play className="w-3 h-3" fill="currentColor" />
                      试听
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * 音效设置页面
 * @ai-context 提供 6 类音效独立开关 + 独立音量滑块 + 全局静音 + 预览播放
 */
export default function SoundSettings() {
  const { soundSettings, updateSoundSettings } = useSettingsStore(useShallow(s => s));

  /**
   * 更新单个类别的设置
   * @param category - 音效类别
   * @param patch - 部分设置更新
   */
  const handleCategoryUpdate = (category: SoundCategory, patch: Partial<CategorySoundSettings>) => {
    updateSoundSettings({
      categories: {
        ...soundSettings.categories,
        [category]: { ...soundSettings.categories[category], ...patch },
      },
    });
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <h2 className="text-b1 font-semibold text-text-primary">音效设置</h2>

      {/* 全局静音开关 */}
      <div className="flex items-center justify-between p-3 rounded-kb-md bg-[#6366f1]/10 border border-[#6366f1]/20">
        <div className="flex items-center gap-3">
          {soundSettings.masterMute ? (
            <VolumeX className="w-5 h-5 text-[#6366f1]" strokeWidth={1.5} />
          ) : (
            <Volume2 className="w-5 h-5 text-[#6366f1]" strokeWidth={1.5} />
          )}
          <div className="flex flex-col">
            <span className="text-b2 font-medium text-[#e8edf5]">全局静音</span>
            <span className="text-c1 text-[#8b9bb8]">
              {soundSettings.masterMute ? '已静音，下方设置将被覆盖' : '开启后所有音效将被静音'}
            </span>
          </div>
        </div>
        <Toggle
          checked={soundSettings.masterMute}
          onChange={(v) => updateSoundSettings({ masterMute: v })}
        />
      </div>

      {/* 6 个类别区块 */}
      <div className="space-y-2">
        {CATEGORIES.map((cat) => (
          <CategorySection
            key={cat}
            category={cat}
            settings={soundSettings.categories[cat]}
            onUpdate={(patch) => handleCategoryUpdate(cat, patch)}
            masterMute={soundSettings.masterMute}
          />
        ))}
      </div>
    </Card>
  );
}
