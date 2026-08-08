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
 * 调度策略（setTimeout 链而非 setInterval）：
 * - 秒边界对齐：下一次 tick 延迟 = 距下一个整秒的毫秒数，UI 更新始终落在真实秒边界，
 *   避免 setInterval 累积漂移导致显示值与墙钟持续错位；
 * - 终点准点：距 endAt 不足 1s 时缩短轮询间隔（下限 50ms），阶段完成在墙钟归零时
 *   立即触发，不再等到下一个整秒 tick（原 setInterval 下完成误差可达 ~1s）；
 * - 同秒幂等：tick 内部按 wallRemaining 与 remainingSeconds 同值短路，
 *   终点附近密集轮询不会产生多余 store 更新。
 *
 * @ai-context: 纯副作用模块（无 React 依赖），由 App 启动时调用一次 startPomodoroScheduler()。
 * 测试环境不调用本函数，故不会在单测中产生游离 interval。
 */

import { usePomodoroStore } from '../store/usePomodoroStore';

/** 常规 tick 间隔（对齐秒边界） */
const TICK_INTERVAL_MS = 1000;
/** 终点附近的最小轮询间隔：保证阶段完成准点且不密集空转 */
const MIN_TICK_MS = 50;

/** 当前活跃的调度句柄（null = 计时未运行） */
let timer: ReturnType<typeof setTimeout> | null = null;

/** 幂等守卫：防止重复注册订阅与监听 */
let initialized = false;

/**
 * 计算下一次 tick 的延迟（ms）
 *
 * @ai-context: 每次调用读取最新 store 快照而非闭包值，
 * 避免订阅回调里的陈旧状态导致调度泄漏或重复创建。
 */
function nextDelayMs(): number {
  const { isRunning, endAt } = usePomodoroStore.getState();
  if (!isRunning) return 0; // 不应被调度（syncTimer 会拦截）
  if (endAt == null) return TICK_INTERVAL_MS; // 无墙钟锚点：常规节奏
  const untilEnd = endAt - Date.now();
  if (untilEnd <= 0) return MIN_TICK_MS; // 已过期：尽快触发完成
  if (untilEnd < TICK_INTERVAL_MS) return Math.max(MIN_TICK_MS, untilEnd);
  // 对齐系统秒边界：在整秒边界附近触发，避免 setInterval 漂移累积
  const intoSecond = Date.now() % 1000;
  return intoSecond === 0 ? TICK_INTERVAL_MS : TICK_INTERVAL_MS - intoSecond;
}

/** 链式调度下一次 tick（仅 isRunning 时继续，否则清空句柄） */
function scheduleNextTick(): void {
  const { isRunning } = usePomodoroStore.getState();
  if (!isRunning) {
    timer = null;
    return;
  }
  timer = setTimeout(() => {
    usePomodoroStore.getState().tick();
    scheduleNextTick();
  }, nextDelayMs());
}

/** 按 isRunning 同步调度生命周期（幂等） */
function syncTimer(): void {
  const { isRunning } = usePomodoroStore.getState();
  if (isRunning && timer === null) {
    scheduleNextTick();
  } else if (!isRunning && timer !== null) {
    clearTimeout(timer);
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

  // 仅在 isRunning 翻转时同步调度，避免其他高频状态变化（如 remainingSeconds）触发多余判断
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
