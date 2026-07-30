/**
 * 渲染进程入口：挂载 React 树并注册 Service Worker
 *
 * @ai-context: 仅做启动装配。StrictMode 在开发期会双调用 effect，
 * 涉及 Worker/AudioContext 的模块须自行幂等（见各模块注释）。
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/performance.css'
import App from './App.tsx'

// 全局拦截原生右键菜单（白名单区域除外）
document.addEventListener('contextmenu', (e: MouseEvent) => {
  if (e.defaultPrevented) return;
  const target = e.target as HTMLElement;
  const whitelist = ['.ProseMirror', '[contenteditable]', 'input', 'textarea'];
  const isWhitelisted = whitelist.some((sel) => target.closest(sel));
  const isAllowed = target.closest('[data-allow-context-menu]');
  if (!isWhitelisted && !isAllowed) {
    e.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
