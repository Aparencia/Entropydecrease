/**
 * 内存管理器 — 定期报告 GPU 内存占用
 *
 * 说明：窗口最小化/隐藏时浏览器会自动节流 rAF（渲染自然暂停），
 * 无需在此手动跳帧。原“每 4 帧跳 3 帧”的实现（在 useFrame 内 return）
 * 并不能阻止 R3F 渲染当前帧，属无效死代码，已移除。
 *
 * @ai-context: 3D 场景核心（R3F）：MemoryManager。
 */
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

export function MemoryManager() {
  const { gl } = useThree();

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
