/**
 * 暗物质场与秩序之井背景层
 * @description 造序仪式视觉语言落地：三层深度暗物质雾 + 底部秩序之井（白热光柱/星芒/呼吸光圈/丁达尔尘埃）
 * @ai-context 纯 CSS 动画驱动（零 JS 调度），DOM 数量按降级级别裁剪：
 * L0 全量（湍流丝 + 3 雾团 + 14 尘埃 + 星芒）；L1 减量（无湍流/2 雾团/6 尘埃/无星芒）；L2 静帧（仅远景羽化 + 井口光圈）
 */
import { useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useThemeStore } from '@/stores/useThemeStore';
import '../styles/inspiration-abyss.css';

/** 降级级别：与沉浸模式共用定义（L0 正常 / L1 低端 / L2 减弱动效） */
export type AbyssDegradation = 'L0' | 'L1' | 'L2';

interface OrderWellBackgroundProps {
  /** 降级级别：L2 完全不渲染动态层 */
  degradation: AbyssDegradation;
  /** 强制深色上下文（沉浸模式等固定深色场景）：容器挂 data-theme="dark" 使令牌/暗物质变量落入深色 */
  forceDark?: boolean;
}

/** 确定性伪随机 @ai-context 与服务端无关，仅用于粒子位置/时长的可复现分布 */
function seeded(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

interface DustParticle {
  id: number;
  x: number;        // 相对光柱中心偏移（%）
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

/** 生成丁达尔尘埃粒子 @ai-context 在光柱范围内（±38% 宽）随机分布 */
function generateDust(count: number): DustParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (seeded(i * 7 + 3) - 0.5) * 76,
    size: 1.5 + seeded(i * 13 + 5) * 2.5,
    duration: 12 + seeded(i * 17 + 11) * 10,
    delay: seeded(i * 23 + 7) * 14,
    opacity: 0.25 + seeded(i * 31 + 13) * 0.4,
  }));
}

/** 中景雾团配置 @ai-context 不同位置/尺寸/漂移周期，形成密度不均的雾块 */
const FOG_MIDS = [
  { x: '12%', y: '58%', w: 420, h: 300, duration: 42 },
  { x: '76%', y: '40%', w: 380, h: 260, duration: 54 },
  { x: '58%', y: '72%', w: 460, h: 320, duration: 48 },
] as const;

/**
 * 暗物质场背景组件
 * @ai-context 固定视口（fixed inset-0 z-0），位于页面内容之下；
 * 井光与雾均使用 --kb-* 令牌，随深浅主题自动适配
 */
export default function OrderWellBackground({ degradation, forceDark }: OrderWellBackgroundProps) {
  const prefersReduced = useReducedMotion();
  const theme = useThemeStore(s => s.theme);

  // L1 减量 / L0 全量；浅色晨雾版金尘更密（晨光浮尘叙事）；L2 不渲染动态层
  const baseDust = degradation === 'L1' ? 6 : 14;
  const dustCount = theme === 'light' ? baseDust + 6 : baseDust;
  const dust = useMemo(
    () => generateDust(prefersReduced ? 0 : dustCount),
    [prefersReduced, dustCount],
  );
  const fogs = degradation === 'L1' ? FOG_MIDS.slice(0, 2) : FOG_MIDS;
  const showTurbulence = degradation === 'L0' && !prefersReduced;
  const showFlare = degradation !== 'L2' && !prefersReduced;
  const showGlimmer = degradation !== 'L2' && !prefersReduced;
  const animPlay = prefersReduced ? 'paused' as const : undefined;

  if (degradation === 'L2') {
    return (
      <div className="kb-abyss" aria-hidden="true" data-theme={forceDark ? 'dark' : undefined}>
        <div className="kb-abyss-grain" />
        <div className="kb-abyss-far" />
      </div>
    );
  }

  return (
    <div className="kb-abyss" aria-hidden="true" data-theme={forceDark ? 'dark' : undefined}>
      {/* 微颗粒噪点：暗物质质感 */}
      <div className="kb-abyss-grain" />

      {/* 近景湍流漩涡：缓慢旋转的暗物质丝 */}
      {showTurbulence && <div className="kb-abyss-turbulence" />}

      {/* 中景雾团：密度不均的雾块 */}
      {fogs.map((fog, i) => (
        <div
          key={`fog-${i}`}
          className="kb-abyss-fog"
          style={{
            left: fog.x,
            top: fog.y,
            width: fog.w,
            height: fog.h,
            animationPlayState: animPlay,
            ['--kb-fog-duration' as string]: `${fog.duration}s`,
          }}
        />
      ))}

      {/* 远景羽化：四周渐隐吞噬边缘 */}
      <div className="kb-abyss-far" />

      {/* 海面波光：晨光碎金闪烁（浅色晨雾版专属） */}
      {showGlimmer && <div className="kb-abyss-glimmer" style={{ animationPlayState: animPlay }} />}

      {/* ── 秩序之井 ── */}
      <div className="kb-well">
        {/* 井口呼吸光圈：秩序与混沌的交界线 */}
        <div
          className="kb-well-aperture"
          style={{ animationPlayState: animPlay }}
        />

        {/* 光柱：白热核心 + 双色余晖 */}
        <div className="kb-well-beam">
          <div className="kb-well-beam-core" />
          <div className="kb-well-beam-halo" />
        </div>

        {/* 星芒：井口十字衍射光芒 */}
        {showFlare && (
          <div className="kb-well-star-flare" style={{ animationPlayState: animPlay }} />
        )}
      </div>

      {/* 丁达尔尘埃：光柱内上升微粒 */}
      {dust.length > 0 && (
        <div className="kb-well-dust">
          {dust.map((p) => (
            <span
              key={p.id}
              style={{
                width: p.size,
                height: p.size,
                marginLeft: `${p.x}%`,
                ['--kb-dust-duration' as string]: `${p.duration}s`,
                ['--kb-dust-delay' as string]: `${p.delay}s`,
                ['--kb-dust-opacity' as string]: p.opacity,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
