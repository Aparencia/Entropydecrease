/**
 * useChatStream — AI 对话流式状态 hook（v0.16.0 审查重构）。
 *
 * @ai-context: 审查发现（2026-08-30）：原实现全局单流 + 全局 streaming 态——
 *              ① 跨会话发送被静默拒绝（无提示）；② 切换会话后旧流 chunk 仍
 *              污染新会话显示（流按会话隔离，后端本就支持每会话单流）。
 *              重构为 per-session 流表（Map<sessionId, Channel>）+ 视图会话
 *              过滤：事件只在"当前展示会话"可见，旧流后台完成并落库。
 * @ai-context: 单会话单流：同会话再次发送 → return false（调用方提示）；
 *              流终态（done/aborted/failed）→ onEvent 回调（调用方刷新消息）。
 */
import { useCallback, useRef, useState } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { ChatStreamEvent, KbHit } from "../types";

/** 当前展示中的流式视图（仅 actived 会话的流可见） */
export interface ChatStreamView {
  sessionId: number;
  text: string;
  /** v0.19.1（REQ-260）：学习库命中片段（kb_hits 事件累积——本地恒可用） */
  hits: KbHit[];
}

/** 流终态事件回调（done/aborted/failed——调用方刷新该会话消息） */
export type StreamSettled = (sessionId: number, ev: ChatStreamEvent) => void;

export default function useChatStream(onSettled: StreamSettled) {
  const streams = useRef(new Map<number, Channel<ChatStreamEvent>>());
  const accs = useRef(new Map<number, string>());
  // v0.19.1（REQ-260）：每会话命中片段（kb_hits 非终态事件——与文本累积平行）
  const hitsRef = useRef(new Map<number, KbHit[]>());
  const [view, setView] = useState<ChatStreamView | null>(null);
  const viewRef = useRef<number | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  const syncView = useCallback((sessionId: number) => {
    if (viewRef.current !== sessionId) return;
    const acc = accs.current.get(sessionId) ?? "";
    const hits = hitsRef.current.get(sessionId) ?? [];
    setView(hits.length > 0 || acc !== "" ? { sessionId, text: acc, hits } : null);
  }, []);

  /** 切换展示会话（null=任务视图/无会话）——流式可见性随之切换 */
  const setActive = useCallback((sessionId: number | null) => {
    viewRef.current = sessionId;
    if (sessionId === null) {
      setView(null);
      return;
    }
    syncView(sessionId);
  }, [syncView]);

  /** 该会话是否有进行中的流 */
  const isStreaming = useCallback((sessionId: number) => streams.current.has(sessionId), []);

  /**
   * 启动流（chat_send / chat_regenerate）。
   * @returns false=该会话已有流（单会话单流）；throw=命令前置校验失败
   */
  const launch = useCallback(async (
    sessionId: number,
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<boolean> => {
    if (streams.current.has(sessionId)) return false;
    const channel = new Channel<ChatStreamEvent>();
    streams.current.set(sessionId, channel);
    accs.current.set(sessionId, "");
    hitsRef.current.set(sessionId, []);
    if (viewRef.current === sessionId) setView({ sessionId, text: "", hits: [] });
    channel.onmessage = (ev) => {
      if (ev.kind === "chunk") {
        const acc = (accs.current.get(sessionId) ?? "") + ev.delta;
        accs.current.set(sessionId, acc);
        syncView(sessionId);
        return;
      }
      if (ev.kind === "kb_hits") {
        // v0.19.1：命中列表（本地）——非终态，文本流照常累积
        hitsRef.current.set(sessionId, ev.hits);
        syncView(sessionId);
        return;
      }
      // 终态显式枚举（审查加固）：未来若新增非终态事件而此处未登记——
      // 告警忽略而不是误清流（原 else 隐含"一切未知=终态"）
      if (ev.kind !== "done" && ev.kind !== "aborted" && ev.kind !== "failed") {
        // 穷尽联合下本分支类型为 never——显式转 string 供告警展示
        const unknownKind = (ev as { kind: string }).kind;
        console.warn("[useChatStream] 未登记的事件 kind 被忽略（非终态）:", unknownKind);
        return;
      }
      // done / aborted / failed：流终态
      accs.current.delete(sessionId);
      hitsRef.current.delete(sessionId);
      streams.current.delete(sessionId);
      if (viewRef.current === sessionId) setView(null);
      onSettledRef.current(sessionId, ev);
    };
    try {
      await invoke(cmd, { ...args, sessionId, channel });
    } catch (e) {
      // 命令前置校验失败（gate/单流/参数）——清理半启动的流槽
      accs.current.delete(sessionId);
      hitsRef.current.delete(sessionId);
      streams.current.delete(sessionId);
      if (viewRef.current === sessionId) setView(null);
      throw e;
    }
    return true;
  }, [syncView]);

  /** 停止该会话流（后端置取消标志——无进行中流为 no-op） */
  const stop = useCallback((sessionId: number) => {
    void invoke("chat_cancel", { sessionId });
  }, []);

  return { view, setActive, isStreaming, launch, stop };
}
