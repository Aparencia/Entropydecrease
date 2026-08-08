/**
 * BreathingCreature — 主题化呼吸生命体（deep-sea 水母 / aurora-dome 极光）
 * Themed breathing creature: jellyfish (deep-sea) / aurora band (aurora-dome)
 *
 * @ai-context: RIT-13（决策 3）——按 useSceneTheme 渲染两种形态，纯 CSS/SVG
 * 实现（不引 canvas/WebGL）；收缩舒张由 BreathingProvider 的 CSS 变量
 * `--breath-scale` 驱动（transform: scale），零 JS 每帧开销。降级由父级
 * RitualStepBreathing 处理为倒计时圆环，本组件只负责标准形态渲染。
 * @ai-context: RIT-13 pure CSS/SVG creature driven by the `--breath-scale`
 * variable; no per-frame JS. Degradation handled by the parent step.
 */
import { useSceneTheme } from '@/lib/3d/hooks/useSceneTheme';

/** 由 --breath-scale 驱动的缩放样式（GPU 合成层） */
const breathStyle: React.CSSProperties = {
  transform: 'scale(var(--breath-scale, 1))',
  transformOrigin: 'center',
  willChange: 'transform',
};

/** deep-sea：水母——多层同心椭圆 + 径向渐变伞体 + 触须 */
function Jellyfish() {
  return (
    <svg viewBox="0 0 176 176" className="w-full h-full" style={breathStyle} aria-hidden>
      <defs>
        <radialGradient id="jelly-bell" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="rgba(99,179,237,0.55)" />
          <stop offset="70%" stopColor="rgba(74,155,217,0.28)" />
          <stop offset="100%" stopColor="rgba(74,155,217,0.05)" />
        </radialGradient>
      </defs>
      {/* 外层光晕 */}
      <ellipse cx="88" cy="72" rx="52" ry="44" fill="url(#jelly-bell)" />
      {/* 伞体轮廓 */}
      <ellipse cx="88" cy="70" rx="40" ry="34" fill="none" stroke="rgba(147,197,253,0.5)" strokeWidth="1.5" />
      <ellipse cx="88" cy="70" rx="26" ry="22" fill="none" stroke="rgba(147,197,253,0.35)" strokeWidth="1" />
      {/* 触须 */}
      {[68, 80, 92, 104].map((x, i) => (
        <path
          key={x}
          d={`M ${x} 100 Q ${x + (i % 2 ? 6 : -6)} 122 ${x} 144`}
          fill="none"
          stroke="rgba(147,197,253,0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** aurora-dome：极光带——横向渐变带 + 涨落光弧 */
function AuroraBand() {
  return (
    <svg viewBox="0 0 176 176" className="w-full h-full" style={breathStyle} aria-hidden>
      <defs>
        <linearGradient id="aurora-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(111,180,232,0.05)" />
          <stop offset="40%" stopColor="rgba(111,180,232,0.45)" />
          <stop offset="60%" stopColor="rgba(52,211,153,0.4)" />
          <stop offset="100%" stopColor="rgba(52,211,153,0.05)" />
        </linearGradient>
      </defs>
      {/* 三条错落的极光弧 */}
      <path d="M 20 96 Q 88 56 156 96" fill="none" stroke="url(#aurora-grad)" strokeWidth="14" strokeLinecap="round" opacity="0.9" />
      <path d="M 24 112 Q 88 78 152 112" fill="none" stroke="url(#aurora-grad)" strokeWidth="9" strokeLinecap="round" opacity="0.7" />
      <path d="M 28 80 Q 88 48 148 80" fill="none" stroke="url(#aurora-grad)" strokeWidth="6" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function BreathingCreature() {
  const theme = useSceneTheme();
  return (
    <div className="relative w-44 h-44 my-2 flex items-center justify-center">
      {theme === 'deep-sea' ? <Jellyfish /> : <AuroraBand />}
    </div>
  );
}
