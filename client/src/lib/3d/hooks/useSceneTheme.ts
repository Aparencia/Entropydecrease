/**
 * 监听主题变化，返回当前应使用的3D场景类型
 *
 * @ai-context: 双世界主题（深海/穹顶）场景切换 Hook。
 */
import { useState, useEffect } from 'react';

export type SceneTheme = 'deep-sea' | 'aurora-dome';

export function useSceneTheme(): SceneTheme {
  const [theme, setTheme] = useState<SceneTheme>(() => {
    const el = document.documentElement;
    return el.getAttribute('data-theme') === 'dark' ? 'deep-sea' : 'aurora-dome';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const el = document.documentElement;
      const isDark = el.getAttribute('data-theme') === 'dark';
      setTheme(isDark ? 'deep-sea' : 'aurora-dome');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}
