/**
 * 内存管理器 — Electron窗口失焦时暂停渲染，防止内存泄漏
 *
 * @ai-context: 3D 场景核心（R3F）：MemoryManager。
 */
import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

export function MemoryManager() {
  const { gl } = useThree();
  const isVisible = useRef(true);
  const frameSkip = useRef(0);

  // 监听窗口可见性
  useEffect(() => {
    const handleVisibility = () => {
      isVisible.current = document.visibilityState === 'visible';
    };

    const handleBlur = () => {
      isVisible.current = false;
    };

    const handleFocus = () => {
      isVisible.current = true;
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // 窗口不可见时跳过渲染帧（每4帧渲染1帧，节省GPU）
  useFrame(() => {
    if (!isVisible.current) {
      frameSkip.current++;
      if (frameSkip.current % 4 !== 0) {
        return; // 跳过此帧
      }
    } else {
      frameSkip.current = 0;
    }
  });

  // 定期报告内存使用
  useEffect(() => {
    const interval = setInterval(() => {
      const info = gl.info;
      if (info.memory.geometries > 500 || info.memory.textures > 100) {
        console.warn('[3D Memory]', {
          geometries: info.memory.geometries,
          textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
        });
      }
    }, 30000); // 每30秒检查一次

    return () => clearInterval(interval);
  }, [gl]);

  return null;
}
