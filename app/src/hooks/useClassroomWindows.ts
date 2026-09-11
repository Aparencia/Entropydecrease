/**
 * useClassroomWindows — 课堂助手目标窗口/进程枚举与选中态（批 0-C2 Task 4 步 5 自
 * ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: 职责 = `list_windows` 枚举 + 选中窗口：首挂载自动枚举一次，供左栏
 *              窗口选择卡（含"系统窗口"过滤开关）与右栏档案检测消费；刷新入参
 *              `background=true` 时不动 loading（列表内手动刷新不闪加载态）。
 * @ai-context: 副作用与边界 —— 挂载时一次 invoke；枚举失败**不吞**，以
 *              「窗口枚举失败: …」写回页面状态行（`onStatus`：页面 status 单一
 *              状态源，D5）。本 hook 不订阅事件、不持有列宽/折叠（属 useColumnLayout），
 *              也不管采集目标锁（G7「采集中仍可改选窗口」是既有缺陷，只搬不改）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WindowInfo } from "../types";

export function useClassroomWindows(onStatus: (message: string) => void) {
  // ── 窗口/进程选择 ──
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [selectedWindow, setSelectedWindow] = useState<WindowInfo | null>(null);
  const [windowsLoading, setWindowsLoading] = useState(false);

  const refreshWindows = useCallback(async (background = false) => {
    if (!background) setWindowsLoading(true);
    try {
      const list = await invoke<WindowInfo[]>("list_windows");
      setWindows(list);
    } catch (e) {
      onStatus(`窗口枚举失败: ${e}`);
    } finally {
      if (!background) setWindowsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 首次进入自动枚举一次窗口
  useEffect(() => {
    void refreshWindows();
  }, [refreshWindows]);

  return { windows, selectedWindow, setSelectedWindow, windowsLoading, refreshWindows };
}
