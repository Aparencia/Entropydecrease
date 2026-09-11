/**
 * SessionSearchBar — 会话列表搜索行（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 三模式单输入框的**纯受控**视图：模式按钮三态样式与输入框占位文案
 *              在此；状态与 invoke 留在 useSessionSearch（面板）。切模式由父层的
 *              selectMode 负责「同时清两类命中」——本组件只上报目标模式。
 * @ai-context 边界：内容/画面模式共用同一 searchKw（关键词跨模式复用）；Enter 触发
 *              检索（画面模式按钮走 ocrBusy 禁用 + 「检索中…」）；零 className，
 *              全部内联样式（本批明确不迁 design token，避免视觉 diff）。
 */
import type { SearchMode } from "../hooks/useSessionSearch";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  searchMode: SearchMode;
  /** 标题模式输入值（本地即时过滤关键词） */
  keyword: string;
  /** 内容/画面模式输入值（已提交检索关键词的草稿） */
  searchKw: string;
  ocrBusy: boolean;
  onSelectMode: (mode: SearchMode) => void;
  onKeywordChange: (v: string) => void;
  onSearchKwChange: (v: string) => void;
  onSearchSegments: () => void;
  onSearchOcrBlocks: () => void;
}

export default function SessionSearchBar({
  searchMode, keyword, searchKw, ocrBusy, onSelectMode, onKeywordChange, onSearchKwChange,
  onSearchSegments, onSearchOcrBlocks,
}: Props) {
  const modeBtn = (activeMode: boolean): React.CSSProperties => ({
    fontSize: 11,
    padding: "4px 8px",
    border: "none",
    cursor: "pointer",
    background: activeMode ? "#ccfbf1" : "#fff",
    color: activeMode ? "#0f766e" : "#6b7280",
    fontWeight: activeMode ? 600 : 400,
  });

  return (
    <div style={{ padding: 10, display: "flex", gap: 6 }}>
      <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
        <button style={modeBtn(searchMode === "title")} onClick={() => onSelectMode("title")}>标题</button>
        <button style={modeBtn(searchMode === "content")} onClick={() => onSelectMode("content")}>内容</button>
        <button style={modeBtn(searchMode === "ocr")} onClick={() => onSelectMode("ocr")}>画面</button>
      </div>
      {searchMode === "title" ? (
        <input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          placeholder="搜索标题/窗口…"
          style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
        />
      ) : searchMode === "ocr" ? (
        <>
          <input
            value={searchKw}
            onChange={(e) => onSearchKwChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onSearchOcrBlocks()}
            placeholder="画面文字关键词（PPT 上的词）…"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
          <button style={btn} onClick={() => void onSearchOcrBlocks()} disabled={ocrBusy}>
            {ocrBusy ? "检索中…" : "图搜"}
          </button>
        </>
      ) : (
        <>
          <input
            value={searchKw}
            onChange={(e) => onSearchKwChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void onSearchSegments()}
            placeholder="转写内容关键词…"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
          <button style={btn} onClick={() => void onSearchSegments()}>段搜</button>
        </>
      )}
    </div>
  );
}
