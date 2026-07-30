/**
 * @ai-context: pomodoro 功能模块状态管理：usePomodoroPersistence。
 */
import { pomodoroSettingsStore, pomodoroSessionStore } from '@/lib/storage';
import { createWithLog } from '@/lib/storage/writeWithLog';
import type { PomodoroSession, PomodoroSettings } from '@/types/models';
import { playBeep } from '@/utils/sound';

const SETTINGS_ID = 'default';
const BEEP_FREQUENCY_HZ = 800;
const BEEP_DURATION_SHORT_MS = 200;
const BEEP_DURATION_LONG_MS = 1000;
const BEEP_FREQUENCY_LOW_HZ = 220;

/**
 * 从 IndexedDB 加载番茄钟设置
 */
export async function loadSettings(): Promise<PomodoroSettings | null> {
  const existing = await pomodoroSettingsStore.getById(SETTINGS_ID);
  if (existing) return existing;

  const all = await pomodoroSettingsStore.getAll();
  return all.length > 0 ? all[0] : null;
}

/**
 * 保存番茄钟设置到 IndexedDB（固定 id=1，存在则更新，不存在则创建）
 */
export async function saveSettings(settings: Omit<PomodoroSettings, 'id'>): Promise<void> {
  const existing = await pomodoroSettingsStore.getById(SETTINGS_ID);
  if (existing) {
    await pomodoroSettingsStore.update(SETTINGS_ID, settings);
  } else {
    await pomodoroSettingsStore.create({ ...settings, id: SETTINGS_ID } as PomodoroSettings);
  }
}

/**
 * 记录一次番茄钟会话
 */
export async function recordSession(
  session: Omit<PomodoroSession, 'id'>,
): Promise<void> {
  await createWithLog(pomodoroSessionStore, 'pomodoroSessions', session);
}

/**
 * 播放阶段完成提示音（复用全局声音工具）
 */
export function playCompletionSound(): void {
  playBeep(BEEP_FREQUENCY_HZ, BEEP_DURATION_SHORT_MS);
  setTimeout(() => playBeep(BEEP_DURATION_LONG_MS, BEEP_DURATION_SHORT_MS), BEEP_FREQUENCY_LOW_HZ);
}

/**
 * 发送浏览器通知（Web Notification API）
 */
export async function sendNotification(title: string, body: string): Promise<void> {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.svg' });
  }
}

