/**
 * 深海沉浸式背景氛围组件
 * Deep-sea immersive ambient background component
 *
 * @ai-context: 在笔记编辑页面渲染深海主题背景氛围——微光水纹粒子、生物发光效果。
 * 使用 Framer Motion 动画，3D 渲染仅在 GPU 性能允许时开启。
 * 参考 website/app/story/page.tsx 的深海品牌叙事设计语言。
 * @ai-context: Renders deep-sea themed ambient background with bioluminescent
 * particles and water ripple effects. Uses Framer Motion animations.
 * Inspired by the deep-sea brand narrative from story/page.tsx.
 */
import { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';

interface DeepSeaAmbientProps {
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 强度（0-1，默认 0.3） */
  intensity?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  duration: number;
  delay: number;
  color: string;
}

const COLORS = [
  'rgba(96,165,250,0.3)',   // 淡蓝
  'rgba(167,139,250,0.2)',  // 淡紫
  'rgba(52,211,153,0.15)',  // 淡绿
  'rgba(251,191,36,0.1)',   // 淡金
];

export function DeepSeaAmbient({ enabled = true, intensity = 0.3 }: DeepSeaAmbientProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // 生成粒子（稳定引用）
  const particles = useMemo<Particle[]>(() => {
    if (!enabled) return [];
    const count = Math.floor(20 * intensity);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 3,
      opacity: 0.1 + Math.random() * 0.3,
      duration: 3 + Math.random() * 5,
      delay: Math.random() * 3,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }, [enabled, intensity]);

  // Canvas 水纹动画
  useEffect(() => {
    if (!enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let time = 0;
    const animate = () => {
      time += 0.005;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 多条水纹线
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(96,165,250,${0.02 * intensity})`;
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 2) {
          const y = canvas.height * 0.3 + i * 80
            + Math.sin(x * 0.005 + time + i * 2) * 20
            + Math.sin(x * 0.01 + time * 0.7) * 10;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [enabled, intensity]);

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Canvas 水纹 */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* Framer Motion 粒子 */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            opacity: [p.opacity, p.opacity * 0.3, p.opacity],
            y: [0, -10 - Math.random() * 20, 0],
            x: [0, (Math.random() - 0.5) * 10, 0],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

export default DeepSeaAmbient;