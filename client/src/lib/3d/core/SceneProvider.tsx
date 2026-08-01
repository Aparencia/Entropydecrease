/**
 * 3D场景全局提供器 — React Three Fiber Canvas容器
 * 作为全屏背景层：z-0 使其位于根布局 div（z-auto）之上、可接收点击，
 * 但仍低于所有 UI 浮层（标题栏 z-50 / FunctionalOverlay z-10 / 引导 z-40+）。
 * 注意：不能用负 z-index，否则会落到根 div 之后被其透明盒拦截点击。
 *
 * @ai-context: 3D 场景核心（R3F）：SceneProvider。
 */
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Preload } from '@react-three/drei';
import { PerformanceMonitor } from './PerformanceMonitor';
import { QualityController } from './QualityController';
import { MemoryManager } from './MemoryManager';
import { ContextRecovery } from './ContextRecovery';
import * as THREE from 'three';

interface SceneProviderProps {
  children: React.ReactNode;
  /** 是否允许 3D 场景接收指针事件（非模块内时为 true） */
  interactive?: boolean;
}

export function SceneProvider({ children, interactive = false }: SceneProviderProps) {
  return (
    <div className="fixed inset-0 z-0" style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      <Canvas
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
        <PerformanceMonitor />
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
