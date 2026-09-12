/**
 * RefineWorkbench — 精修工作台模态组件（v0.11.5 Task 11 / spec 6️⃣）。
 *
 * @ai-context: 并排双栏（规则版 + 精修版）+ 章节级 diff 高亮 + 同步滚动 +
 *              采纳/重新生成/放弃。批 3（问题11）：行级三态染色（removed
 *              删除线红/added 绿）与 并排/差异 单列视图切换——数据源为整篇
 *              有序行级 diff（diff_markdown_ops，见 load 内 Why）。数据源：
 *              非只读带 taskResult（采纳前内存结果）→ refine_workbench
 *              回传 result（消除未落库右侧恒空）；无 taskResult →
 *              refine_workbench（后端兜底未采纳任务/已落库笔记，重启可恢复）；
 *              只读（VersionPanel）→ ruleMd/refinedMd 透传。
 * @ai-context: 只读模式（VersionPanel 对比）：ruleMd/refinedMd 透传，底部无操作。
 *              普通模式（AiRefineCard）：taskResult 可选——传入则采纳按钮可用。
 * @ai-context: 批 4 T7 迁移（计划 Task 7 / R3 裁决 B12 走 (a)）：自建遮罩与面板几何
 *              （原 `width: 90vw; maxWidth: 1200`、`height: 85vh`）交给 `Modal` 的 `l` 档
 *              （720，规格 §5.2）——**这是有意的可见观感变化**：并排两栏各约 344 px
 *              （旧 1137 px 面板下各约 568），密度接近单栏；「差异」单栏模式仍可用
 *              （顶部 toggle，未改）。遮罩/ESC/焦点/层级/body 滚动锁归 `Modal`（ADR-033 §7），
 *              两栏的**独立滚动 + 同步滚动**保留（见 `PANE_MAX_H` 的 Why）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, Loading, Modal, Skeleton, StatusLine, Text } from "../ui/primitives";
import { invoke } from "@tauri-apps/api/core";
import type { AiRefineResult, DiffOp, MarkdownDiffOps, RefineStrategyInfo, RefineStrategyMeta, WorkbenchData } from "../types";
import { escapeHtml } from "../utils/html";
// 批 3（问题11）：行级 diff 纯渲染工具（ops 流→栏行序/单列 HTML——渲染内核
// 移出组件，行级染色与差异视图共用，见 utils/refineDiff.ts）
import { mdFallbackRows, opsToRows, renderDiffColumnHtml, renderSideHtml, splitDiffSides } from "../utils/refineDiff";

/** 档位显示名（meta 声明解析；intent:xxx 前缀 → intent 名；未知 id 原样——诚实不猜） */
function strategyName(presetId: string, meta: RefineStrategyMeta | null): string {
  if (presetId.startsWith("intent:")) {
    const id = presetId.slice(7);
    return meta?.intents.find((i) => i.id === id)?.label ?? presetId;
  }
  return meta?.ladderPresets.find((p) => p.id === presetId)?.name ?? presetId;
}

/** 非默认旋钮 chips（只展示偏离声明默认的维度——溯源聚焦变化差异） */
function strategyDimsChips(info: RefineStrategyInfo, meta: RefineStrategyMeta | null): string[] {
  if (!meta) return [];
  const out: string[] = [];
  for (const dim of meta.strategyDims) {
    const v = info.dims[dim.key];
    if (!v || v === dim.default) continue;
    const opt = dim.options.find((o) => o.value === v);
    out.push(`${dim.label}·${opt?.label ?? v}`);
  }
  return out;
}

const headerBtn: React.CSSProperties = {
  padding: "4px 10px", cursor: "pointer", fontSize: 11, borderRadius: 6,
};

/**
 * 双栏/单栏滚动区的高度上限（T7 迁移新增的唯一一处几何）。
 *
 * Why 必须有上限：`Modal` 的 body 是「内容多高就多高 + `overflow: auto`」，两栏若跟着自然
 *   高度长，`scrollHeight === clientHeight` ⇒ 栏内不滚、`onScroll` 的**同步滚动永不触发**
 *   （功能静默失效）。取值 = 面板上限 `85vh` − 面板头/脚、正文留白与统计条约 200 px，
 *   与旧实现「面板 85vh、栏内滚」同量级；再大就会连 body 也出滚动条（双滚动条）。
 */
const PANE_MAX_H = "calc(85vh - 200px)";

/**
 * md-lite 行级渲染与三态 HTML 生成已移入 utils/refineDiff.ts（批 3：行级
 * 染色/差异视图两模式共用同一渲染内核；unchanged 行输出与原 renderMd
 * 字节一致——组件内不再持有第二份逐行渲染实现）。
 */

/**
 * 按 sections 在章节标题**末尾、闭合标签之前**插入 diff 徽标。
 *
 * @ai-context: 徽标是章节级标注（新增/已删除/修改），必须落在标题元素**内部**——
 *              插入位算错 1 个字符就会塞进 `<` 与 `/` 之间，渲染出游离的 `<` 与 `/h3>`
 *              文本（T7 真渲染截图实测 `逻辑<修改/h3>`）。故插入点由 `searchPattern`
 *              末尾的闭合标签长度反推，不做裸算术（`- 2` 这类常数是缺陷源）。
 * @ai-context: 边界：`sections` 里的 heading 在 md 中不存在（后端分组与文本漂移）时
 *              `indexOf` 返回 -1 ⇒ 跳过该徽标、正文照常渲染（不抛错、不静默插错位置）。
 */
function decorateRefined(md: string, sections: WorkbenchData["sections"]): string {
  let result = md;
  for (const sec of sections) {
    if (sec.status === "unchanged") continue;
    const badge = sec.status === "added"
      ? `<span style="display:inline-block;font-size:10px;background:#d1fae5;color:#047857;border-radius:4px;padding:0 6px;margin-left:6px">新增</span>`
      : sec.status === "removed"
        ? `<span style="display:inline-block;font-size:10px;background:#fef2f2;color:#b91c1c;border-radius:4px;padding:0 6px;margin-left:6px">已删除</span>`
        : `<span style="display:inline-block;font-size:10px;background:#fffbeb;color:#b45309;border-radius:4px;padding:0 6px;margin-left:6px">修改</span>`;
    const closing = "</h";
    const searchPattern = `>${escapeHtml(sec.heading)}${closing}`;
    const idx = result.indexOf(searchPattern);
    if (idx >= 0) {
      // 插入点 = 闭合标签 `<` 之前（`searchPattern` 以 `</h` 结尾 ⇒ 末端 3 字符是闭合标签）
      const insertAt = idx + searchPattern.length - closing.length;
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
  noteId,
  noteMode = false,
  onClose,
  onApplied,
  readonly = false,
  taskResult,
  taskId,
  onRegenerate,
  ruleMd: propRuleMd,
  refinedMd: propRefinedMd,
}: {
  /** 会话级目标（规则草稿基线；与 noteMode 二选一） */
  sessionId?: number;
  /** 笔记级目标（笔记当前版基线——手写/任意笔记；REQ-246） */
  noteId?: number;
  /** 笔记级模式：基线=当前笔记版（非规则草稿），采纳走 ai_note_refine_apply */
  noteMode?: boolean;
  onClose: () => void;
  onApplied?: (noteId: number) => void;
  readonly?: boolean;
  /** 精修任务结果（非只读时优先作为双栏数据源 + 启用采纳按钮） */
  taskResult?: AiRefineResult;
  /** 任务 id（采纳落库时回传——标记 adopted + 成本回填） */
  taskId?: number | null;
  /** 重新生成回调（走父级任务管线：running 态 + 轮询/事件） */
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
  // v0.17.0：策略溯源条（档位/旋钮 chips——meta 声明解析名称）
  const [strategyMeta, setStrategyMeta] = useState<RefineStrategyMeta | null>(null);
  // 批 3（问题11）：整篇有序行级 diff ops（行级染色数据源；null=未取到→不染色
  // 兜底）+ 视图切换（并排/差异——纯前端 toggle，不改变底部操作与保存路径）
  const [ops, setOps] = useState<DiffOp[] | null>(null);
  const [view, setView] = useState<"side" | "diff">("side");

  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);

  // 溯源条元数据（一次加载——档位/旋钮显示名）
  useEffect(() => {
    void invoke<RefineStrategyMeta>("ai_refine_strategy_meta").then(setStrategyMeta).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      let d: WorkbenchData;
      if (readonly && propRuleMd !== undefined && propRefinedMd !== undefined) {
        const secs = await invoke<WorkbenchData["sections"]>("diff_markdown_sections", {
          oldMd: propRuleMd,
          newMd: propRefinedMd,
        }).catch(() => []);
        const totalAdded = secs.reduce((s, x) => s + x.added_lines.length, 0);
        const totalRemoved = secs.reduce((s, x) => s + x.removed_lines.length, 0);
        d = {
          ruleMarkdown: propRuleMd,
          refinedMarkdown: propRefinedMd,
          sections: secs,
          stats: { added: totalAdded, removed: totalRemoved, unchanged: secs.filter((s) => s.status === "unchanged").length },
          meta: null,
        };
      } else if (noteMode) {
        // 笔记级：内存结果即基线（无规则草稿链路）；章节 diff 前端按基线/精修版算
        if (!taskResult) {
          throw new Error("笔记级精修缺少任务结果（请重新发起精修）");
        }
        const secs = await invoke<WorkbenchData["sections"]>("diff_markdown_sections", {
          oldMd: taskResult.baseMarkdown,
          newMd: taskResult.refinedMarkdown,
        }).catch(() => []);
        const totalAdded = secs.reduce((s, x) => s + x.added_lines.length, 0);
        const totalRemoved = secs.reduce((s, x) => s + x.removed_lines.length, 0);
        d = {
          ruleMarkdown: taskResult.baseMarkdown,
          refinedMarkdown: taskResult.refinedMarkdown,
          sections: secs,
          stats: { added: totalAdded, removed: totalRemoved, unchanged: secs.filter((s) => s.status === "unchanged").length },
          meta: null,
        };
      } else {
        // 非只读 + 精修结果在内存（采纳前）→ 回传后端 refine_workbench：
        // 后端优先采用该结果（消除未落库右侧恒空 + 事件先行的 DB 写库竞态）
        d = await invoke<WorkbenchData>("refine_workbench", {
          sessionId,
          refineResult: !readonly && taskResult ? taskResult : null,
        });
      }
      // 批 3（问题11）行级差异统一取数：三入口（会话级/笔记级/只读）都对
      // "工作台实际展示的两版文本" 同一命令取整篇有序 ops——行级染色与渲染
      // 逐行对齐，不引入第二套 diff 口径。不采用 taskResult.diff 的 Why：
      // 其基线是任务时刻的含锚点草稿，与工作台剥离锚点后的展示文本可能错位。
      // 取数失败降级 null → 行不染色（文本仍完整渲染，不阻断工作台）；精修版
      // 为空串时无 diff 语义（整栏删除线会误读），同样不取数
      const refinedText = d.refinedMarkdown;
      const canDiff = refinedText != null && refinedText.trim() !== "";
      const opsData = canDiff
        ? await invoke<MarkdownDiffOps>("diff_markdown_ops", {
            oldMd: d.ruleMarkdown ?? "",
            newMd: refinedText,
          }).catch(() => null)
        : null;
      setData(d);
      setOps(opsData?.ops ?? null);
      setStatus("ready");
    } catch (e) {
      setErrMsg(`加载失败：${e}`);
      setStatus("error");
    }
  }, [sessionId, readonly, propRuleMd, propRefinedMd, taskResult, noteMode]);

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

  /** 采纳（会话级 ai_refine_apply / 笔记级 ai_note_refine_apply——REQ-246） */
  const apply = async () => {
    if (!taskResult || !data?.refinedMarkdown) return;
    setMsg("⏳ 落库中…");
    try {
      const note = await invoke<{ id: number }>(
        noteMode ? "ai_note_refine_apply" : "ai_refine_apply",
        noteMode
          ? { noteId, result: taskResult, taskId: taskId ?? null }
          : { sessionId, result: taskResult, taskId: taskId ?? null },
      );
      setMsg("✅ 已采纳更新笔记（可到版本时间线对比/回滚）");
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
      <Modal open onClose={onClose} title="精修工作台" size="l" testId="refine-workbench">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 160 }}>
          {/* 批 4 T14：双栏对照的形状已知 ⇒ 骨架；文案逐字保留（含 ⏳ —— 装饰 emoji 规则只覆盖弹层标题） */}
          <Loading label="⏳ 加载工作台数据…" />
          <div style={{ marginTop: 10, width: "100%" }}>
            <Skeleton lines={4} />
          </div>
        </div>
      </Modal>
    );
  }

  if (status === "error") {
    return (
      <Modal open onClose={onClose} title="精修工作台" size="l" testId="refine-workbench">
        <StatusLine kind="error">{errMsg}</StatusLine>
      </Modal>
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
  // 批 3（问题11）：行级数据派生——ops 缺失（未精修/取数失败）→ 原文行全
  // unchanged 兜底（不染色也不破坏渲染）；ops 存在 → 每栏各消费一侧流
  // （栏行序与其源文本逐行一致，见 utils/refineDiff.splitDiffSides Why）
  const sides = ops ? splitDiffSides(ops) : null;
  const baseRows = sides?.base ?? mdFallbackRows(ruleMd);
  const refinedRows = sides?.refined ?? (hasRefined ? mdFallbackRows(refinedMd) : []);
  // 差异单列 = 整篇流序三态；取数失败兜底 = 两版文本顺序堆叠（灰显，仍可读全文）
  const diffRows = ops
    ? opsToRows(ops)
    : hasRefined
      ? [...mdFallbackRows(ruleMd), ...mdFallbackRows(refinedMd)]
      : mdFallbackRows(ruleMd);
  const leftHtml = renderSideHtml(baseRows);
  const rightHtml = hasRefined ? decorateRefined(renderSideHtml(refinedRows), sections) : "";
  const diffHtml = renderDiffColumnHtml(diffRows);
  // 差异视图仅在两版可比时展示（精修版缺失时保持并排占位——单侧无 diff 语义）
  const showDiff = view === "diff" && hasRefined;

  /** 底栏行动区（只读模式无操作）——原自绘底栏**逐字**搬进 `Modal` 的 `footer` 槽 */
  const footer = (
    <>
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
      {msg && <StatusLine kind={msg.startsWith("✅") ? "ok" : "error"}>{msg}</StatusLine>}
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="精修工作台"
      size="l"
      testId="refine-workbench"
      footer={readonly ? undefined : footer}
    >
      {/* 自绘顶栏（标题 + `✕`）已删：标题交给 `Modal` 的 head、关闭钮由 `${testId}-close`
          契约提供；统计与视图切换保留为正文首行（原 `borderBottom`/底色随面板几何一并去掉） */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: "#047857" }}>新增 {stats.added} 行</span>
        <span style={{ fontSize: 11, color: "#b91c1c" }}>删除 {stats.removed} 行</span>
        <span style={{ fontSize: 11, color: "#6b7280" }}>章节 {sections.length}</span>
        {wb.meta?.model && <Text tone="ink-3" style={{ fontSize: 10 }}>{wb.meta.model}</Text>}
        {wb.meta?.costYuan != null && (
          <span style={{ fontSize: 10, color: "#b45309" }}>¥{wb.meta.costYuan.toFixed(4)}</span>
        )}
        {/* 批 3（问题11）：视图切换（并排/差异——纯前端 toggle；差异=两版行
            并置一列有序展示：灰=共有/删除线红=原版独有/绿=精修新增） */}
        {hasRefined && (
          <div style={{ display: "flex", border: "1px solid #d1d5db", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
            {(["side", "diff"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                style={{
                  ...headerBtn, border: "none", borderRadius: 0,
                  background: view === m ? "#0d9488" : "transparent",
                  color: view === m ? "#fff" : "#6b7280",
                  fontWeight: 600,
                }}
              >
                {m === "side" ? "并排" : "差异"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* v0.17.0：策略溯源条（档位+旋钮 chips——「按什么规则变的」可溯源） */}
      {!readonly && taskResult?.strategy && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          padding: "6px 16px", background: "#f5f3ff", borderBottom: "1px solid #e0e7ff",
          fontSize: 11, color: "#4c1d95",
        }}>
          <span style={{ fontWeight: 600 }}>本次档位：</span>
          <span>{strategyName(taskResult.strategy.presetId, strategyMeta)}</span>
          {strategyDimsChips(taskResult.strategy, strategyMeta).map((c) => (
            <span key={c} style={{ background: "#ede9fe", borderRadius: 999, padding: "1px 8px", color: "#5b21b6" }}>{c}</span>
          ))}
          {/* REQ-279：自定义档自由文本随溯源展示（可追溯「按什么要求变的」） */}
          {taskResult.strategy.customText?.trim() && (
            <span style={{
              background: "#e0e7ff", borderRadius: 999, padding: "1px 8px", color: "#3730a3",
              maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={taskResult.strategy.customText}>
              要求：{taskResult.strategy.customText}
            </span>
          )}
          {taskId != null && (
            <button
              style={{ ...headerBtn, border: "1px solid #c7d2fe", background: "#fff", color: "#4c1d95", marginLeft: 4 }}
              onClick={() => {/* 完整提示词在 AI 对话页任务卡（轨迹）可查看 */}}
              title="完整提示词在 AI 对话页「AI 任务」卡可查看（轨迹存档）"
            >
              💬 查看提示词
            </button>
          )}
        </div>
      )}

      {/* 双栏 / 差异单列（行级染色数据源同 diff_markdown_ops——并排与差异
          两模式共用一行数据，见 load 内统一取数 Why） */}
      {showDiff ? (
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: PANE_MAX_H }}>
          <div style={{ fontSize: 11, color: "#6b7280", padding: "6px 12px", background: "#f3f4f6", borderBottom: "1px solid #e5e7eb", borderRight: "1px solid #e5e7eb" }}>
            <span style={{ color: "#b91c1c" }}>− 原版独有</span>
            <span style={{ margin: "0 8px" }}>/</span>
            <span style={{ color: "#047857" }}>+ 精修新增</span>
            <span style={{ margin: "0 8px" }}>/</span>
            <span>灰 = 两版共有</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <div
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 6, fontSize: 11, fontFamily: "monospace", lineHeight: 1.7 }}
              dangerouslySetInnerHTML={{ __html: diffHtml }}
            />
          </div>
        </div>
      ) : (
      <div style={{ display: "flex", minHeight: 0, maxHeight: PANE_MAX_H }}>
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
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <EmptyState title="⚡ 尚未精修，请先启动 AI 精修" />
            </div>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
}