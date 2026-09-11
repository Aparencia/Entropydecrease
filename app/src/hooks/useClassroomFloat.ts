/**
 * useClassroomFloat — 课堂助手采集浮窗状态与浮窗快捷键（批 0-C2 Task 4 步 6 自
 * ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: 浮窗三态（浮窗化 ⇄ 收起 ⇄ 解锁点击穿透）的唯一真源是 Rust
 *              （ADR-025 float_toggle_core）——本 hook 只做三件事：①挂载拉取
 *              `float_state`；②订阅 `float:state` 事件回流；③按钮与快捷键统一调
 *              `float_toggle`，前端不自行推导状态。
 * @ai-context: ★ R4 —— Ctrl+Shift+F 是**两个** window keydown 中的第二个（第一个
 *              Ctrl+Shift+S 在 useClassroomShortcuts），deps 必须逐字保持
 *              `[active, floatSnap.open, toggleFloat]` 且保留 `active && !floatSnap.open`
 *              守卫：浮窗打开期间该键已升级为 Rust 全局快捷键，主窗必须让位，
 *              否则一次按键双触发双翻转。preventDefault 位置与成对 cleanup 不变。
 * @ai-context: 副作用与边界 —— invoke `float_state` / `float_toggle`；挂载拉取带
 *              `disposed` 守卫（卸载后不 setState）；切换失败**不吞**，经
 *              `onLiveError` 写页面错误横幅（「浮窗切换失败: …」逐字保留）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { FloatSnapshot } from "./useFloatWindow";

interface Options {
  /** 采集中（未采集时 Ctrl+Shift+F 不生效——与拆分前一致） */
  active: boolean;
  /** 错误横幅写入（页面 liveError 单一状态源） */
  onLiveError: (message: string) => void;
}

export function useClassroomFloat({ active, onLiveError }: Options) {
  // v0.12.3：浮窗状态（按钮语义：浮窗化 ⇄ 收起 ⇄ 解锁穿透；Rust 单一来源）
  const [floatSnap, setFloatSnap] = useState<FloatSnapshot>({ open: false, locked: false, topmost: true });

  // v0.12.0 M6：浮窗化快捷键 Ctrl+Shift+F（采集中一键浮窗——全屏看视频不中断）
  // v0.12.6（ADR-025）：三态语义收拢到 Rust float_toggle（单一来源，防主窗键与
  // 全局快捷键双触发双翻转）——前端按钮/键只调 toggle，状态由 float:state 事件回流
  const toggleFloat = useCallback(() => {
    void invoke<FloatSnapshot>("float_toggle")
      .then(setFloatSnap)
      .catch((err) => onLiveError(`浮窗切换失败: ${err}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v0.12.3：浮窗状态同步（挂载拉取 + float:state 事件订阅——Rust 单一来源）
  useEffect(() => {
    let disposed = false;
    const unlisteners: Promise<() => void>[] = [];
    void invoke<FloatSnapshot>("float_state")
      .then((s) => {
        if (!disposed) setFloatSnap(s);
      })
      .catch(() => undefined);
    unlisteners.push(
      listen<FloatSnapshot>("float:state", (e) => {
        if (!disposed) setFloatSnap(e.payload);
      }),
    );
    return () => {
      disposed = true;
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // v0.12.6：仅浮窗关闭时生效——浮窗打开期间快捷键已升级为全局快捷键
      // （Rust 侧统一处理，语义见 float_toggle_core），此处拦截避免双触发
      if (active && !floatSnap.open && e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        e.preventDefault();
        toggleFloat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, floatSnap.open, toggleFloat]);

  return { floatSnap, toggleFloat };
}
