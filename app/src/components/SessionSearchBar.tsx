/**
 * SessionSearchBar — 会话列表搜索行（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 三模式单输入框的**纯受控**视图：模式按钮三态样式与输入框占位文案
 *              在此；状态与 invoke 留在 useSessionSearch（面板）。切模式由父层的
 *              selectMode 负责「同时清两类命中」——本组件只上报目标模式。
 * @ai-context 边界：内容/画面模式共用同一 searchKw（关键词跨模式复用）；Enter 触发
 *              检索（画面模式按钮走 ocrBusy 禁用 + 「检索中…」）；批 4 B4：模式按钮与两个
 *              检索按钮已走 `Button` 原语（选中态 = `primary`，未选 = `ghost`）。
 */
import type { SearchMode } from "../hooks/useSessionSearch";
import { Button } from "../ui/primitives";

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
  return (
    <div style={{ padding: 10, display: "flex", gap: 6 }}>
      <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
        <Button variant={searchMode === "title" ? "primary" : "ghost"} size="sm" onClick={() => onSelectMode("title")}>标题</Button>
        <Button variant={searchMode === "content" ? "primary" : "ghost"} size="sm" onClick={() => onSelectMode("content")}>内容</Button>
        <Button variant={searchMode === "ocr" ? "primary" : "ghost"} size="sm" onClick={() => onSelectMode("ocr")}>画面</Button>
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
          <Button variant="secondary" size="md" busy={ocrBusy} onClick={() => void onSearchOcrBlocks()}>
            {ocrBusy ? "检索中…" : "图搜"}
          </Button>
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
          <Button variant="secondary" size="md" onClick={() => void onSearchSegments()}>段搜</Button>
        </>
      )}
    </div>
  );
}
