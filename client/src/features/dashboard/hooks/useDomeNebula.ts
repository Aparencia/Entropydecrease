/**
 * useDomeNebula — 穹顶星云背景开关（响应式）
 *
 * 监听 DOME_NEBULA_CHANGE_EVENT 跨组件广播，设置页切换即时生效。
 *
 * @ai-context: 穹顶星云背景开关 Hook。
 */
import { useState, useEffect } from 'react';
import { getDomeNebulaEnabled, DOME_NEBULA_CHANGE_EVENT } from '../config/homeSchemeConfig';

export function useDomeNebula(): boolean {
  const [enabled, setEnabled] = useState(getDomeNebulaEnabled);

  useEffect(() => {
    const onChange = (e: Event) => {
      setEnabled((e as CustomEvent<boolean>).detail);
    };
    window.addEventListener(DOME_NEBULA_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(DOME_NEBULA_CHANGE_EVENT, onChange);
  }, []);

  return enabled;
}
