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
 *   保证相机飞行到位后才暂停渲染，避免生硬冻结。
 * - PerformanceMonitor 仅 overview 相位测量：entering 的飞行帧率不代表设备能力，docked 无帧率可言。
 *
 * @ai-context: 3D 场景核心（R3F）：SceneProvider。
 */
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import { Preload } from '@react-three/drei';
import { PerformanceMonitor } from './PerformanceMonitor';
import { QualityController } from './QualityController';
import { MemoryManager } from './MemoryManager';
import { ContextRecovery } from './ContextRecovery';
import { useOrbitalStore } from '../navigation/OrbitalStore';
import { usePerformanceModeStore } from '@/lib/performance/usePerformanceMode';
import { PERFORMANCE_MODE_CONFIG } from '@/lib/performance/performanceMode';
import * as THREE from 'three';

interface SceneProviderProps {
  children: React.ReactNode;
  /** 是否允许 3D 场景接收指针事件（覆盖层不可见时为 true） */
  interactive?: boolean;
}

export function SceneProvider({ children, interactive = false }: SceneProviderProps) {
  const phase = useOrbitalStore((s) => s.phase);
  const currentModule = useOrbitalStore((s) => s.currentModule);
  const mode = usePerformanceModeStore((s) => s.mode);

  // entering → docked 停靠计时器：相机飞行过渡结束后才暂停渲染（相位/模块/档位变化时重置）
  useEffect(() => {
    if (phase !== 'entering') return;
    const timer = setTimeout(
      () => useOrbitalStore.getState().dock(),
      PERFORMANCE_MODE_CONFIG[mode].dockDelayMs,
    );
    return () => clearTimeout(timer);
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
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          scene.fog = new THREE.FogExp2('#0a0a2e', 0.03);
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
