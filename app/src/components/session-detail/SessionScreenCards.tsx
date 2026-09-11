/**
 * SessionScreenCards — 会话详情「画面要点」屏卡流（v0.7.3 REQ-155/158/160 + v0.7.7 REQ-184 框选截取）。
 *
 * @ai-context: 自 SessionDetailPanel 拆出（原 L482–603 + 面板层 toast/框选状态）——屏卡展示
 *              屏号区间 + 标题 + 正文 + 标签 + 配图 + 结构徽标 + 可展开块级明细；v0.12.0 M5 补完成：
 *              视频会话（kind≠photo）画面要点 = 关键帧纯图，图文会话（kind=photo）保持 OCR 文本屏，
 *              头部文案与「原始 N 块」提示随类型分派。
 * @ai-context: 副作用边界——① 框选截取挂 BoxSelectOverlay（保存走后端 capture_structure_manual，
 *              图集经事件自刷新，本组件不参与）；② 保存反馈为**单屏** toast（screenKey=first_seen_ms，
 *              4s 自动消失、新消息重置计时）。⚠️ 框选态与 toast 的**状态不在此组件内**（本组件只在
 *              原料视图渲染，viewMode 切换即卸载）：二者由 useSessionDetailData 持有并经 props 下发，
 *              使「保存 toast 的 4s 内」或「框选进行中」切视图再切回时的状态寿命与拆分前一致。
 * @ai-context: 性能契约——屏→OCR 块分组（M7 修复：排序 + 双指针一次遍历，替代逐屏 filter 的 O(n×m)）
 *              由调用方面板层/useSessionDetailData 以 memo 预构建并**以 prop 传 Map**；本组件内自行
 *              分组会随每次重渲重算，故不可下沉。
 * @ai-context: DOM 锚点契约——屏卡容器 id 为 `ocr-${sessionId}-${firstSeenMs}`，唯一消费者是
 *              pages/SessionsPage.tsx 的 scrollIntoView；字符串格式不得改动（跨文件、无编译期保障）。
 * @ai-context: 样式口径——沿用拆分前的**全部 inline style**（本仓 .ed-* design token 尚未覆盖本域），
 *              拆分不改类名、不改色值。
 */
import { convertFileSrc } from "@tauri-apps/api/core";
import BoxSelectOverlay from "../BoxSelectOverlay";
import type { SessionOcrBlock, SessionScreen } from "../../types";
import { fmtMs } from "../../utils/fmt";

/** 通用小按钮基础样式（拆分前 SessionDetailPanel 的 `btn`——本文件仅「框选截取」展开复用） */
const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

interface Props {
  sessionId: number;
  /** 会话类型（null/其他=视频类；'photo'=图文截屏会话）——头部文案与空态分派 */
  kind: string | null;
  /** 画面要点屏卡（旧数据聚类兜底） */
  screens: SessionScreen[];
  /** 原始 OCR 块数（仅图文会话在头部提示；M5 后视频会话不再展示文本块） */
  ocrBlockCount: number;
  /** 屏卡配图 baseUrl（v0.7.3 REQ-160；空串=无图集） */
  baseUrl: string;
  /** 屏→OCR 块分组（调用方 memo 预构建——见文件头性能契约） */
  ocrBlocksByScreen: Map<number, SessionOcrBlock[]>;
  /** 框选态：正在框选的屏（first_seen_ms；null=无）——由 useSessionDetailData 持有（见文件头） */
  selectingScreen: number | null;
  /** 框选态写入（✂ 进入 / 完成 / 取消） */
  onSelectScreen: (firstSeenMs: number | null) => void;
  /** 单屏 toast（screenKey=first_seen_ms；null=无） */
  panelToast: { screenKey: number; msg: string } | null;
  /** 单屏 toast 触发（4s 自动消失；新消息重置计时） */
  onShowToast: (screenKey: number, msg: string) => void;
  /** 单屏 toast 立即清除（✂ 点击时清上一条） */
  onClearToast: () => void;
}

export default function SessionScreenCards({
  sessionId,
  kind,
  screens,
  ocrBlockCount,
  baseUrl,
  ocrBlocksByScreen,
  selectingScreen,
  onSelectScreen,
  panelToast,
  onShowToast,
  onClearToast,
}: Props) {
  return (
    <>
      {/* 画面要点（v0.7.3 屏卡流：区间+标题+正文+标签+配图+结构徽标；可展开块级明细复查）
          v0.12.0 M5 补完成：视频会话（kind≠photo）画面要点 = 关键帧纯图（无 OCR 文字）；
          图文会话（kind=photo）保持 OCR 文本屏 —— 头部文案与原始块提示随类型分派 */}
      <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>
        {kind === "photo" ? "画面要点（OCR）" : "画面要点（关键帧纯图）"} · {screens.length} 屏
        <span style={{ color: "#9ca3af", fontWeight: 400 }}>
          {screens.length === 0 || kind !== "photo" ? "" : `（原始 ${ocrBlockCount} 块）`}
        </span>
      </h3>
      {screens.length === 0 && (
        <p style={{ fontSize: 12, color: "#9ca3af" }}>
          {kind === "photo" ? "本会话无画面识别内容" : "本会话无关键帧图"}
        </p>
      )}
      {screens.map((s, i) => {
        // 块级明细（原料复查）：预构建分组直取（M7：替代逐屏 O(n×m) filter）
        const raw = ocrBlocksByScreen.get(s.first_seen_ms) ?? [];
        return (
          <div
            key={s.first_seen_ms}
            id={`ocr-${sessionId}-${s.first_seen_ms}`}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 10px",
              marginBottom: 8,
              background: "#fafafa",
            }}
          >
            <div style={{ fontSize: 11, color: "#0f766e", fontWeight: 600, marginBottom: 4 }}>
              📄 屏 {s.screen_id ?? i + 1} · {fmtMs(s.first_seen_ms)} – {fmtMs(s.last_seen_ms)}
              {s.structure.length > 0 &&
                s.structure.map((st, j) => (
                  <span key={j} style={{ marginLeft: 8, color: "#7c3aed" }}>
                    {st.kind === "table" ? "📊" : st.kind === "formula" ? "∑" : "⟨code⟩"} {st.kind}
                  </span>
                ))}
            </div>
            {s.title && (
              <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                {s.title}
              </div>
            )}
            {s.body.map((b, j) => (
              <div key={j} style={{ fontSize: 12.5, color: "#374151", lineHeight: 1.6 }}>
                {b}
              </div>
            ))}
            {s.labels.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 3 }}>
                标签：{s.labels.join(" · ")}
              </div>
            )}
            {s.structure.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#7c3aed", marginTop: 3 }}>
                {s.structure.map((st, j) => (
                  <div key={j}>[{st.kind}] {st.rendered ?? st.text.slice(0, 60)}</div>
                ))}
              </div>
            )}
            {s.image_ref && baseUrl && (
              <div style={{ marginTop: 6 }}>
                {/* M2：仅匹配屏渲染 toast（screenKey=first_seen_ms） */}
                {panelToast && panelToast.screenKey === s.first_seen_ms && (
                  <div style={{ fontSize: 11, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "4px 8px", marginBottom: 4 }}>
                    {panelToast.msg}
                  </div>
                )}
                <div style={{ position: "relative", display: "inline-block" }}>
                  <img
                    src={convertFileSrc(`${baseUrl}/${s.image_ref}`)}
                    alt={`屏 ${i + 1}`}
                    loading="lazy"
                    style={{
                      maxWidth: 260,
                      borderRadius: 6,
                      border: "1px solid #e5e7eb",
                      display: "block",
                    }}
                  />
                  {/* v0.7.7（REQ-184）：屏卡全帧图框选截取（无图屏不出现按钮） */}
                  {selectingScreen === s.first_seen_ms && (
                    <BoxSelectOverlay
                      src={convertFileSrc(`${baseUrl}/${s.image_ref}`)}
                      sessionId={sessionId}
                      firstSeenMs={s.first_seen_ms}
                      onDone={() => {
                        onSelectScreen(null);
                        // 定时消失逻辑收敛到 showPanelToast（ref 持有 + 卸载清理）
                        onShowToast(s.first_seen_ms, "✓ 已保存为结构图（见图集「结构图」区段）");
                      }}
                      onCancel={() => onSelectScreen(null)}
                    />
                  )}
                </div>
                <div>
                  <button
                    style={{ ...btn, fontSize: 11, borderRadius: 6, border: "1px solid #0d9488", background: "#f0fdfa", color: "#0f766e", marginTop: 4 }}
                    onClick={() => {
                      onSelectScreen(s.first_seen_ms);
                      onClearToast();
                    }}
                    title="拖框截取此屏中的流程图/图表等非线性结构为结构图"
                  >
                    ✂ 框选截取
                  </button>
                </div>
              </div>
            )}
            {raw.length > 0 && (
              <details style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                <summary style={{ cursor: "pointer" }}>块级明细（{raw.length} 块，可复查误合并）</summary>
                {raw.map((b) => (
                  <div key={b.id}>
                    [{fmtMs(b.timestamp_ms)}] {b.text}
                  </div>
                ))}
              </details>
            )}
          </div>
        );
      })}
    </>
  );
}
