/**
 * 3D场景全局提供器 — React Three Fiber Canvas容器
 * 作为全屏背景层：z-0 使其位于根布局 div（z-auto）之上、可接收点击，
 * 但仍低于所有 UI 浮层（标题栏 z-50 / FunctionalOverlay z-10 / 引导 z-40+）。
 * 注意：不能用负 z-index，否则会落到根 div 之后被其透明盒拦截点击。
 *
 * 帧循环策略（性能优化核心）：
 * - 概览态（!isInModule）：frameloop=always 全帧渲染（可交互）；
 * - 模块态（isInModule，3D 被遗罩覆盖）：按性能模式降帧/暂停——
 *   静谧(low)=never 暂停、从容(medium)=demand 10fps、澎湃(high)=demand 30fps，
 *   避免 3D 在不可见时仍全帧渲染（持续开销最大头）。
 * - 模块态不渲染 PerformanceMonitor：降帧后的 FPS 是人为限制值，
 *   若用于测量会被误判为性能恶化而降级 tier。
 *
 * @ai-context: 3D 场景核心（R3F）：SceneProvider。
 */
import { Canvas, useThree } from '@react-three/fiber';
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
  /** 是否允许 3D 场景接收指针事件（非模块内时为 true） */
  interactive?: boolean;
}

/** 模块态降帧 ticker：demand 模式下按目标帧率触发渲染（invalidate） */
function ModuleFpsTicker({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (fps <= 0) return; // 暂停档：不触发渲染
    const id = setInterval(() => invalidate(), 1000 / fps);
    return () => clearInterval(id);
  }, [fps, invalidate]);
  return null;
}

export function SceneProvider({ children, interactive = false }: SceneProviderProps) {
  const isInModule = useOrbitalStore((s) => s.isInModule);
  const mode = usePerformanceModeStore((s) => s.mode);
  const moduleFps = PERFORMANCE_MODE_CONFIG[mode].moduleFps;

  // 帧循环策略：概览态全帧；模块态按档位降帧/暂停
  const frameloop: 'always' | 'demand' | 'never' = !isInModule
    ? 'always'
    : moduleFps === 0
      ? 'never'
      : 'demand';

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
        {/* 模块态降帧 ticker（仅 demand 模式） */}
        {frameloop === 'demand' && <ModuleFpsTicker fps={moduleFps} />}
        {/* FPS 自动降档仅在概览态测量（模块态帧率被人为限制，不可作为性能依据） */}
        {!isInModule && <PerformanceMonitor />}
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
