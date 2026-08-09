/**
 * 渲染上下文恢复 — 监听 WebGPU/WebGL 上下文丢失并自动重建
 *
 * WebGPURenderer 使用 GPUDevice，其 lost 事件通过 Promise 异步触发；
 * WebGL 回退模式使用 webglcontextlost 事件。
 * 两种场景均通过 onContextLost 回调通知上层做重建或降级处理。
 *
 * @ai-context: 3D 场景核心（R3F）：ContextRecovery（WebGPU 兼容版）。
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';

export function ContextRecovery({ onContextLost }: { onContextLost?: () => void }) {
  const { gl } = useThree();
  const [, setContextLost] = useState(false);

  useEffect(() => {
    const canvas = gl.domElement;
    let cleanup: (() => void) | null = null;

    // 尝试检测 WebGPU 后端：访问 backend.device（GPUDevice）并监听 lost 事件
    const gpuBackend = (gl as unknown as { backend?: { device?: { lost: Promise<GPUDeviceLostInfo> } } }).backend;
    const gpuDevice = gpuBackend?.device;

    if (gpuDevice) {
      // WebGPU 模式：GPUDevice.lost 是一个 Promise，resolve 时表示设备丢失
      let lostResolved = false;
      gpuDevice.lost.then((reason: GPUDeviceLostInfo) => {
        if (lostResolved) return;
        lostResolved = true;
        setContextLost(true);
        console.error('[GPU] Device lost - reason:', reason?.reason ?? 'unknown');
        onContextLost?.();
      }).catch(() => {
        // 忽略 lost Promise 本身的异常
      });
      cleanup = () => { lostResolved = true; };
    } else {
      // WebGL 回退模式：监听 canvas 的 webglcontextlost 事件
      const handleLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
        console.error('[WebGL] Context lost - will attempt recovery');
        onContextLost?.();
      };

      const handleRestored = () => {
        setContextLost(false);
        console.log('[WebGL] Context restored');
        // 强制重新编译所有着色器
        try {
          const info = (gl as any).info;
          if (info?.programs) {
            // WebGLRenderer 旧 info 结构：info.programs 为数组
            (info.programs as Array<{ destroy?: () => void }>)?.forEach((program) => {
              program?.destroy?.();
            });
          }
        } catch {
          // 静默忽略
        }
      };

      canvas.addEventListener('webglcontextlost', handleLost);
      canvas.addEventListener('webglcontextrestored', handleRestored);

      cleanup = () => {
        canvas.removeEventListener('webglcontextlost', handleLost);
        canvas.removeEventListener('webglcontextrestored', handleRestored);
      };
    }

    return () => { cleanup?.(); };
  }, [gl, onContextLost]);

  return null;
}