/**
 * 番茄钟全局计时调度器
 *
 * @ai-context: tick 驱动与页面生命周期解耦——历史缺陷：计时曾仅由 PomodoroPage
 * 组件内 setInterval 驱动，而 AppLayout 的路由切换（AnimatePresence mode="wait"）
 * 会真实卸载旧页面，导致用户切到其他模块时倒计时静默停摆。
 * 本模块以模块级 store.subscribe 监听 isRunning 翻转，保证任何页面下计时持续推进；
 * 前台恢复（visibilitychange）时立即 tick 一次，配合 store 内 endAt 墙钟校准
 * 自愈系统休眠/后台期间累积的计时误差。
 *
 * @ai-context: 纯副作用模块（无 React 依赖），由 App 启动时调用一次 startPomodoroScheduler()。
 * 测试环境不调用本函数，故不会在单测中产生游离 interval。
 */

import { usePomodoroStore } from '../store/usePomodoroStore';

const TICK_INTERVAL_MS = 1000;

/** 当前活跃的 interval 句柄（null = 计时未运行） */
let timer: ReturnType<typeof setInterval> | null = null;

/** 幂等守卫：防止重复注册订阅与监听 */
let initialized = false;

/**
 * 按 isRunning 同步 interval 生命周期（幂等）
 *
 * @ai-context: 每次调用读取最新 store 快照而非闭包值，
 * 避免订阅回调里的陈旧状态导致 interval 泄漏或重复创建。
 */
function syncTimer(): void {
  const { isRunning } = usePomodoroStore.getState();
  if (isRunning && timer === null) {
    timer = setInterval(() => usePomodoroStore.getState().tick(), TICK_INTERVAL_MS);
  } else if (!isRunning && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * 启动全局计时调度器（应用启动时调用一次，内部幂等）
 *
 * @returns void
 */
export function startPomodoroScheduler(): void {
  if (initialized) return;
  initialized = true;

  // 仅在 isRunning 翻转时同步 interval，避免其他高频状态变化（如 remainingSeconds）触发多余判断
  usePomodoroStore.subscribe((state, prevState) => {
    if (state.isRunning !== prevState.isRunning) syncTimer();
  });

  // 回前台立即校准一次：休眠/后台期间错过的时间由 endAt 墙钟吸附补齐
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      usePomodoroStore.getState().tick();
    }
  });

  // 应用启动时若已有运行中的计时（如热更新后），立即接管
  syncTimer();
}
