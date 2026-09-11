/**
 * SessionSearchHits — 会话检索命中视图（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 两类命中共用一处渲染：① 段搜索命中（search_session_segments，
 *              REQ-079）——高亮 <mark> 片段 + 点击跳详情并带 segment_id 定位；
 *              ② 画面命中（search_ocr_blocks，REQ-133）——📷 关联图标记 +
 *              屏 id/区间。命中非空即**接管列表区**（列表/分组不渲染），
 *              由面板的列表分支决定（hits 优先于 ocrHits）。
 * @ai-context 边界：hits 为空数组时仍按「有命中」渲染（长度 0 的空态，既有行为）；
 *              searchKw 为空串时 split 只有一个片段（不渲染 <mark>）；fmtMs 统一
 *              ms→时:分:秒。纯展示零状态，内联样式（本批不迁 design token）。
 */
import type { OcrBlockHit, SegmentHit } from "../types";
import { fmtMs } from "../utils/fmt";

interface Props {
  hits: SegmentHit[] | null;
  ocrHits: OcrBlockHit[] | null;
  searchKw: string;
  onOpenDetail: (id: number, targetSegId?: number) => void;
}

export default function SessionSearchHits({ hits, ocrHits, searchKw, onOpenDetail }: Props) {
  if (hits) {
    /* 段搜索命中列表（高亮片段 + 跳详情定位） */
    return (
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
          「{searchKw}」命中 {hits.length} 条
        </div>
        {hits.map((h) => (
          <div
            key={`${h.session_id}-${h.segment_id}`}
            onClick={() => onOpenDetail(h.session_id, h.segment_id)}
            style={{ fontSize: 12, color: "#374151", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
          >
            <div style={{ fontWeight: 500, color: "#0f766e" }}>{h.session_title}</div>
            <div style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>[{fmtMs(h.start_ms)}]</div>
            <div>
              {h.snippet.split(searchKw).map((part, j, arr) => (
                <span key={j}>
                  {part}
                  {j < arr.length - 1 && <mark style={{ background: "#fef08a", padding: "0 1px", borderRadius: 2 }}>{searchKw}</mark>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (ocrHits) {
    /* TD-2026-08-19-E 清偿：图内文字检索命中（命中图 → 跳详情看屏卡/图集） */
    return (
      <div style={{ padding: 8 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
          「{searchKw}」画面命中 {ocrHits.length} 条（点击跳详情）
        </div>
        {ocrHits.map((h) => (
          <div
            key={`${h.sessionId}-${h.ocrBlockId}`}
            onClick={() => onOpenDetail(h.sessionId)}
            style={{ fontSize: 12, color: "#374151", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
          >
            <div style={{ fontWeight: 500, color: "#0f766e" }}>
              {h.sessionTitle}
              {h.imagePath && <span style={{ marginLeft: 6 }} title="此命中有关联图">📷</span>}
            </div>
            <div style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
              [{fmtMs(h.timestampMs)}]
              {h.screenFirstMs != null && ` · 屏 ${h.screenId ?? "?"} ${fmtMs(h.screenFirstMs)}–${fmtMs(h.screenLastMs ?? 0)}`}
            </div>
            <div>{h.text}</div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}
