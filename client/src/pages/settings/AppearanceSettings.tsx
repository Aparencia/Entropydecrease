/**
 * @ai-context: 设置页组件：AppearanceSettings。
 */
import { useState } from 'react';
import { readWithLegacyMigration } from '@/lib/utils/legacyLocalStorage';
import { Card } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Rows3, Grid3x3, AlignJustify, Waves, Eye, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getWorldSoundscapeEnabled,
  setWorldSoundscapeEnabled,
} from '@/lib/audio/worldSoundscapeConfig';

/** 密度存储 key */
const DENSITY_KEY = 'ed-density';
const LEGACY_DENSITY_KEY = 'keban-density'; // 旧键，2027-01 前兼容

/** 密度类型 */
type Density = 'compact' | 'normal' | 'loose';

/** 从 localStorage 读取当前密度 */
function getStoredDensity(): Density {
  try {
    const v = readWithLegacyMigration(DENSITY_KEY, LEGACY_DENSITY_KEY);
    if (v === 'compact' || v === 'normal' || v === 'loose') return v;
  } catch { /* ignore */ }
  return 'normal';
}

/** 密度选项配置 */
const densityConfig: { key: Density; label: string; icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }> }[] = [
  { key: 'compact', label: '紧凑', icon: Rows3 },
  { key: 'normal', label: '标准', icon: Grid3x3 },
  { key: 'loose', label: '宽松', icon: AlignJustify },
];

export default function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [density, setDensity] = useState<Density>(getStoredDensity);
  const [soundscape, setSoundscape] = useState(getWorldSoundscapeEnabled);
  const [eyeCareEnabled, setEyeCareEnabled] = useState(() => {
    try { return localStorage.getItem('ed-eye-care') === 'true'; } catch { return false; }
  });
  const [focusGuardianEnabled, setFocusGuardianEnabled] = useState(() => {
    try { return localStorage.getItem('ed-focus-guardian') === 'true'; } catch { return false; }
  });
  const [digitalWellbeingEnabled, setDigitalWellbeingEnabled] = useState(() => {
    try { return localStorage.getItem('ed-digital-wellbeing') === 'true'; } catch { return false; }
  });

  const handleSoundscapeToggle = () => {
    const next = !soundscape;
    setSoundscape(next);
    setWorldSoundscapeEnabled(next);
  };

  const handleEyeCareToggle = () => {
    const next = !eyeCareEnabled;
    setEyeCareEnabled(next);
    try { localStorage.setItem('ed-eye-care', String(next)); } catch { /* ignore */ }
  };

  const handleFocusGuardianToggle = () => {
    const next = !focusGuardianEnabled;
    setFocusGuardianEnabled(next);
    try { localStorage.setItem('ed-focus-guardian', String(next)); } catch { /* ignore */ }
  };

  const handleDigitalWellbeingToggle = () => {
    const next = !digitalWellbeingEnabled;
    setDigitalWellbeingEnabled(next);
    try { localStorage.setItem('ed-digital-wellbeing', String(next)); } catch { /* ignore */ }
  };

  const handleDensityChange = (key: Density) => {
    setDensity(key);
    try {
      localStorage.setItem(DENSITY_KEY, key);
    } catch { /* ignore */ }
    // 立即应用到 DOM
    document.documentElement.setAttribute('data-density', key);
  };

  return (
    <Card padding="md" className="flex flex-col gap-kb-md">
      <div className="flex items-center justify-between">
        <h2 className="text-b1 font-semibold text-text-primary">外观设置</h2>
        <span className="text-b3 text-text-tertiary px-2 py-0.5 rounded-[var(--kb-radius-sm)] bg-bg-tertiary/50">
          当前：{theme === 'dark' ? '极夜深海' : '晨曦浮光'} · {density === 'compact' ? '紧凑' : density === 'loose' ? '宽松' : '标准'}
        </span>
      </div>

      {/* 主题切换 — 渐变预览背景 */}
      <div className="flex flex-col gap-kb-sm">
        <label className="text-b2 font-medium text-text-secondary">主题模式</label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { key: 'light' as const, label: '晨曦浮光', icon: Sun, desc: '清爽明亮，适合日间使用', gradient: 'linear-gradient(135deg, #fefcf3 0%, #f8f4ec 50%, #fefefe 100%)' },
            { key: 'dark' as const, label: '极夜深海', icon: Moon, desc: '护眼舒适，适合夜间使用', gradient: 'linear-gradient(135deg, #0f172a 0%, #10182c 50%, #1a2332 100%)' },
          ]).map(({ key, label, icon: Icon, desc, gradient }) => (
            <button
              key={key}
              onClick={() => setTheme(key)}
              className={cn(
                'relative flex flex-col items-start gap-2 p-4 rounded-[var(--kb-radius-lg)] overflow-hidden',
                'border-2 transition-all duration-300',
                'hover:-translate-y-0.5',
                theme === key
                  ? 'border-brand-500 shadow-[0_0_0_1px_rgba(91,138,114,0.1),0_4px_16px_-4px_rgba(91,138,114,0.2)]'
                  : 'border-border/50 hover:border-brand-300',
              )}
            >
              {/* 渐变预览背景 */}
              <div
                className="absolute inset-0 opacity-30"
                style={{ background: gradient }}
              />
              <div className={cn(
                'relative w-9 h-9 rounded-[var(--kb-radius-md)] flex items-center justify-center',
                theme === key ? 'bg-brand-100 text-brand-600' : 'bg-bg-tertiary text-text-secondary',
              )}>
                <Icon className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="relative text-left">
                <p className={cn(
                  'text-b2 font-medium',
                  theme === key ? 'text-brand-700' : 'text-text-primary',
                )}>
                  {label}
                </p>
                <p className="text-c1 text-text-tertiary mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 信息密度 */}
      <div className="flex flex-col gap-kb-sm">
        <label className="text-b2 font-medium text-text-secondary">信息密度</label>
        <div className="grid grid-cols-3 gap-2">
          {densityConfig.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleDensityChange(key)}
              className={cn(
                'flex items-center justify-center gap-2 py-2.5 px-3 rounded-[var(--kb-radius-md)]',
                'border-2 text-b2 font-medium',
                'transition-all duration-200',
                density === key
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-border/50 bg-bg-elevated text-text-secondary hover:border-brand-300 hover:bg-bg-tertiary',
              )}
            >
              <Icon className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>

        {/* 密度预览 */}
        <div className="mt-3 rounded-kb-md border border-border/50 bg-bg-secondary overflow-hidden">
          <div className="px-3 py-2 border-b border-border/30">
            <span className="text-b3 text-text-tertiary">预览效果</span>
          </div>
          <div className="space-y-0">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 border-b border-border/20 last:border-0"
                style={{
                  padding: density === 'compact' ? '6px 12px' : density === 'loose' ? '16px 12px' : '10px 12px',
                }}
              >
                <div className="w-8 h-8 rounded-kb-sm bg-brand-100 dark:bg-brand-900/30 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-b2 font-medium text-text-primary truncate">笔记标题 {i}</div>
                  <div className="text-b3 text-text-secondary truncate">这是笔记内容的预览文本...</div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <span className="px-1.5 py-0.5 text-b3 rounded text-brand-600 bg-brand-50">标签</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 世界声景（宪法 P2：双世界环境底噪，默认关闭） */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-b2 font-medium text-text-secondary">世界声景</label>
          <span className="text-b3 text-text-tertiary">
            深海=雨声 · 穹顶=麦浪风声，音量克制，随主题自动切换
          </span>
        </div>
        <button
          type="button"
          onClick={handleSoundscapeToggle}
          aria-pressed={soundscape}
          className={cn(
            'flex items-center gap-2 py-2 px-4 rounded-kb-full border-2 text-b2 font-medium',
            'transition-all duration-200',
            soundscape
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border/50 bg-bg-elevated text-text-secondary hover:border-brand-300',
          )}
        >
          <Waves className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          {soundscape ? '已开启' : '已关闭'}
        </button>
      </div>

      {/* 护眼模式 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-b2 font-medium text-text-secondary">护眼模式</label>
          <span className="text-b3 text-text-tertiary">
            暖色调 sepia 滤镜，减轻夜间用眼疲劳（22:00 后自动开启）
          </span>
        </div>
        <button
          type="button"
          onClick={handleEyeCareToggle}
          aria-pressed={eyeCareEnabled}
          className={cn(
            'flex items-center gap-2 py-2 px-4 rounded-kb-full border-2 text-b2 font-medium',
            'transition-all duration-200',
            eyeCareEnabled
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border/50 bg-bg-elevated text-text-secondary hover:border-brand-300',
          )}
        >
          <Eye className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          {eyeCareEnabled ? '已开启' : '已关闭'}
        </button>
      </div>

      {/* 专注守护灵 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-b2 font-medium text-text-secondary">专注守护灵</label>
          <span className="text-b3 text-text-tertiary">
            检测分心行为，5 级渐进干预——从底部提示到全屏覆盖
          </span>
        </div>
        <button
          type="button"
          onClick={handleFocusGuardianToggle}
          aria-pressed={focusGuardianEnabled}
          className={cn(
            'flex items-center gap-2 py-2 px-4 rounded-kb-full border-2 text-b2 font-medium',
            'transition-all duration-200',
            focusGuardianEnabled
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border/50 bg-bg-elevated text-text-secondary hover:border-brand-300',
          )}
        >
          <Heart className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          {focusGuardianEnabled ? '已开启' : '已关闭'}
        </button>
      </div>

      {/* 数字养生守门人 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-b2 font-medium text-text-secondary">数字养生守门人</label>
          <span className="text-b3 text-text-tertiary">
            连续使用提醒 · 夜间护眼 · 周末离线 · 番茄间隙远眺 · 久坐提醒
          </span>
        </div>
        <button
          type="button"
          onClick={handleDigitalWellbeingToggle}
          aria-pressed={digitalWellbeingEnabled}
          className={cn(
            'flex items-center gap-2 py-2 px-4 rounded-kb-full border-2 text-b2 font-medium',
            'transition-all duration-200',
            digitalWellbeingEnabled
              ? 'border-brand-500 bg-brand-50 text-brand-700'
              : 'border-border/50 bg-bg-elevated text-text-secondary hover:border-brand-300',
          )}
        >
          <Heart className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
          {digitalWellbeingEnabled ? '已开启' : '已关闭'}
        </button>
      </div>
    </Card>
  );
}
