/**
 * useAiTaskPolling — AI 异步任务轮询/事件双通道通用 hook（M8 去重抽取）。
 *
 * @ai-context: EnrichPanel（知识补充）与 AiRefineCard（AI 精修）共用同一套
 *              任务跟踪模式：1500ms 轮询 ai_refine_status + ai:task-update
 *              事件双通道 + 30s 无进展卡住检测 + handleState ref 防闭包过期。
 *              2026-08-21 前端审查 M8 抽为共用 hook，两组件行为保持等价。
 * @ai-context: 终态（Succeeded/Failed）由 hook 统一停止轮询后再派发——组件
 *              侧 handleState 不再需要持有 stopPolling（消除构造期循环依赖）。
 * @ai-context: 卡住检测口径：仅 Pending 计入 30s 窗口，任何进展刷新时间戳；
 *              触发时 hook 先清空 taskIdRef（隔离旧任务后续事件）再回调 onStuck。
 */
import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AiTaskState } from "../types";

/** 轮询间隔（ms）——与原两组件实现一致 */
const POLL_INTERVAL_MS = 1500;
/** 卡住判定窗口（ms）——任务持续 Pending 超过此时长视为未启动/后台卡死 */
const STUCK_THRESHOLD_MS = 30_000;

/** 任务是否处于终态（成功或失败）——终态后轮询停止 */
function isTerminal(st: AiTaskState): boolean {
  return st === "Succeeded" || (typeof st === "object" && st !== null && "Failed" in st);
}

export interface UseAiTaskPolling {
  /** 当前任务 id（ref 持有——事件/轮询回调跨渲染读取，避免闭包过期） */
  taskIdRef: React.MutableRefObject<number | null>;
  /** 启动轮询（自动停掉已有轮询）；同时重置卡住检测时间戳 */
  startPolling: (taskId: number) => void;
  /** 停止轮询（卸载时 hook 自动调用） */
  stopPolling: () => void;
}

/**
 * @param handleState 状态派发回调（每次轮询/事件命中的最新状态 + 当前 taskId）——
 *                    hook 内部经 ref 镜像，组件无需关心闭包过期；taskId 以
 *                    参数传入（而非组件读 ref），避免 handleState 与 hook 返
 *                    回值的构造期循环依赖
 * @param onStuck     30s 卡住回调——组件侧负责 UI 复位（phase/msg/taskId 状态）
 */
export function useAiTaskPolling(
  handleState: (st: AiTaskState, taskId: number | null) => void | Promise<void>,
  onStuck: () => void,
): UseAiTaskPolling {
  const taskIdRef = useRef<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ref 镜像最新回调——事件订阅与 interval 只创建一次，回调永不过期
  const handleStateRef = useRef(handleState);
  const onStuckRef = useRef(onStuck);
  const lastChangeRef = useRef(0);

  useEffect(() => {
    handleStateRef.current = handleState;
  }, [handleState]);
  useEffect(() => {
    onStuckRef.current = onStuck;
  }, [onStuck]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 事件通道（ai:task-update）——与轮询双通道，事件优先即时；订阅一次，
  // 仅处理当前 taskId 的事件（其余任务/旧任务事件忽略）
  useEffect(() => {
    const un = listen<[number, AiTaskState]>("ai:task-update", (e) => {
      if (e.payload[0] !== taskIdRef.current) return;
      // 终态事件同样先停轮询再派发——与轮询路径口径一致
      if (isTerminal(e.payload[1])) stopPolling();
      void handleStateRef.current(e.payload[1], taskIdRef.current);
    });
    return () => {
      un.then((off) => off());
    };
  }, [stopPolling]);

  // 组件卸载时停止轮询——否则 interval 持续 invoke 并对已卸载组件 setState
  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (id: number) => {
      stopPolling();
      lastChangeRef.current = Date.now();
      pollingRef.current = setInterval(async () => {
        const st = await invoke<AiTaskState>("ai_refine_status", { taskId: id }).catch(() => null);
        if (st) {
          // 状态有进展（Running/Succeeded/Failed）→ 刷新时间戳；仅 Pending 计入卡住窗口
          if (st !== "Pending") lastChangeRef.current = Date.now();
          if (isTerminal(st)) stopPolling();
          void handleStateRef.current(st, taskIdRef.current);
        }
        // 卡住检测：长时间仍 Pending = 任务未启动或后台卡死（tauri 终端看 [refine-task] 日志）
        if (Date.now() - lastChangeRef.current > STUCK_THRESHOLD_MS) {
          stopPolling();
          taskIdRef.current = null; // 隔离旧任务后续事件
          onStuckRef.current();
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling],
  );

  return { taskIdRef, startPolling, stopPolling };
}
