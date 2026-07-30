/**
 * 萤火海沟 — 球体展开/收缩 Hook
 * @ai-context 管理球群中单个球体的展开状态。
 * 同一时刻最多一个球体展开，点击外部区域自动收缩。
 * 副作用：useEffect 监听 document click 事件。
 */

import { useState, useEffect, useCallback } from 'react';

export function useOrbExpand() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** 展开指定球体，同时自动收缩其他球体（单态约束） */
  const expandOrb = useCallback((id: string) => {
    setExpandedId(id);
  }, []);

  /** 收缩当前展开的球体 */
  const collapseOrb = useCallback(() => {
    setExpandedId(null);
  }, []);

  /**
   * 点击外部自动收缩
   * @ai-context 通过 document 层捕获点击事件，如果目标不在展开卡片内则收缩。
   * 副作用：全局 document 事件监听，仅在 expandedId !== null 时激活。
   */
  useEffect(() => {
    if (expandedId === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      /* data-orb-expanded 属性标记展开卡片根节点，点击卡片内部不触发收缩 */
      if (!target.closest('[data-orb-expanded]')) {
        setExpandedId(null);
      }
    };

    // 延迟注册，避免当前点击事件立即触发收缩
    const timerId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, { capture: true });
    }, 0);

    return () => {
      clearTimeout(timerId);
      document.removeEventListener('click', handleClickOutside, { capture: true });
    };
  }, [expandedId]);

  return { expandedId, expandOrb, collapseOrb };
}
