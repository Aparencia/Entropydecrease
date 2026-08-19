/**
 * SessionsPage — 会话列表与详情（REQ-010；v0.3.0 REQ-031 融合事件；
 * v0.6.0 M6 REQ-076~081 会话体验：质量报告/大纲/课程分组/段搜索/降级横幅/笔记预览）。
 *
 * @ai-context: 左侧列表（关键词检索 + 课程分组折叠 + 段搜索），右侧详情
 *              （转写时间轴 + 画面要点 + 三视图：原料/产物/笔记预览）。
 * @ai-context: REQ-031（融合停止异步化）：停止后详情页短暂显示原始轴（数据有效），
 *              session:fusing 显示"融合中"标记，session:fused 到达后自动刷新为融合轴。
 * @ai-context: REQ-080 降级分级：live:asr-degraded 一次性横幅（不打扰常态）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import ArtifactView from "../components/ArtifactView";
import ImageGallery from "../components/ImageGallery";
import NotePreviewView from "../components/NotePreviewView";
import type {
  CourseGroup, Note, OutlineEntry, QualityReport, SegmentHit, Session, SessionDetail,
} from "../types";

const btn: React.CSSProperties = { padding: "5px 10px", cursor: "pointer", fontSize: 12 };

const SOURCE_LABEL: Record<string, string> = {
  subtitle: "字幕",
  asr: "语音",
  fused: "融合",
};
const STATUS_LABEL: Record<string, string> = {
  recording: "录制中",
  finished: "已完成",
  failed: "异常中断",
};

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function SessionsPage({ focusSessionId }: { focusSessionId?: number | null }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<CourseGroup[] | null>(null); // REQ-078：课程分组模式
  const [grouped, setGrouped] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({}); // 折叠状态
  const [keyword, setKeyword] = useState("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [status, setStatus] = useState("");
  const [fusingId, setFusingId] = useState<number | null>(null);
  const openIdRef = useRef<number | null>(null);
  // v0.5.0 M7（REQ-052）+ v0.6.0 M6（REQ-081）：详情页三视图
  const [viewMode, setViewMode] = useState<"raw" | "artifact" | "preview">("raw");
  // M6（REQ-076）：质量报告（可信度总览卡片）
  const [quality, setQuality] = useState<QualityReport | null>(null);
  // M6（REQ-077）：大纲（产物视图侧边导航）
  const [outline, setOutline] = useState<OutlineEntry[]>([]);
  // M6（REQ-079）：段搜索命中（片段高亮 + 跳详情定位）
  const [hits, setHits] = useState<SegmentHit[] | null>(null);
  const [searchKw, setSearchKw] = useState("");
  // M6（REQ-080）：关键降级一次性横幅
  const [degradedBanner, setDegradedBanner] = useState<string | null>(null);

  const openDetail = useCallback(async (id: number) => {
    openIdRef.current = id;
    try {
      const d = await invoke<SessionDetail>("get_session_detail", { id });
      setDetail(d);
      // M6：质量报告 + 大纲随详情加载（失败不阻断详情展示）
      void invoke<QualityReport>("session_quality_report", { id }).then(setQuality).catch(() => undefined);
      void invoke<OutlineEntry[]>("session_outline", { id }).then(setOutline).catch(() => undefined);
      // 跳转定位：段搜索点击后滚动到目标段
      setTimeout(() => {
        const el = document.getElementById(`seg-${id}-${d.segments[0]?.id}`);
        el?.scrollIntoView({ block: "center" });
      }, 50);
    } catch (e) {
      setStatus(`加载详情失败: ${e}`);
    }
  }, []);

  // 融合事件（REQ-031 异步化）
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<number>("session:fusing", (e) => setFusingId(e.payload)),
      listen<number>("session:fused", (e) => {
        setFusingId((cur) => (cur === e.payload ? null : cur));
        if (openIdRef.current === e.payload) void openDetail(e.payload);
      }),
      listen<string>("session:fusion-failed", (e) => {
        setFusingId(null);
        setStatus(e.payload);
      }),
      // REQ-080：关键降级一次性横幅（ASR 降级链切换；恢复后消失）
      listen<string>("live:asr-degraded", (e) => setDegradedBanner(e.payload)),
      listen("live:asr-recovered", () => setDegradedBanner(null)),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [openDetail]);

  const refresh = useCallback(async (kw: string) => {
    try {
      const list = await invoke<Session[]>("list_sessions", { keyword: kw || null });
      setSessions(list);
    } catch (e) {
      setStatus(`会话列表加载失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh("");
  }, [refresh]);

  // 2026-08 A4：跨页直达——课堂助手融合完成跳转后自动打开目标会话详情
  useEffect(() => {
    if (focusSessionId) void openDetail(focusSessionId);
  }, [focusSessionId, openDetail]);

  const search = () => void refresh(keyword);

  /** M6（REQ-078）：切换课程分组模式 */
  const toggleGrouped = async () => {
    const next = !grouped;
    setGrouped(next);
    if (next) {
      try {
        setGroups(await invoke<CourseGroup[]>("list_session_courses"));
      } catch (e) {
        setStatus(`课程分组加载失败: ${e}`);
      }
    }
  };

  /** M6（REQ-079）：段搜索（片段上下文 + 点击跳详情） */
  const searchSegments = async () => {
    const kw = searchKw.trim();
    if (!kw) {
      setHits(null);
      return;
    }
    try {
      setHits(await invoke<SegmentHit[]>("search_session_segments", { keyword: kw }));
    } catch (e) {
      setStatus(`段搜索失败: ${e}`);
    }
  };

  const toNote = async (id: number) => {
    try {
      const note = await invoke<Note>("session_to_note", { id });
      setStatus(`已转为笔记 #${note.id}`);
    } catch (e) {
      setStatus(`转笔记失败: ${e}`);
    }
  };

  const remove = async (id: number) => {
    try {
      await invoke<boolean>("delete_session", { id });
      if (detail?.session.id === id) {
        setDetail(null);
        openIdRef.current = null;
      }
      void refresh(keyword);
    } catch (e) {
      setStatus(`删除失败: ${e}`);
    }
  };

  /** 渲染会话列表项（详情/折叠用） */
  const renderSessionItem = (s: Session) => (
    <div
      key={s.id}
      onClick={() => void openDetail(s.id)}
      style={{
        padding: "10px 14px",
        borderBottom: "1px solid #f3f4f6",
        cursor: "pointer",
        background: detail?.session.id === s.id ? "#f0fdfa" : "#fff",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{s.title}</div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
        #{s.id} · {STATUS_LABEL[s.status] ?? s.status} · {new Date(s.started_at * 1000).toLocaleString()}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
      {/* ── 左栏：会话列表（课程分组折叠 / 段搜索） ── */}
      <div style={{ width: 300, flexShrink: 0, borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
          🗂 学习会话
          <button
            style={{ ...btn, float: "right", fontSize: 11, borderRadius: 6, border: grouped ? "1px solid #0d9488" : "1px solid #e5e7eb", background: grouped ? "#ccfbf1" : "#fff" }}
            onClick={() => void toggleGrouped()}
            title="按课程分组（标题章节前缀）"
          >
            {grouped ? "分组中" : "按课程分组"}
          </button>
        </div>
        {/* 标题搜索 */}
        <div style={{ padding: 10, display: "flex", gap: 6 }}>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="搜索标题/窗口"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
          <button style={btn} onClick={search}>搜</button>
        </div>
        {/* M6（REQ-079）：段搜索（片段上下文） */}
        <div style={{ padding: "0 10px 10px", display: "flex", gap: 6 }}>
          <input
            value={searchKw}
            onChange={(e) => setSearchKw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void searchSegments()}
            placeholder="段搜索：转写内容关键词"
            style={{ flex: 1, fontSize: 12, padding: "5px 8px" }}
          />
          <button style={btn} onClick={() => void searchSegments()}>段搜</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {sessions.length === 0 && !hits && (
            <p style={{ fontSize: 12, color: "#9ca3af", padding: 16, textAlign: "center" }}>
              暂无会话，去「课堂助手」开始实时捕获
            </p>
          )}
          {hits ? (
            /* 段搜索命中列表（高亮片段 + 跳详情定位） */
            <div style={{ padding: 8 }}>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>
                「{searchKw}」命中 {hits.length} 条
              </div>
              {hits.map((h, i) => (
                <div
                  key={i}
                  onClick={() => void openDetail(h.session_id)}
                  style={{ fontSize: 12, color: "#374151", padding: "6px 8px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }}
                >
                  <div style={{ fontWeight: 500, color: "#0f766e" }}>{h.session_title}</div>
                  <div style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>[{fmtMs(h.start_ms)}]</div>
                  <div>
                    {h.snippet.split(searchKw).map((part, j, arr) => (
                      <span key={j}>
                        {part}
                        {j < arr.length - 1 && (
                          <mark style={{ background: "#fef08a", padding: "0 1px", borderRadius: 2 }}>{searchKw}</mark>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : grouped && groups ? (
            /* 课程分组（折叠） */
            groups.map((g) => (
              <div key={g.course}>
                <div
                  onClick={() => setCollapsed((c) => ({ ...c, [g.course]: !c[g.course] }))}
                  style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, color: "#0f766e", cursor: "pointer", background: "#f8fafc", borderBottom: "1px solid #e5e7eb" }}
                >
                  {collapsed[g.course] ? "▸" : "▾"} {g.course}（{g.sessions.length}）
                </div>
                {!collapsed[g.course] && g.sessions.map(renderSessionItem)}
              </div>
            ))
          ) : (
            sessions.map(renderSessionItem)
          )}
        </div>
      </div>

      {/* ── 右栏：会话详情 ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
        {degradedBanner && (
          <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 6, padding: "6px 10px", marginBottom: 8 }}>
            ⚠ {degradedBanner}（恢复后自动消失）
          </div>
        )}
        {!detail ? (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 60 }}>
            选择左侧会话查看转写时间轴与画面要点
          </p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16 }}>{detail.session.title}</h2>
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {STATUS_LABEL[detail.session.status]} · {detail.segments.length} 段转写 · {detail.ocr_blocks.length} 块画面
              </span>
              {fusingId === detail.session.id && (
                <span style={{ fontSize: 11, fontWeight: 600, color: "#b45309", background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, padding: "2px 8px" }}>
                  ⏳ 融合中（字幕/语音轴将自动升级）
                </span>
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button style={{ ...btn, background: "#0d9488", color: "#fff", border: "none", borderRadius: 6 }} onClick={() => void toNote(detail.session.id)}>
                  📝 转为笔记
                </button>
                <button style={btn} onClick={() => void remove(detail.session.id)}>删除</button>
              </div>
            </div>
            {status && <p style={{ fontSize: 12, color: "#2563eb", marginBottom: 8 }}>{status}</p>}

            {/* M6（REQ-076）：可信度总览卡片 */}
            {quality && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {[
                  ["低置信段", quality.low_confidence_count, quality.low_confidence_count > 0 ? "#dc2626" : "#6b7280"],
                  ["OCR 低分", quality.low_score_ocr_count, "#b45309"],
                  ["unknown 区", quality.unknown_region_count, "#7c3aed"],
                  ["AI 复核候选", quality.ai_candidate_count, "#2563eb"],
                ].map(([label, count, color]) => (
                  <span key={label as string} style={{ fontSize: 11, color: color as string, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "2px 8px" }}>
                    {label} {count as number}
                  </span>
                ))}
                {quality.low_confidence_segments.length > 0 && (
                  <details style={{ fontSize: 11, color: "#6b7280" }}>
                    <summary style={{ cursor: "pointer" }}>低置信列表（{quality.low_confidence_segments.length}）</summary>
                    {quality.low_confidence_segments.map((s) => (
                      <div key={s.segment_id} style={{ marginTop: 3 }}>
                        [{fmtMs(s.start_ms)}] {s.text}（{s.confidence.toFixed(2)}）
                      </div>
                    ))}
                  </details>
                )}
              </div>
            )}

            {/* 三视图切换（原料 / 产物 / 笔记预览——REQ-081） */}
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(
                [
                  ["raw", "原料视图"],
                  ["artifact", "产物视图"],
                  ["preview", "笔记预览"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  style={{
                    ...btn,
                    borderRadius: 6,
                    border: viewMode === mode ? "1px solid #0d9488" : "1px solid #e5e7eb",
                    background: viewMode === mode ? "#ccfbf1" : "#fff",
                    color: viewMode === mode ? "#0f766e" : "#374151",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {viewMode === "preview" ? (
              <NotePreviewView sessionId={detail.session.id} />
            ) : viewMode === "artifact" ? (
              <div style={{ display: "flex", gap: 12 }}>
                {/* M6（REQ-077）：大纲侧边导航（点击跳转时间轴） */}
                {outline.length > 0 && (
                  <div style={{ width: 180, flexShrink: 0, borderRight: "1px solid #e5e7eb", paddingRight: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#0f766e", marginBottom: 6 }}>📑 大纲</div>
                    {outline.map((o, i) => (
                      <div
                        key={i}
                        onClick={() => document.getElementById(`ocr-${detail.session.id}-${o.time_ms}`)?.scrollIntoView({ block: "center" })}
                        style={{ fontSize: 12, color: "#374151", cursor: "pointer", padding: "3px 0", borderBottom: "1px dashed #f3f4f6" }}
                        title={`${fmtMs(o.time_ms)}`}
                      >
                        <span style={{ color: "#9ca3af", marginRight: 4, fontVariantNumeric: "tabular-nums" }}>{fmtMs(o.time_ms)}</span>
                        {o.text}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <ArtifactView sessionId={detail.session.id} />
                </div>
              </div>
            ) : (
              <>
                {/* 转写时间轴（字幕为主，语音/融合弱化；段 id 锚点供大纲/搜索跳转） */}
                <h3 style={{ fontSize: 13, margin: "12px 0 6px" }}>转写时间轴</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {detail.segments.length === 0 && (
                    <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无转写段</p>
                  )}
                  {detail.segments.map((seg) => (
                    <div key={seg.id} id={`seg-${detail.session.id}-${seg.id}`} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 11, color: "#9ca3af", width: 70, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                        {fmtMs(seg.start_ms)} – {fmtMs(seg.end_ms)}
                      </span>
                      <span style={{ fontSize: 11, flexShrink: 0, color: seg.source === "subtitle" ? "#0d9488" : "#9ca3af", width: 36 }}>
                        {SOURCE_LABEL[seg.source] ?? seg.source}
                      </span>
                      <span style={{ fontSize: 13, color: seg.source === "fused" ? "#b45309" : "#374151" }}>
                        {seg.text}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 画面要点 */}
                <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>画面要点（OCR）</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {detail.ocr_blocks.length === 0 && (
                    <p style={{ fontSize: 12, color: "#9ca3af" }}>本会话无画面识别内容</p>
                  )}
                  {detail.ocr_blocks.map((b) => (
                    <div key={b.id} id={`ocr-${detail.session.id}-${b.timestamp_ms}`} style={{ fontSize: 12, color: "#4b5563" }}>
                      <span style={{ color: "#9ca3af", fontVariantNumeric: "tabular-nums" }}>
                        [{fmtMs(b.timestamp_ms)}]
                      </span>{" "}
                      {b.text}
                      {b.region === "subtitle" && <span style={{ color: "#0d9488", marginLeft: 4 }}>字幕</span>}
                    </div>
                  ))}
                </div>

                {/* 参考图集（v0.5.0 M6：REQ-051 三层图结构） */}
                <h3 style={{ fontSize: 13, margin: "16px 0 6px" }}>参考图集</h3>
                <ImageGallery sessionId={detail.session.id} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
