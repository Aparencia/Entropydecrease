/**
 * StaleSessionRecoveryBar — 「结束会话」的恢复通道（批 7 T20 · §9 #39）。
 *
 * @ai-context Why 需要它：`finish_session` 今天**零调用点** ⇒ 崩溃/管线中断后卡在 `recording` 的会话
 *   **没有 UI 出口**（只能靠后端 `mark_stale_recording` 兜底）。规格 §9 的处置逐字是「恢复动作
 *   『结束会话』（崩溃后卡在录制态的收尾通道）」。
 * @ai-context 🔴 触发条件**必须是机器可判的**（计划的硬要求，不许「先接上再说」）：
 *   我们手里**还有**一个会话 id（`sessionId != null`）**而后端 `live_session_status.active === false`**
 *   ⇒ 「前端认为这场还在，后端已经没有活动会话」= 传输/引擎链路已经掉了，会话卡在录制态。
 *   ⚠️ **口径偏离（逐字登记，见报告 §6）**：计划写的是「`live_session_status` 返回 **active 但无心跳**」，
 *   而该命令的实际返回**没有心跳字段**（`commands_live.rs:277`：`active` / `session_id` / `prepared` /
 *   `paused` / `paused_reason` / `tier`）⇒ 「active 但无心跳」**不可实现**；本件取计划括注里的
 *   另一条授权口径「**或前端已知 stale**」，并用「UI 持有 id ∧ 后端 active=false」表达它。
 * @ai-context 冻结键口径（C9.12）：新文件 ⇒ 六棘轮零字面量（按钮 = `Button`、错误行 = `StatusLine`、
 *   排版 = `Text`）；**不用 `EmptyState`**（`emptyStateRatchet` 余量集逐文件冻结）。
 * 副作用：挂载时一次 `invoke("live_session_status")`（只读）+ 用户点击时一次
 *   `invoke("finish_session", { id })`。边界：① `sessionId === null` ⇒ **不查询、不渲染**（干净挂载）；
 *   ② 查询失败 ⇒ **不渲染**（宁可不出，也不在没有依据时给一个「结束会话」的危险入口）；
 *   ③ 成功后回调宿主刷新（本件不自己写会话列表的 state）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, StatusLine, Text } from "../ui/primitives";

/** 后端 `live_session_status` 的返回（`commands_live.rs:277` 逐字字段；无心跳字段） */
interface LiveSessionStatus {
  readonly active: boolean;
  readonly session_id: number | null;
}

export default function StaleSessionRecoveryBar({ sessionId, onRecovered }: {
  /** 前端当前持有的会话 id（null ⇒ 本件什么都不做） */
  readonly sessionId: number | null;
  /** 收尾成功后的回调（宿主重拉会话/状态；本件不猜宿主的状态源） */
  readonly onRecovered: () => void;
}) {
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const probe = useCallback(async (): Promise<void> => {
    if (sessionId === null) {
      setStale(false);
      return;
    }
    try {
      const st = await invoke<LiveSessionStatus>("live_session_status");
      setStale(st.active === false);
    } catch {
      setStale(false); // 查询失败 ⇒ 不出危险入口（边界②）
    }
  }, [sessionId]);

  useEffect(() => {
    void probe();
  }, [probe]);

  const finish = async (): Promise<void> => {
    if (sessionId === null) return;
    setBusy(true);
    setErr("");
    try {
      await invoke<boolean>("finish_session", { id: sessionId });
      setStale(false);
      onRecovered();
    } catch (e) {
      setErr(`结束会话失败: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // 🔴 机器可判的两个门：手里有 id ∧ 后端已无活动会话。两条都不满足 ⇒ 一个字都不渲染。
  if (!stale || sessionId === null) return null;
  return (
    <div data-testid="stale-session-recovery">
      <Text as="p" size={5} tone="ink-3" style={{ margin: "6px 0 2px" }}>
        会话 #{sessionId} 仍停在「录制中」，但后端已无活动采集 ⇒ 它需要收尾。
      </Text>
      {err !== "" && <StatusLine kind="error" testId="stale-session-error">{err}</StatusLine>}
      <Button size="sm" variant="secondary" busy={busy} onClick={() => void finish()} title="把这场会话标记为已结束（保留已落库的转写与画面）">
        {busy ? "收尾中…" : "⏹ 结束会话"}
      </Button>
    </div>
  );
}
