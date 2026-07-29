/**
 * WebGL上下文丢失恢复 — 监听context lost事件并自动重建
 *
 * @ai-context: 3D 场景核心（R3F）：ContextRecovery。
 */
import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';

export function ContextRecovery({ onContextLost }: { onContextLost?: () => void }) {
  const { gl } = useThree();
  const [, setContextLost] = useState(false);

  useEffect(() => {
    const canvas = gl.domElement;

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
      // three 的 WebGLProgram 未导出精确类型，此处仅需 destroy 能力，用结构类型约束
      gl.info.programs?.forEach((program: { destroy?: () => void }) => {
        program?.destroy?.();
      });
    };

    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, [gl, onContextLost]);

  return null;
}
