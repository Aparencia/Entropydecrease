/**
 * 3D场景全局提供器 — React Three Fiber Canvas容器
 * 作为全屏背景层：z-0 使其位于根布局 div（z-auto）之上、可接收点击，
 * 但仍低于所有 UI 浮层（标题栏 z-50 / FunctionalOverlay z-10 / 引导 z-40+）。
 * 注意：不能用负 z-index，否则会落到根 div 之后被其透明盒拦截点击。
 *
 * 帧循环策略（性能优化核心，随导航相位迁移）：
 * - overview / entering：frameloop=always 全帧渲染（概览可交互；entering 为相机飞行过渡）；
 * - docked（覆盖层遮挡）：frameloop=never 完全暂停渲染。
 *   原因：覆盖层使用 backdrop-blur，若 canvas 持续更新会使模糊缓存每帧失效，
 *   导致 GPU 合成风暴（内测反馈“主页流畅但切换其他页面卡顿”的根因）。
 *   暂停后画面冻结为静态背景，blur 仅计算一次即被合成器缓存，视觉设计不变。
 * - entering → docked 的停靠延迟由性能档位决定（静谧=0/从容=900ms/澎湃=1300ms），
 *   保证相机飞行到位后才暂停渲染，避免生硬冻结；下限 clamp 到 700ms（飞行时长
 *   600ms），防止静谧档在飞行中途冻结导致相机停在半途、停靠视角错位。
 * - PerformanceMonitor 仅 overview 相位测量：entering 的飞行帧率不代表设备能力，docked 无帧率可言。
 * - 帧循环唤醒：R3F 从 frameloop='never' 切回 'always' 时不会自动重启渲染循环
 *   （循环停止后无帧可检查新值，且 setFrameloop 不调 invalidate），
 *   需由 LoopResumer 在相位迁移后显式唤醒，否则多次切换后画面永久冻结。
 *
 * @ai-context: 3D 场景核心（R3F）：SceneProvider。
 */
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect } from 'react';
import { Preload } from '@react-three/drei';
import { PerformanceMonitor } from './PerformanceMonitor';
import { QualityController } from './QualityController';
import { MemoryManager } from './MemoryManager';
import { ContextRecovery } from './ContextRecovery';
import { useOrbitalStore } from '../navigation/OrbitalStore';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';
import { PERFORMANCE_MODE_CONFIG } from '@/lib/performance/performanceMode';
import { useSceneTheme } from '../hooks/useSceneTheme';
import * as THREE from 'three';

interface SceneProviderProps {
  children: React.ReactNode;
  /** 是否允许 3D 场景接收指针事件（覆盖层不可见时为 true） */
  interactive?: boolean;
}

/**
 * 主题感知雾效/背景 — 深色用深蓝雾，浅色用浅蓝雾
 * 确保主题切换时雾色和背景色同步更新
 */
function ThemeAwareEnvironment() {
  const { gl, scene, camera } = useThree();
  const theme = useSceneTheme();

  useEffect(() => {
    if (theme === 'deep-sea') {
      scene.fog = new THREE.FogExp2('#0a0a2e', 0.03);
      scene.background = new THREE.Color('#0A1620');
    } else {
      scene.fog = new THREE.FogExp2('#e8f4f8', 0.015);
      scene.background = new THREE.Color('#e8f4f8');
    }
    // docked 相位 frameloop='never' 下渲染循环已冻结，invalidate() 早退不触发
    // 重绘——主题切换后 scene 对象虽已更新但画布仍显示旧帧（背景不立即生效）。
    // 延迟到宏任务手动渲染一帧：确保同批 theme 消费者的 Three 属性更新全部
    // 提交后再绘制，一次性开销不破坏冻结策略（内测反馈修复）。
    const timer = setTimeout(() => gl.render(scene, camera), 0);
    return () => clearTimeout(timer);
  }, [theme, scene, camera, gl]);

  return null;
}

/**
 * 渲染循环唤醒器 — 修复"多次切换功能后页面无渲染"
 *
 * R3F 的循环在 frameloop='never' 下会 cancelAnimationFrame 彻底停止；
 * 切回 'always' 时 setFrameloop 只改 store 值，不会重启循环，
 * 而期间所有 invalidate() 又因 frameloop 尚为 'never' 被早退丢弃。
 * 因此在相位/档位迁移后（此时 frameloop prop 已应用）显式 invalidate：
 * 'always' 下 render 每帧返回 1，一次唤醒即可让循环永续运行；
 * docked（'never'）时 invalidate 自动早退，无副作用。
 *
 * 修复：使用 useLayoutEffect（同步执行，确保 frameloop prop 已挂载）
 * + setTimeout 兜底：React 18 中 useEffect 为异步微任务，frameloop
 * prop 可能在同一个微任务中尚未被 R3F 内部处理，导致 invalidate()
 * 因 frameloop 仍为 'never' 被早退丢弃。
 */
function LoopResumer() {
  const invalidate = useThree((s) => s.invalidate);
  const phase = useOrbitalStore((s) => s.phase);
  const mode = usePerformanceModeStore((s) => s.mode);
  const theme = useSceneTheme();

  useLayoutEffect(() => {
    // 第一轮：同步执行，确保 frameloop 已挂载
    invalidate();
    // 第二轮：setTimeout 兜底，确保 React 事务完成、R3F 已处理 frameloop 变更
    const timer = setTimeout(() => invalidate(), 0);
    return () => clearTimeout(timer);
  }, [phase, mode, theme, invalidate]);

  return null;
}

export function SceneProvider({ children, interactive = false }: SceneProviderProps) {
  const phase = useOrbitalStore((s) => s.phase);
  const currentModule = useOrbitalStore((s) => s.currentModule);
  const mode = usePerformanceModeStore((s) => s.mode);

  // entering → docked 停靠计时器：相机飞行过渡结束后才暂停渲染（相位/模块/档位变化时重置）。
  // 下限 clamp 到 700ms（相机飞行固定 600ms）：静谧档 dockDelayMs=0 会在飞行中途
  // 冻结渲染（frameloop='never'），相机停在半途且朝向插值未完成，停靠后视角错位。
  // 兼容 2.5s 强制停靠上限：快速连续切换页面时 currentModule 变化会反复重置本计时器
  // （正确行为），但若计时器因任何原因丢失/被节流，兜底确保相位收敛到 docked，
  // 避免卡在 entering 导致覆盖层永不显示（页面不渲染）。
  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(
      () => useOrbitalStore.getState().dock(),
      Math.max(PERFORMANCE_MODE_CONFIG[mode].dockDelayMs, 700),
    );
    const fallback = setTimeout(() => useOrbitalStore.getState().dock(), 2500);
    return () => { clearTimeout(timer); clearTimeout(fallback); };
  }, [phase, currentModule, mode]);

  // 帧循环策略：docked 完全暂停（避免活动 canvas 使覆盖层 backdrop-blur 缓存失效）
  const frameloop: 'always' | 'never' = phase === 'docked' ? 'never' : 'always';

  return (
    <div className="fixed inset-0 z-0" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      <Canvas
        frameloop={frameloop}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
        }}
        camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 0, 10] }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          // 注意：fog 和 background 由 ThemeAwareEnvironment 组件管理（主题感知）
          // GPU 诊断：打印实际渲染器名称，出现 SwiftShader 即说明落入软件渲染（硬件加速失效）
          const ctx = gl.getContext();
          const dbgExt = ctx.getExtension('WEBGL_debug_renderer_info');
          const rendererName = dbgExt
            ? ctx.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)
            : ctx.getParameter(ctx.RENDERER);
          console.info('[3D] WebGL renderer:', rendererName);
        }}
      >
        {/* FPS 自动降档仅在概览态测量（entering 飞行帧率不代表设备能力，docked 无帧率可言） */}
        {phase === 'overview' && <PerformanceMonitor />}
        <LoopResumer />
        <ThemeAwareEnvironment />
        <QualityController />
        <MemoryManager />
        <ContextRecovery />
        <Suspense fallback={null}>
          {children}
          <Preload all />
        </Suspense>
      </Canvas>
    </div>
  );
}
