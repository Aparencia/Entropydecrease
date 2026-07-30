/**
 * @file 深海容器组件
 * @description 将子内容按深海深度层组织，提供环境背景 + 视差滚动 + 层间过渡
 * @ai-context: 替代 DashboardPage Page 2 的 data-dashboard-scroll 区域
 *              兼容弹性翻页系统：仅在 Page 2 完全展开后（progress === 1）激活内部滚动
 */
import { useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import OceanEnvironment from './OceanEnvironment';
import LayerTransition from './LayerTransition';
import { useDepthScroll, type DepthZone } from './useDepthScroll';

interface DepthLayer {
  zone: DepthZone;
  label: string;
  children: ReactNode;
}

interface Props {
  layers: DepthLayer[];
  /** 弹性翻页 progress（0=未展开, 1=完全展开） */
  elasticProgress?: number;
}

/** 层区域标题 */
function ZoneLabel({ zone, label }: { zone: DepthZone; label: string }) {
  const zoneIcons: Record<DepthZone, string> = {
    surface: '~ 0m',
    sunlight: '~ 50m',
    twilight: '~ 200m',
    midnight: '~ 1000m',
  };
  return (
    <div className="flex items-center gap-2 mb-3 px-1">
      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shadow-[0_0_4px_rgba(34,211,238,0.4)]" />
      <span className="text-[10px] font-medium text-cyan-300/70 tracking-wider uppercase">
        {label}
      </span>
      <span className="text-[8px] text-cyan-400/30">{zoneIcons[zone]}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-cyan-400/10 to-transparent" />
    </div>
  );
}

export default function DeepSeaContainer({ layers, elasticProgress = 1 }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { depthPercent, currentZone } = useDepthScroll(scrollRef);

  /** 内部滚动仅在弹性翻页完全展开时激活 */
  const scrollEnabled = elasticProgress >= 0.95;

  return (
    <div className="relative w-full h-full">
      {/* 深海环境背景层 */}
      <OceanEnvironment depthPercent={depthPercent} currentZone={currentZone} />

      {/* 可滚动内容层 */}
      <div
        ref={scrollRef}
        className="relative h-full overflow-y-auto overflow-x-hidden"
        style={{
          overflowY: scrollEnabled ? 'auto' : 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        data-dashboard-scroll
      >
        <div className="relative max-w-[1100px] mx-auto px-6 py-4">
          {layers.map((layer, index) => (
            <motion.section
              key={layer.zone}
              className="relative"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.6,
                delay: index * 0.1,
                ease: [0.25, 0.1, 0.25, 1],
              }}
            >
              {/* 层间过渡（第一层之前不添加） */}
              {index > 0 && (
                <LayerTransition
                  fromZone={layers[index - 1].zone}
                  toZone={layer.zone}
                />
              )}

              {/* 层标题 */}
              <ZoneLabel zone={layer.zone} label={layer.label} />

              {/* 层内容 */}
              <div className="relative z-10">
                {layer.children}
              </div>
            </motion.section>
          ))}

          {/* 底部留白 */}
          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
