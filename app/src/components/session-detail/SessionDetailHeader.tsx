/**
 * SessionDetailHeader — 会话详情降级横幅 + 详情头（标题 / 行内改名 / 状态行 / 融合中徽标 / 操作）。
 *
 * @ai-context: 自 SessionDetailPanel.tsx 拆出（原 L256–334 + 改名状态与提交逻辑）——头部持有
 *              改名交互：✎ 进入行内输入 → Enter 保存 / Esc 取消 / 失焦保存；改名后 title_kind=manual
 *              （首句/AI 自动升级不再覆写），成功即回调 onRefreshDetail 重拉详情。
 * @ai-context: 副作用边界——唯一 IPC 为 `update_session_title({ id, title })`，**调用时机与会话 id
 *              与拆分前一致**（空标题或与原标题相同则直接退出，不发 IPC）；改名失败文案逐字保留。
 * @ai-context: REQ-031（融合停止异步化）：fusing 时显示「⏳ 融合中」徽标；session:fused 到达后
 *              父层自动刷新 detail。REQ-080 降级分级：degradedBanner 为一次性横幅（null=不渲染）。
 * @ai-context: DOM 契约——`data-testid="session-title-input"` 与 `data-testid="session-rename-open"`
 *              是既有测试锚点，不得改名；本组件不含 position:sticky（粘性头未实现，勿顺手加）。
 * @ai-context: 样式口径——沿用拆分前的全部 inline style（无 .ed-* 类名），拆分不改色值/结构。
 */
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionDetail } from "../../types";

/** 通用小按钮基础样式（拆分前 SessionDetailPanel 的 `btn`——本文件「转为笔记/删除」复用） */
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const STATUS_LABEL: Record<string, string> = {
  recording: "录制中",
  finished: "已完成",
  failed: "异常中断",
};

interface Props {
  /** 受控详情（父层持有并刷新） */
  detail: SessionDetail;
  /** 本会话是否融合中（父层 fusingId === detail.session.id） */
  fusing: boolean;
  /** 关键降级一次性横幅（null=无） */
  degradedBanner: string | null;
  /** 转为笔记（父层负责 toast 反馈与列表刷新） */
  onToNote: (id: number) => void;
  /** 删除会话（父层负责确认/反馈/刷新） */
  onRemove: (id: number) => void;
  /** 重新拉详情（改名成功 → 重拉，与拆分前一致） */
  onRefreshDetail: (id: number) => void;
}

export default function SessionDetailHeader({ detail, fusing, degradedBanner, onToNote, onRemove, onRefreshDetail }: Props) {
  const sessionId = detail.session.id;
  // REQ-282（v0.19.6）：标题行内改名（详情头 ✎；Enter 保存/Esc 取消/失焦保存——
  // 改名后 title_kind=manual，首句/AI 自动升级不再覆写）
  const [renameMode, setRenameMode] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameErr, setRenameErr] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  /** 改名提交（Enter/失焦）：空标题=放弃退出；成功=退出并重拉详情 */
  const commitRename = async () => {
    if (renameBusy) return;
    const t = renameValue.trim();
    if (!t || t === detail.session.title) {
      setRenameMode(false);
      setRenameErr("");
      return;
    }
    setRenameBusy(true);
    try {
      await invoke("update_session_title", { id: sessionId, title: t });
      setRenameMode(false);
      onRefreshDetail(sessionId);
    } catch (e) {
      setRenameErr(`改名失败: ${e}`);
    } finally {
      setRenameBusy(false);
    }
  };

  const cancelRename = () => {
    setRenameMode(false);
    setRenameErr("");
  };

  return (
    <>
      {degradedBanner && (
        <div
          style={{
            fontSize: 12,
            color: "#b45309",
            background: "#fffbeb",
            border: "1px solid #f59e0b",
            borderRadius: 6,
            padding: "6px 10px",
            marginBottom: 8,
          }}
        >
          ⚠ {degradedBanner}（恢复后自动消失）
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {renameMode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 220 }}>
            <input
              data-testid="session-title-input"
              value={renameValue}
              disabled={renameBusy}
              onChange={(e) => { setRenameValue(e.target.value); setRenameErr(""); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                else if (e.key === "Escape") cancelRename();
              }}
              onBlur={() => void commitRename()}
              autoFocus
              style={{ fontSize: 16, fontWeight: 600, padding: "2px 6px", border: "1px solid #0d9488", borderRadius: 4, maxWidth: 420 }}
            />
            {renameErr && <span style={{ fontSize: 11, color: "#dc2626" }}>{renameErr}</span>}
          </div>
        ) : (
          <h2 style={{ margin: 0, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
            {detail.session.title}
            <button
              data-testid="session-rename-open"
              title="重命名会话（改名后不再被自动标题覆盖）"
              onClick={() => { setRenameValue(detail.session.title); setRenameMode(true); }}
              style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, color: "#6b7280" }}
            >
              ✎
            </button>
          </h2>
        )}
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          {STATUS_LABEL[detail.session.status]} · {detail.segments.length} 段转写 ·{" "}
          {detail.ocr_blocks.length} 块画面
        </span>
        {fusing && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#b45309",
              background: "#fffbeb",
              border: "1px solid #f59e0b",
              borderRadius: 10,
              padding: "2px 8px",
            }}
          >
            ⏳ 融合中（字幕/语音轴将自动升级）
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }}
            onClick={() => onToNote(sessionId)}
          >
            📝 转为笔记
          </button>
          <button style={btn} onClick={() => onRemove(sessionId)}>
            删除
          </button>
        </div>
      </div>
    </>
  );
}
