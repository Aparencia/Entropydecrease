/**
 * 课表存储与课前触发器（1.16 课前预习）
 * Class schedule storage & pre-class trigger
 *
 * @ai-context: 纯 localStorage 轻量课表（无后端依赖）。useClassScheduleTrigger
 * 周期扫描 findUpcomingClass，在开课前 30 分钟窗口内发射 schedule:class-upcoming，
 * 由 ProactiveEngine 的 pre-class-prep 规则决定是否展示气泡。
 * 存储结构：{ id, course, dayOfWeek(0=周日,同 JS), startMinutes(0:00 起分钟数), durationMinutes }
 */
import { assistantEventBus } from './eventBus';

/** 课表条目 */
export interface ClassEntry {
  id: string;
  /** 课程名（如「高等数学」） */
  course: string;
  /** 星期几：0=周日 ~ 6=周六（与 Date.getDay() 一致） */
  dayOfWeek: number;
  /** 上课时间：当天 0 点起的分钟数（如 8:30 → 510） */
  startMinutes: number;
  /** 课时长（分钟），仅展示用 */
  durationMinutes: number;
}

/** 即将开始的课程（触发器产物） */
export interface UpcomingClass {
  id: string;
  course: string;
  /** 距上课开始还有多少分钟（0-30） */
  startsInMinutes: number;
}

/** 课表 localStorage 键 */
export const CLASS_SCHEDULE_STORAGE_KEY = 'ed_class_schedule';

/** 课前触发时间窗（分钟）：开课前 N 分钟内发射 */
export const PRE_CLASS_LEAD_MINUTES = 30;

/** 读取课表，损坏/不可用时回退空数组 */
export function getClassSchedule(): ClassEntry[] {
  try {
    const raw = localStorage.getItem(CLASS_SCHEDULE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ClassEntry =>
        Boolean(e) &&
        typeof (e as ClassEntry).id === 'string' &&
        typeof (e as ClassEntry).course === 'string' &&
        typeof (e as ClassEntry).dayOfWeek === 'number' &&
        typeof (e as ClassEntry).startMinutes === 'number',
    );
  } catch {
    return [];
  }
}

/** 保存课表（整体覆盖） */
export function saveClassSchedule(entries: ClassEntry[]): void {
  try {
    localStorage.setItem(CLASS_SCHEDULE_STORAGE_KEY, JSON.stringify(entries));
  } catch { /* localStorage 不可用时静默——课前触发降级为不可用 */ }
}

/**
 * 查找即将开始的课程：当前时间处于开课前 PRE_CLASS_LEAD_MINUTES 窗口内。
 * 纯函数（now 注入），返回 null 表示当前无临近课程。
 */
export function findUpcomingClass(now: Date): UpcomingClass | null {
  const dayOfWeek = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const entry of getClassSchedule()) {
    if (entry.dayOfWeek !== dayOfWeek) continue;
    const lead = entry.startMinutes - nowMinutes;
    if (lead >= 0 && lead <= PRE_CLASS_LEAD_MINUTES) {
      return { id: entry.id, course: entry.course, startsInMinutes: lead };
    }
  }
  return null;
}

/** 每节课每天至多发射一次的去重键（防止周期扫描重复触发） */
export function classTriggerKey(entryId: string, now: Date): string {
  const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  return `${entryId}-${date}`;
}

/** 由周期扫描调用：命中触发窗口则发射事件（内部去重） */
export function emitClassUpcomingIfDue(
  now: Date,
  lastEmitted: Map<string, string>,
): UpcomingClass | null {
  const upcoming = findUpcomingClass(now);
  if (!upcoming) return null;
  const key = classTriggerKey(upcoming.id, now);
  if (lastEmitted.get(upcoming.id) === key) return null;
  lastEmitted.set(upcoming.id, key);
  assistantEventBus.emit('schedule:class-upcoming', {
    currentHour: now.getHours(),
    upcomingClass: upcoming,
  });
  return upcoming;
}
