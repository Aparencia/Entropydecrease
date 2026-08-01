/**
 * @ai-context: 深海/穹顶双世界主题切换 Hook，与 useSceneTheme 3D 侧联动。
 * v0.28 修复：原实现为普通 useState，被 App/Navbar/Sidebar/AppearanceSettings
 * 独立调用产生 4 个互不同步的实例，各自 effect 覆写 data-theme，导致
 * 页面主题“有时亮有时暗”。现委托给 useThemeStore（Zustand 单一状态源），
 * API 保持不变，消费方无需修改。
 */
import { useThemeStore } from '@/stores/useThemeStore';

export function useTheme() {
  const theme = useThemeStore(s => s.theme);
  const toggleTheme = useThemeStore(s => s.toggleTheme);
  const setTheme = useThemeStore(s => s.setTheme);
  return { theme, toggleTheme, setTheme };
}
