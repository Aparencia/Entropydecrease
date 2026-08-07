/**
 * 首页穹顶星云背景开关配置（与组件分离，保证 fast-refresh 纯组件文件）
 *
 * domeNebula 控制穹顶世界（light）的云层/星云背景层次开关：
 * 关闭后穹顶方案退化为纯净晨光渐变（宪法第二条 §5：觉察是镜子，用户有权移开视线）。
 *
 * @ai-context: localStorage 持久化 + 跨组件变更广播事件。
 */

/** 穹顶星云开关 localStorage 键 */
export const DOME_NEBULA_KEY = 'ed-dome-nebula';
/** 开关变更广播事件名 */
export const DOME_NEBULA_CHANGE_EVENT = 'ed-dome-nebula-change';

export function getDomeNebulaEnabled(): boolean {
  try {
    return localStorage.getItem(DOME_NEBULA_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setDomeNebulaEnabled(on: boolean): void {
  try {
    localStorage.setItem(DOME_NEBULA_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(DOME_NEBULA_CHANGE_EVENT, { detail: on }));
}
