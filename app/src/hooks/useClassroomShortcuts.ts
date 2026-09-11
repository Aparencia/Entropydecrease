/**
 * useClassroomShortcuts — 课堂助手页面级快捷键（批 0-C2 Task 4 步 6 自
 * ClassroomPage.tsx 抽出，纯搬运、行为等价）。
 *
 * @ai-context: v0.5.0 M6（REQ-051）用户截图快捷键 Ctrl+Shift+S——最高权重关键图
 *              信号：采集中按下即 `save_user_screenshot`，成功写状态行、失败写错误
 *              横幅（文案「📷 截图已保存（关键图候选置顶）」/「截图失败: …」逐字保留）。
 * @ai-context: ★ R4 —— 本监听是**两个** window keydown 中的第一个，deps 必须保持
 *              `[]`（拆分前即 `[]`；onStatus/onLiveError 都是稳定 setter，不入 deps
 *              不改变重订阅时机）。`preventDefault()` 在 invoke 之前、成对 cleanup
 *              不变。**不得**与 useClassroomFloat 的 Ctrl+Shift+F 合并成一个监听
 *              （浮窗打开时主窗键必须让位 Rust 全局键，合并即行为变更）。
 * @ai-context: 已知缺陷 B1（只搬不改）：正文 Ctrl+Shift+S 与 NoteEditView 拆段同键
 *              双义（textarea 未 stopPropagation），本批行为等价、原样保留。
 */
import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Options {
  /** 状态行写入（页面 status 单一状态源） */
  onStatus: (message: string) => void;
  /** 错误横幅写入（页面 liveError 单一状态源） */
  onLiveError: (message: string) => void;
}

export function useClassroomShortcuts({ onStatus, onLiveError }: Options) {
  // v0.5.0 M6（REQ-051）：用户截图快捷键 Ctrl+Shift+S（最高权重关键图信号）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "S" || e.key === "s")) {
        e.preventDefault();
        void invoke<string>("save_user_screenshot")
          .then(() => onStatus("📷 截图已保存（关键图候选置顶）"))
          .catch((err) => onLiveError(`截图失败: ${err}`));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
