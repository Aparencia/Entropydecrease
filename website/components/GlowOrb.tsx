// @ai-context
// 深海发光粒子装饰组件。Deep-sea glow particle decoration.
// Why: 用 mulberry32 确定性伪随机替代 Math.random，保证 SSR/CSR 渲染一致避免水合不匹配。
"use client";

import { useMemo } from "react";

interface GlowOrbProps {
  /** 粒子数量 */
  count?: number;
  /** 容器 className */
  className?: string;
  /** 随机种子（保证服务端/客户端渲染一致，避免水合不匹配） */
  seed?: number;
}

/** 确定性伪随机数生成器（mulberry32），避免 Math.random 导致的水合不匹配 */
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 深海发光粒子/光晕装饰
 * 模拟深海生物荧光般的微光漂浮
 */
export function GlowOrb({ count = 12, className = "", seed = 42 }: GlowOrbProps) {
  const orbs = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: `${8 + rand() * 84}%`,
      top: `${10 + rand() * 80}%`,
      size: 3 + rand() * 6,
      delay: `${rand() * 6}s`,
      duration: `${6 + rand() * 6}s`,
      color: i % 3, // 0=brand, 1=accent(cyan), 2=moss
    }));
  }, [count, seed]);

  const colorMap = [
    "var(--kb-glow-1)",
    "var(--kb-glow-2)",
    "var(--kb-glow-3)",
  ];

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`} aria-hidden>
      {orbs.map((orb) => (
        <span
          key={orb.id}
          className="absolute rounded-full animate-float"
          style={{
            left: orb.left,
            top: orb.top,
            width: orb.size,
            height: orb.size,
            background: colorMap[orb.color],
            boxShadow: `0 0 ${orb.size * 3}px ${orb.size}px ${colorMap[orb.color]}`,
            animationDelay: orb.delay,
            animationDuration: orb.duration,
          }}
        />
      ))}
    </div>
  );
}
