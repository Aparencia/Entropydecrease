/**
 * 课堂助手启动偏好持久化（P0-3 启动流程简化）
 *
 * @ai-context: 记住用户上次选择的采集路径（capturePath）与录制模式（mode），
 * 下次进入课堂页自动恢复，免去每次重新选择（验收：选窗 1 次 + 启动 1 次）。
 * @ai-context: 克隆 audioSourcePreference 范式——localStorage 读写全程
 * try/catch 静默降级，加载时校验枚举合法性，任一字段非法整体回落默认
 * （smart + mixed，与 useClassroomCapture 初始默认一致）。
 * @ai-context: Clones the audioSourcePreference pattern — silent fallback on
 * any storage failure; invalid values fall back to defaults, never block launch.
 */

import type { CaptureMode, CapturePath } from '@/lib/capture';

export interface ClassroomLaunchPref {
  capturePath: CapturePath;
  mode: CaptureMode;
}

/** localStorage key（keban_ 前缀保跨版本兼容，不可改名） */
export const CLASSROOM_LAUNCH_PREF_KEY = 'keban_classroom_launch_pref';

/** 默认启动偏好：与 useClassroomCapture 的初始状态一致 */
export const DEFAULT_LAUNCH_PREF: ClassroomLaunchPref = {
  capturePath: 'smart',
  mode: 'mixed',
};

const VALID_PATHS: readonly CapturePath[] = ['fine', 'smart', 'full_record'];
const VALID_MODES: readonly CaptureMode[] = ['vision', 'audio', 'mixed'];

/** 读取启动偏好；缺失/损坏/非法值均静默回落默认（smart + mixed） */
export function loadLaunchPref(): ClassroomLaunchPref {
  try {
    const raw = localStorage.getItem(CLASSROOM_LAUNCH_PREF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClassroomLaunchPref>;
      if (
        VALID_PATHS.includes(parsed.capturePath as CapturePath) &&
        VALID_MODES.includes(parsed.mode as CaptureMode)
      ) {
        return { capturePath: parsed.capturePath as CapturePath, mode: parsed.mode as CaptureMode };
      }
    }
  } catch { /* 静默降级 */ }
  return DEFAULT_LAUNCH_PREF;
}

/** 保存启动偏好；写入失败静默降级，不抛错 */
export function saveLaunchPref(pref: ClassroomLaunchPref): void {
  try {
    localStorage.setItem(CLASSROOM_LAUNCH_PREF_KEY, JSON.stringify(pref));
  } catch { /* 静默降级 */ }
}
