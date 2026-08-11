/**
 * 课前预习课表触发器 Hook（1.16）
 *
 * @ai-context: 周期扫描 localStorage 课表，开课前 30 分钟窗口内发射
 * schedule:class-upcoming 事件；每节课每天至多发射一次（内存去重）。
 * 是否展示气泡由 ProactiveEngine 的 pre-class-prep 规则决策（冷却/勿扰/频率）。
 * 在 AssistantRoot 挂载一次，与 useBedtimeReminder 同模式。
 */
import { useEffect } from 'react';
import { emitClassUpcomingIfDue } from '../lib/classSchedule';

/** 课表扫描周期（ms）：1 分钟 */
const CLASS_SCAN_INTERVAL_MS = 60 * 1000;

export function useClassScheduleTrigger(): void {
  useEffect(() => {
    // 每节课每天至多发射一次的去重表（Map<entryId, dateKey>）
    const lastEmitted = new Map<string, string>();
    const scan = () => emitClassUpcomingIfDue(new Date(), lastEmitted);
    scan(); // 挂载即扫一次（覆盖"打开应用时正处于课前窗口"的场景）
    const timer = window.setInterval(scan, CLASS_SCAN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);
}
