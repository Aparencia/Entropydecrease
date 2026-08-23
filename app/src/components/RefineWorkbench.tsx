/**
 * RefineWorkbench — 精修工作台模态组件（v0.11.5 Task 11 / spec 6️⃣）。
 *
 * @ai-context: 并排双栏（规则版 + 精修版）+ 章节级 diff 高亮 + 同步滚动 +
 *              采纳/重新生成/放弃。数据源：非只读带 taskResult（采纳前内存
 *              结果）→ refine_workbench 回传 result（消除未落库右侧恒空）；
 *              无 taskResult → refine_workbench（后端兜底未采纳任务/已落库
 *              笔记，重启可恢复）；只读（VersionPanel）→ ruleMd/refinedMd 透传。
 * @ai-context: 只读模式（VersionPanel 对比）：ruleMd/refinedMd 透传，底部无操作。
 *              普通模式（AiRefineCard）：taskResult 可选——传入则采纳按钮可用。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AiRefineResult, WorkbenchData } from "../types";
import { escapeHtml, renderTimestampAnchors } from "../utils/html";

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 999,
  background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const modal: React.CSSProperties = {
  background: "#fff", borderRadius: 12, width: "90vw", maxWidth: 1200,
  height: "85vh", display: "flex", flexDirection: "column", overflow: "hidden",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};
const headerBtn: React.CSSProperties = {
  padding: "4px 10px", cursor: "pointer", fontSize: 11, borderRadius: 6,
};

function renderMd(md: string): string {
  return md.split("\n").map((line) => {
    // v0.12.0：先转义再替换时间戳锚点（章节锚点 `## 标题 [[⏱ ...]]` 与段落锚点；
    // 精修版回挂的章节锚点此前以原始 markdown 文本显示——真机验收修复）
    if (line.startsWith("# ")) return `<h2 style="font-size:14px;margin:8px 0 3px">${renderTimestampAnchors(escapeHtml(line.slice(2)))}</h2>`;
    if (line.startsWith("## ")) return `<h3 style="font-size:13px;margin:6px 0 2px;color:#0f766e">${renderTimestampAnchors(escapeHtml(line.slice(3)))}</h3>`;
    if (line.startsWith("### ")) return `<h4 style="font-size:12px;margin:4px 0 2px;color:#374151">${renderTimestampAnchors(escapeHtml(line.slice(4)))}</h4>`;
    if (line.startsWith("- ")) return `<div style="font-size:12px;color:#4b5563">• ${renderTimestampAnchors(escapeHtml(line.slice(2)))}</div>`;
    if (line.trim() === "") return "";
    return `<p style="font-size:12px;color:#374151;margin:2px 0">${renderTimestampAnchors(escapeHtml(line))}</p>`;
  }).join("");
}

/** 按 sections 插入 diff 徽标 */
function decorateRefined(md: string, sections: WorkbenchData["sections"]): string {
  let result = md;
  for (const sec of sections) {
    if (sec.status === "unchanged") continue;
    const badge = sec.status === "added"
      ? `<span style="display:inline-block;font-size:10px;background:#d1fae5;color:#047857;border-radius:4px;padding:0 6px;margin-left:6px">新增</span>`
      : sec.status === "removed"
        ? `<span style="display:inline-block;font-size:10px;background:#fef2f2;color:#b91c1c;border-radius:4px;padding:0 6px;margin-left:6px">已删除</span>`
        : `<span style="display:inline-block;font-size:10px;background:#fffbeb;color:#b45309;border-radius:4px;padding:0 6px;margin-left:6px">修改</span>`;
    const searchPattern = `>${escapeHtml(sec.heading)}</h`;
    const idx = result.indexOf(searchPattern);
    if (idx >= 0) {
      const insertAt = idx + searchPattern.length - 2;
      result = result.slice(0, insertAt) + badge + result.slice(insertAt);
    }
  }
  return result;
}

/**
 * 精修工作台（普通模式=采纳前对比；只读模式=版本对比）。
 *
 * @ai-context: 普通模式 data 统一走后端 refine_workbench（规则草稿+锚点剥离+
 *              章节 diff 单一口径）；taskResult 以 refineResult 参数回传——
 *              后端优先采用（修复：原实现只按已落库笔记取精修版，采纳前
 *              右侧恒空，且存在事件先行/DB 写库竞态）。
 */
export default function RefineWorkbench({
  sessionId,
  onClose,
  onApplied,
  readonly = false,
  taskResult,
  taskId,
  onRegenerate,
  ruleMd: propRuleMd,
  refinedMd: propRefinedMd,
}: {
  sessionId: number;
  onClose: () => void;
  onApplied?: (noteId: number) => void;
  readonly?: boolean;
  /** AiRefineCard 传的精修任务结果（非只读时优先作为双栏数据源 + 启用采纳按钮） */
  taskResult?: AiRefineResult;
  /** 任务 id（采纳落库时回传——标记 adopted + 成本回填，防重启后重复采纳） */
  taskId?: number | null;
  /** 重新生成回调（走父级任务管线：running 态 + 轮询/事件，防止状态残留） */
  onRegenerate?: () => void | Promise<void>;
  /** 只读模式透传规则版 markdown */
  ruleMd?: string;
  /** 只读模式透传精修版 markdown */
  refinedMd?: string;
}) {
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errMsg, setErrMsg] = useState("");
  const [msg, setMsg] = useState("");

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      if (readonly && propRuleMd !== undefined && propRefinedMd !== undefined) {
        const secs = await invoke<WorkbenchData["sections"]>("diff_markdown_sections", {
          oldMd: propRuleMd,
          newMd: propRefinedMd,
        }).catch(() => []);
        const totalAdded = secs.reduce((s, x) => s + x.added_lines.length, 0);
        const totalRemoved = secs.reduce((s, x) => s + x.removed_lines.length, 0);
        setData({
          ruleMarkdown: propRuleMd,
          refinedMarkdown: propRefinedMd,
          sections: secs,
          stats: { added: totalAdded, removed: totalRemoved, unchanged: secs.filter((s) => s.status === "unchanged").length },
          meta: null,
        });
        setStatus("ready");
        return;
      }
      // 非只读 + 精修结果在内存（采纳前）→ 回传后端 refine_workbench：
      // 后端优先采用该结果（消除未落库右侧恒空 + 事件先行的 DB 写库竞态）
      const d = await invoke<WorkbenchData>("refine_workbench", {
        sessionId,
        refineResult: !readonly && taskResult ? taskResult : null,
      });
      setData(d);
      setStatus("ready");
    } catch (e) {
      setErrMsg(`加载失败：${e}`);
      setStatus("error");
    }
  }, [sessionId, readonly, propRuleMd, propRefinedMd, taskResult]);

  useEffect(() => { void load(); }, [load]);

  /** 同步滚动 */
  const onScroll = useCallback((side: "left" | "right") => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) { syncingRef.current = false; return; }
    const src = side === "left" ? left : right;
    const tgt = side === "left" ? right : left;
    const ratio = src.scrollHeight > 0 ? src.scrollTop / (src.scrollHeight - src.clientHeight) : 0;
    tgt.scrollTop = ratio * (tgt.scrollHeight - tgt.clientHeight);
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  /** 采纳——复用 ai_refine_apply（需 taskResult；回传 taskId 标记采纳防重复落库） */
  const apply = async () => {
    if (!taskResult || !data?.refinedMarkdown) return;
    setMsg("⏳ 落库中…");
    try {
      const note = await invoke<{ id: number }>("ai_refine_apply", {
        sessionId,
        result: taskResult,
        // 修复：原实现恒传 null → 任务记录不标记 adopted、成本不回填——
        // 重启后任务中心仍可恢复该结果并再次采纳（重复建笔记风险）
        taskId: taskId ?? null,
      });
      setMsg(`✅ 已落库为笔记 #${note.id}`);
      onApplied?.(note.id);
      onClose();
    } catch (e) {
      setMsg(`落库失败：${e}`);
    }
  };

  /** 重新生成——优先走父级任务管线（running 态 + 轮询/事件 + 卡住检测） */
  const regenerate = async () => {
    setMsg("⟳ 重新启动精修任务……");
    try {
      if (onRegenerate) {
        await onRegenerate();
      } else {
        // 兜底（防御）：无回调时直接重启任务（仅 readonly 外的非标准调用可能触发）
        await invoke("ai_refine_start", { sessionId, authorized: true });
      }
      onClose();
    } catch (e) {
      setMsg(`启动失败：${e}`);
    }
  };

  if (status === "loading") {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modal, alignItems: "center", justifyContent: "center" }} onClick={(e) => e.stopPropagation()}>
          <p style={{ fontSize: 13, color: "#6b7280" }}>⏳ 加载工作台数据…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={overlay} onClick={onClose}>
        <div style={{ ...modal, alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: "#dc2626", fontSize: 13 }}>{errMsg}</p>
          <button style={{ ...headerBtn, marginTop: 10 }} onClick={onClose}>关闭</button>
        </div>
      </div>
    );
  }

  const wb = data!;
  // v0.12.3 防御（Bug#2）：后端字段缺失/契约漂移时渲染不崩——
  // 原实现 wb.ruleMarkdown 直接 split，serde 键错配时为 undefined 白屏。
  const ruleMd = wb.ruleMarkdown ?? "";
  const refinedMd = wb.refinedMarkdown ?? null;
  const sections = wb.sections ?? [];
  const stats = wb.stats ?? { added: 0, removed: 0, unchanged: 0 };
  const hasRefined = refinedMd != null;
  const leftHtml = renderMd(ruleMd);
  const rightHtml = hasRefined ? decorateRefined(renderMd(refinedMd), sections) : "";

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* 顶栏 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "10px 16px", borderBottom: "1px solid #e5e7eb",
          background: "#f9fafb", flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>🔧 精修工作台</span>
          <span style={{ fontSize: 11, color: "#047857" }}>新增 {stats.added} 行</span>
          <span style={{ fontSize: 11, color: "#b91c1c" }}>删除 {stats.removed} 行</span>
          <span style={{ fontSize: 11, color: "#6b7280" }}>章节 {sections.length}</span>
          {wb.meta?.model && <span style={{ fontSize: 10, color: "#9ca3af" }}>{wb.meta.model}</span>}
          {wb.meta?.costYuan != null && (
            <span style={{ fontSize: 10, color: "#b45309" }}>¥{wb.meta.costYuan.toFixed(4)}</span>
          )}
          <span style={{ flex: 1 }} />
          <button style={{ ...headerBtn, border: "none", background: "transparent", fontWeight: 600, color: "#6b7280" }} onClick={onClose}>✕</button>
        </div>

        {/* 双栏 */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #e5e7eb" }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: "#374151",
              padding: "6px 12px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb",
            }}>📄 规则版</div>
            <div
              ref={leftRef}
              onScroll={() => onScroll("left")}
              style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 12, lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: leftHtml }}
            />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: "#047857",
              padding: "6px 12px", background: "#f0fdfa", borderBottom: "1px solid #e5e7eb",
            }}>✨ 精修版</div>
            {hasRefined ? (
              <div
                ref={rightRef}
                onScroll={() => onScroll("right")}
                style={{ flex: 1, overflowY: "auto", padding: 12, fontSize: 12, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: rightHtml }}
              />
            ) : (
              <div style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", fontSize: 13,
              }}>
                ⚡ 尚未精修，请先启动 AI 精修
              </div>
            )}
          </div>
        </div>

        {/* 底栏 */}
        {!readonly && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderTop: "1px solid #e5e7eb",
            background: "#fafafa", flexShrink: 0,
          }}>
            <button
              style={{ ...headerBtn, background: "#e0e7ff", color: "#3730a3", border: "1px solid #a5b4fc" }}
              onClick={() => void regenerate()}
            >
              ⟳ 重新生成
            </button>
            {taskResult != null && (
              <button
                style={{ ...headerBtn, background: "#0d9488", color: "#fff", border: "none" }}
                onClick={() => void apply()}
              >
                ✅ 采纳落库
              </button>
            )}
            <button style={{ ...headerBtn, border: "1px solid #d1d5db" }} onClick={onClose}>
              放弃
            </button>
            {msg && <span style={{ fontSize: 11, color: msg.startsWith("✅") ? "#0d9488" : "#dc2626" }}>{msg}</span>}
          </div>
        )}
      </div>
    </div>
  );
}