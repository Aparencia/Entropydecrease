/**
 * WindowSelectCard — 目标窗口/进程选择卡片（参考原项目 WindowSelectCard 布局）。
 *
 * @ai-context: 默认只展示"已选窗口"单卡片压缩纵向空间，点击弹出浮层列表（含刷新）；
 *              浮层两级列表——推荐窗口（score>0，网课/浏览器/播放器关键词命中）默认展示，
 *              其余收进"显示全部窗口"折叠区作为手动自选兜底。
 * @ai-context: 条目同时展示窗口标题与进程名（进程选择能力），点击外部自动关闭浮层。
 */
import { useEffect, useRef, useState } from "react";
import type { WindowInfo } from "../types";

interface Props {
  windows: WindowInfo[];
  selected: WindowInfo | null;
  onSelect: (win: WindowInfo) => void;
  onRefresh: () => void;
  loading: boolean;
  disabled?: boolean;
}

const cardBtn: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 8,
  borderRadius: 8,
  textAlign: "left",
  cursor: "pointer",
  fontSize: 13,
};

/** 浮层内单个窗口条目：标题 + 进程名 + 推荐原因 */
function WindowRow({ win, isSelected, onClick }: { win: WindowInfo; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardBtn,
        border: isSelected ? "1px solid #14b8a6" : "1px solid transparent",
        background: isSelected ? "#f0fdfa" : "transparent",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{win.title}</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>
          进程: {win.processName || "未知"} (PID {win.pid})
          {win.reasons[0] && <span style={{ color: "#0d9488" }}> · 推荐: {win.reasons[0]}</span>}
        </div>
      </div>
      {win.score >= 100 && <span title="高置信推荐">★</span>}
    </button>
  );
}

export function WindowSelectCard({ windows, selected, onSelect, onRefresh, loading, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 推荐窗口 = 评分命中；其余收进"显示全部"折叠区
  const recommended = windows.filter((w) => w.score > 0);
  const others = windows.filter((w) => w.score <= 0);

  // 点击浮层外部自动关闭
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    const next = !open;
    setOpen(next);
    // 首次展开且列表为空时顺手刷新，减少一次点击
    if (next && windows.length === 0 && !loading) onRefresh();
  };

  const handlePick = (win: WindowInfo) => {
    onSelect(win);
    setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <span style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>目标窗口 / 进程</span>

      {/* 已选窗口卡片 / 未选引导按钮 */}
      <button
        onClick={handleToggle}
        disabled={disabled}
        style={{
          ...cardBtn,
          border: selected ? "1px solid #99f6e4" : "1px dashed #d1d5db",
          background: selected ? "#f0fdfa" : "transparent",
          color: selected ? "#0f766e" : "#6b7280",
        }}
      >
        {selected ? (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{selected.title}</div>
              <div style={{ fontSize: 11, color: "#0d9488" }}>
                进程: {selected.processName || "未知"} (PID {selected.pid})
              </div>
            </div>
            <span style={{ fontSize: 11, color: "#0d9488", flexShrink: 0 }}>更换</span>
          </>
        ) : (
          <span style={{ flex: 1 }}>🖥 选择目标窗口（可搜索进程）</span>
        )}
      </button>

      {/* 窗口列表浮层：推荐 + 可展开全部 */}
      {open && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 4,
            zIndex: 20,
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px 6px" }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>推荐窗口</span>
            <button onClick={onRefresh} disabled={loading} style={{ fontSize: 11, color: "#0d9488", cursor: "pointer" }}>
              {loading ? "加载中…" : "⟳ 刷新"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 260, overflowY: "auto" }}>
            {windows.length === 0 && !loading && (
              <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "8px 0" }}>未检测到可捕获窗口</p>
            )}
            {windows.length > 0 && recommended.length === 0 && (
              <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", padding: "8px 0" }}>
                未发现疑似网课/视频窗口，可从下方全部窗口手动选择
              </p>
            )}
            {recommended.map((win) => (
              <WindowRow key={win.id} win={win} isSelected={selected?.id === win.id} onClick={() => handlePick(win)} />
            ))}
            {others.length > 0 && (
              <>
                <button
                  onClick={() => setShowAll((p) => !p)}
                  style={{ fontSize: 11, color: "#6b7280", padding: "6px 4px", cursor: "pointer", borderTop: "1px solid #f3f4f6" }}
                >
                  {showAll ? "▾ 收起其他窗口" : `▸ 显示全部窗口 (${others.length})`}
                </button>
                {showAll &&
                  others.map((win) => (
                    <WindowRow key={win.id} win={win} isSelected={selected?.id === win.id} onClick={() => handlePick(win)} />
                  ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
