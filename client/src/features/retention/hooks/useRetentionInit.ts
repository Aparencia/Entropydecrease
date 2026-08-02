/**
 * 留存机制初始化 Hook
 * Retention mechanism initialization hook
 *
 * @ai-context: 在应用启动时按顺序初始化所有留存 store：
 * 1. 先加载用户设置（开关状态），再根据开关决定后续初始化
 * 2. 加载珊瑚生态数据（含白化检查）
 * 3. 加载深海发现历史计数
 * 放在 App.tsx 的 Provider 内、路由外调用，确保全局生效。
 *
 * @ai-context: Initializes all retention stores on app startup in order:
 * 1. Load user settings (toggles), then decide subsequent init based on toggles
 * 2. Load coral ecosystem data (with bleaching check)
 * 3. Load deep-sea discovery historical count
 * Called inside Providers, outside router, in App.tsx for global effect.
 */
import { useEffect, useRef } from 'react';
import { useRetentionSettings } from '../store/useRetentionSettings';
import { useEcosystemStore } from '../store/useEcosystemStore';
import { useDiscoveryStore } from '../store/useDiscoveryStore';

/**
 * 留存机制全局初始化
 * 在应用挂载时调用一次，按依赖顺序初始化三个 store
 */
export function useRetentionInit() {
  const initialized = useRef(false);

  useEffect(() => {
    // 防止 React StrictMode 下重复初始化
    if (initialized.current) return;
    initialized.current = true;

    (async () => {
      try {
        // 第一步：加载留存设置（开关状态），其他 store 依赖此配置决定是否启用
        const settings = useRetentionSettings.getState();
        await settings.initialize();

        // 第二步：加载珊瑚生态数据（含白化检查 + 累计深度计算）
        // 即使总开关关闭也初始化数据，以便用户重新打开时立即可见
        await useEcosystemStore.getState().initialize();

        // 第三步：加载深海发现历史计数
        await useDiscoveryStore.getState().initialize();
      } catch {
        // 留存系统初始化失败不应阻塞主应用，静默降级
        console.warn('[Retention] 初始化失败，留存功能已降级');
      }
    })();
  }, []);
}
