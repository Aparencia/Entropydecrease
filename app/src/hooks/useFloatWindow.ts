/**
 * useFloatWindow — 浮窗窗口行为 hook（v0.12.3 交互层）。
 *
 * @ai-context: 负责浮窗窗口级行为：状态（open/locked/topmost）与 Rust 侧
 *              float:state 事件同步（单一来源）；拖拽（startDragging）+
 *              移动结束后边缘吸附 + 位置持久化（localStorage）；面板/字幕条
 *              双形态切换（Esc 快捷键）；点击穿透锁定/解锁；置顶开关；
 *              不透明度调节。纯几何逻辑在 utils/floatWindow.ts（可单测）。
 * @ai-context: 锁定态下浮窗自身不可点，解锁路径在主窗（按钮/快捷键）——
 *              float_set_locked(false) 由主窗发起后经事件回流本窗。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, PhysicalPosition, LogicalSize } from "@tauri-apps/api/window";
import {
  clampToWorkArea,
  clampOpacity,
  loadFloatPrefs,
  saveFloatPrefs,
  snapToEdge,
  type FloatMode,
} from "../utils/floatWindow";

/** Rust FloatUiView（camelCase 契约） */
export interface FloatSnapshot {
  open: boolean;
  locked: boolean;
  topmost: boolean;
}

/** 拖拽结束后的吸附去抖（ms）——onMoved 拖动期间连续触发，合并为一次 */
const MOVE_FINALIZE_DEBOUNCE_MS = 250;

export function useFloatWindow() {
  // 惰性一次读取（审查 MED-1：useRef(loadFloatPrefs()) 每渲染求值——
  // 浮窗 1s tick 重渲染时等价于每秒 localStorage 读 + JSON.parse）
  const [initialPrefs] = useState(loadFloatPrefs);
  const prefsRef = useRef(initialPrefs);
  const [snapshot, setSnapshot] = useState<FloatSnapshot>({
    open: true,
    locked: false,
    topmost: prefsRef.current.topmost,
  });
  const [mode, setMode] = useState<FloatMode>(prefsRef.current.mode);
  const [opacity, setOpacityState] = useState(prefsRef.current.opacity);
  const moveTimerRef = useRef<number | undefined>(undefined);

  // 挂载兜底：拉取一次状态 + 订阅 float:state 事件（Rust 单一来源）
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void invoke<FloatSnapshot>("float_state")
      .then((s) => {
        if (disposed) return;
        setSnapshot(s);
        prefsRef.current = { ...prefsRef.current, topmost: s.topmost };
      })
      .catch(() => undefined);
    void listen<FloatSnapshot>("float:state", (e) => {
      setSnapshot(e.payload);
      prefsRef.current = { ...prefsRef.current, topmost: e.payload.topmost };
    }).then((fn) => {
      // 审查修复：listen 异步 resolve——若卸载已发生立即释放，
      // 否则存入 ref 供卸载时调用（原实现仅 disposed 分支释放，热重载/StrictMode 会泄漏）
      if (disposed) void fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // 挂载：应用上次位置（钳制到工作区，防多屏变化后窗口"丢失"）
  useEffect(() => {
    const pos = prefsRef.current.pos;
    if (!pos) return;
    void (async () => {
      try {
        const win = getCurrentWindow();
        const monitor = await currentMonitor();
        const size = await win.outerSize();
        if (!monitor) return;
        const clamped = clampToWorkArea(
          pos,
          { width: size.width, height: size.height },
          { x: monitor.position.x, y: monitor.position.y, width: monitor.size.width, height: monitor.size.height },
        );
        await win.setPosition(new PhysicalPosition(clamped.x, clamped.y));
      } catch {
        // 位置恢复失败不阻断（首次/单屏场景常见）
      }
    })();
  }, []);

  // 移动结束后：边缘吸附 + 持久化位置（去抖合并拖动期间的连续事件）
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win
      .onMoved(async () => {
        if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
        moveTimerRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const pos = await win.outerPosition();
              const monitor = await currentMonitor();
              const size = await win.outerSize();
              if (!monitor) return;
              const area = { x: monitor.position.x, y: monitor.position.y, width: monitor.size.width, height: monitor.size.height };
              const snapped = snapToEdge({ x: pos.x, y: pos.y }, { width: size.width, height: size.height }, area);
              if (snapped.x !== pos.x || snapped.y !== pos.y) {
                await win.setPosition(new PhysicalPosition(snapped.x, snapped.y));
              }
              const prefs = { ...prefsRef.current, pos: snapped };
              prefsRef.current = prefs;
              saveFloatPrefs(prefs);
            } catch {
              // 抛出时窗口可能仍在拖动中——忽略
            }
          })();
        }, MOVE_FINALIZE_DEBOUNCE_MS);
      })
      .then((fn) => fn);
    return () => {
      void unlisten.then((fn) => fn());
      if (moveTimerRef.current) window.clearTimeout(moveTimerRef.current);
    };
  }, []);

  const setViewMode = useCallback((m: FloatMode) => {
    setMode(m);
    const prefs = { ...prefsRef.current, mode: m };
    prefsRef.current = prefs;
    saveFloatPrefs(prefs);
    // 形态联动窗口尺寸（resizable=false 不影响程序化 setSize）
    void getCurrentWindow()
      .setSize(new LogicalSize(360, m === "panel" ? 240 : 44))
      .catch(() => undefined);
  }, []);

  // Esc：面板 ⇄ 字幕条 切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setViewMode(mode === "panel" ? "bar" : "panel");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setViewMode]);

  const updateOpacity = useCallback((v: number) => {
    const clamped = clampOpacity(v);
    setOpacityState(clamped);
    const prefs = { ...prefsRef.current, opacity: clamped };
    prefsRef.current = prefs;
    saveFloatPrefs(prefs);
  }, []);

  const startDrag = useCallback(() => {
    void getCurrentWindow().startDragging().catch((e) => console.warn("[capture-float] 拖拽失败:", e));
  }, []);

  const toggleLocked = useCallback(() => {
    void invoke<FloatSnapshot>("float_set_locked", { locked: !snapshot.locked })
      .then(setSnapshot)
      .catch((e) => console.warn("[capture-float] 点击穿透切换失败:", e));
  }, [snapshot.locked]);

  const toggleTopmost = useCallback(() => {
    void invoke<FloatSnapshot>("float_set_topmost", { topmost: !snapshot.topmost })
      .then(setSnapshot)
      .catch((e) => console.warn("[capture-float] 置顶切换失败:", e));
  }, [snapshot.topmost]);

  const backToMain = useCallback(() => {
    void invoke("show_main_window").catch((e) => console.warn("[capture-float] 回主窗失败:", e));
  }, []);

  return { snapshot, mode, opacity, setViewMode, updateOpacity, startDrag, toggleLocked, toggleTopmost, backToMain };
}
