/**
 * 世界声景开关配置（与组件分离，保证 fast-refresh 纯组件文件）
 * World soundscape toggle helpers (separated from the component file)
 *
 * @ai-context: localStorage 持久化 + 跨组件变更广播事件。
 */

/** 声景开关 localStorage 键 */
export const WORLD_SOUNDSCAPE_KEY = 'ed-world-soundscape';
/** 开关变更广播事件名 */
export const WORLD_SOUNDSCAPE_CHANGE_EVENT = 'ed-world-soundscape-change';

export function getWorldSoundscapeEnabled(): boolean {
  try {
    return localStorage.getItem(WORLD_SOUNDSCAPE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWorldSoundscapeEnabled(on: boolean): void {
  try {
    localStorage.setItem(WORLD_SOUNDSCAPE_KEY, on ? '1' : '0');
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(WORLD_SOUNDSCAPE_CHANGE_EVENT, { detail: on }));
}
