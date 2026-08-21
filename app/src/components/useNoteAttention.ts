/**
 * useNoteAttention — A6 注意力跟踪（v0.10.0）。
 *
 * @ai-context: 纯前端统计：记录用户进入/离开笔记阅读视图的时间戳与停留时长，
 *              目前通过 console.debug 输出，未来可扩展为 session_event 落库
 *              或本地存储持久化，为元认知仪表盘（P14）积累数据。
 * @ai-context: 不阻塞主交互、不污染数据库 schema、组件卸载时自动上报。
 */
import { useEffect, useRef } from "react";

interface AttentionRecord {
  noteId: number;
  noteTitle: string;
  enteredAt: number;
  durationMs: number;
}

const MAX_RECORDS = 200;
let records: AttentionRecord[] = [];

/** 上报当前会话的注意力记录（后续可接 session_event / localStorage） */
function flushRecords() {
  if (records.length === 0) return;
  // 未来：通过 invoke 写入 session_event 或 localStorage 持久化
  // 目前通过 console.debug 输出，不影响主链路
  console.debug("[attention] 笔记注意力记录:", records);
  records = [];
}

/**
 * 周期刷新：每 60s 清一次缓冲区。
 * 应用级单例，无需清理：flushTimer 是模块级唯一定时器（ensureFlushTimer
 * 幂等守卫），生命周期与应用一致而非随组件卸载——若随组件清理，多实例
 * 挂载/卸载会反复重建定时器且最后一个卸载者误清全局导致缓冲永不上报。
 */
let flushTimer: ReturnType<typeof setInterval> | null = null;
function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushRecords();
  }, 60000);
}

export function useNoteAttention(noteId: number | null, noteTitle: string) {
  const enterRef = useRef<number>(Date.now());

  useEffect(() => {
    if (noteId == null) return;
    enterRef.current = Date.now();
    return () => {
      const duration = Date.now() - enterRef.current;
      if (duration < 1000) return; // <1s 跳过噪声
      records.push({
        noteId,
        noteTitle: noteTitle.slice(0, 50),
        enteredAt: enterRef.current,
        durationMs: duration,
      });
      if (records.length >= MAX_RECORDS) flushRecords();
    };
  }, [noteId, noteTitle]);
}

// 初始化定时器（应用级单例：模块导入时启动一次，无需清理——与
// flushTimer 同生命周期，页面关闭前由下方 beforeunload 完成末次上报）
ensureFlushTimer();

// 页面卸载前尝试上报（beforeunload 监听同样为应用级单例，无需移除）
window.addEventListener?.("beforeunload", () => flushRecords());