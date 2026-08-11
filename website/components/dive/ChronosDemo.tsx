// @ai-context
// Chronos 可玩演示：自研轻量 Canvas 2D 粒子引擎，六态参数化状态机，
// 与产品内两步式交互同构（沉睡→呼吸→专注）。不依赖 three.js，保首屏。
// Chronos playable demo: self-built Canvas 2D particle engine.
// Why: 宣传视觉资产需零依赖、60fps、reduced-motion 可降级；参数复用 lib/features/chronos.ts。
"use client";

import { useEffect, useRef, useState } from "react";
import { CHRONOS_STATES, STATE_STYLE, type ChronosState } from "@/lib/features/chronos";

const PARTICLE_COUNT = 300;
/** 专注态粒子消散循环周期（秒）：模拟倒计时沙漏 */
const FOCUS_CYCLE_S = 24;
/** 透视投影焦距 */
const FOCAL = 3.2;

interface Particle {
  theta: number;
  phi: number;
  r: number;
  speed: number;
  phase: number;
}

interface ChronosDemoProps {
  /** 受控形态（六态卡片点击传入）；null = 自由交互（点击推进） */
  controlledState?: ChronosState | null;
  onStateChange?: (s: ChronosState) => void;
}

export function ChronosDemo({ controlledState = null, onStateChange }: ChronosDemoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [freeState, setFreeState] = useState<ChronosState>("asleep");
  const state = controlledState ?? freeState;
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // 自由交互：沉睡→呼吸→专注→沉睡
  const handleTap = () => {
    if (controlledState) return;
    const next: ChronosState =
      state === "asleep" ? "breathing" : state === "breathing" ? "focus" : "asleep";
    setFreeState(next);
    onStateChange?.(next);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.min(canvas.clientWidth, canvas.clientHeight);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    // 球面分布（带厚度）+ 增量角度漂移
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.acos(2 * Math.random() - 1),
      r: 0.55 + Math.random() * 0.45,
      speed: 0.05 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
    }));

    const cx = size / 2;
    const cy = size / 2;
    let raf = 0;
    const start = performance.now();

    const render = (now: number) => {
      const elapsed = (now - start) / 1000;
      const style = STATE_STYLE[stateRef.current];
      const [cr, cg, cb] = style.color;

      ctx.clearRect(0, 0, size, size);
      ctx.globalCompositeOperation = "lighter";

      // 心跳脉动：breathing 为 1Hz（60bpm），其余弱脉动
      const pulse = style.pulse * (0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2));
      const focusProgress = (elapsed % FOCUS_CYCLE_S) / FOCUS_CYCLE_S;

      // 中心光晕
      const glowR = size * (0.32 + pulse * 0.06);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},${style.glow})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // 全局自转 + 微摆
      const rotY = elapsed * 0.12;
      const rotX = Math.sin(elapsed * 0.08) * 0.25;

      particles.forEach((p, i) => {
        // 专注态：粒子按索引顺序随进度消散（沙漏隐喻）
        if (style.dissipate && i / PARTICLE_COUNT < focusProgress) return;

        const theta = p.theta + elapsed * p.speed * style.drift + rotY;
        const phi = p.phi + rotX;
        const radius = p.r * style.scale * (1 + pulse * 0.08);
        const x = radius * Math.sin(phi) * Math.cos(theta);
        const y = radius * Math.sin(phi) * Math.sin(theta);
        const z = radius * Math.cos(phi);

        // 透视投影：近大远小 + 深度亮度
        const proj = FOCAL / (FOCAL - z);
        const px = cx + x * (size / 2) * proj;
        const py = cy + y * (size / 2) * proj;
        const depth = (z + 1) / 2;
        const alpha =
          (0.25 + 0.55 * depth) * (style.dissipate ? 1 - focusProgress * 0.6 : 1);
        const pr = Math.max((0.7 + 1.3 * depth) * proj * style.scale, 0.3);

        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.fill();
      });

      // 划时代点：金色涟漪扩散
      if (stateRef.current === "milestone") {
        const ringT = (elapsed % 3) / 3;
        ctx.beginPath();
        ctx.arc(cx, cy, size * (0.2 + ringT * 0.35), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(251,191,36,${0.5 * (1 - ringT)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };

    if (reduced) {
      // 无障碍降级：静态一帧渐变球
      const [cr, cg, cb] = STATE_STYLE.asleep.color;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
      glow.addColorStop(0, `rgba(${cr},${cg},${cb},0.5)`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
    } else {
      raf = requestAnimationFrame(render);
    }

    return () => cancelAnimationFrame(raf);
  }, []);

  const meta = CHRONOS_STATES.find((s) => s.key === state);

  return (
    <div
      className="relative w-[clamp(240px,52vmin,420px)] h-[clamp(240px,52vmin,420px)] mx-auto cursor-pointer select-none"
      onClick={handleTap}
      role="button"
      aria-label="Chronos 时间生物演示，点击切换形态"
    >
      <canvas ref={canvasRef} className="w-full h-full" />
      <div
        className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-kb-text2 whitespace-nowrap"
        style={{ background: "var(--kb-bg-tertiary)" }}
      >
        {meta?.icon} {meta?.name}
      </div>
    </div>
  );
}