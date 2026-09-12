/**
 * SessionDetailPanel — 会话详情面板（原料 / 笔记预览两视图；v0.11.5 产物视图下线）。
 *
 * @ai-context: v0.7.1 自 SessionsPage 拆出（豁免清单登记拆分计划）——质量报告、大纲、
 *              视图模式为面板内部状态（仅依赖 sessionId），与列表页解耦。
 * @ai-context: REQ-031 融合停止异步化：fusing 时显示"融合中"标记，session:fused 到达后父层自动
 *              刷新 detail 重挂本面板。REQ-080 降级分级：live:asr-degraded 一次性横幅（父层透传）。
 * @ai-context: v0.11.5（spec 5️⃣）：产物视图下线（ArtifactView 删除）——课后精修入口迁移到面板层；
 *              进入原料视图懒触发 auto_refine_session（幂等：已精修屏跳过），session:refined 事件
 *              驱动重新拉详情（屏卡 rendered 回填），refine-skipped 徽标提示（模型未下载降级链）。
 * @ai-context: 批 5 T2（C9 拆件 A）：297 → ≤150（C9 的 150 严于通用 300 ⇒ 取严者）。
 *              四块搬出——原文视图 → `session-detail/SessionRawView.tsx`；切换器行 + `preview`
 *              分支 → `session-detail/SessionViewHost.tsx`（过渡形态，T10 改注册表驱动）；
 *              可信度总览卡 + 两裁决面板 + `refineMsg` 行 → `session-detail/SessionAuxBlocks.tsx`。
 *              行为等价由 `SessionDetailPanel.test.tsx` 的 P1–P4 在拆前拆后都绿证明。
 * @ai-context: 本件仍是**唯一数据面**（`useSessionDetailData`）与**唯一视图状态持有者**
 *              （`viewMode` / 深链快照写入——裁决 D1；C5 会在 T10 改判 `:64` 的复位 effect）。
 * @ai-context: DOM 顺序契约（逐字不变）：`SessionDetailHeader` → `SessionQualityCard` →
 *              `SpeakerSwitchCard` → 切换器行（含 `SessionRefineSection`）→ `refineMsg` 行
 *              → 视图区 → 两个裁决面板；全部为**同级兄弟**，无新增 wrapper。
 */
import { useEffect, useState } from "react";
import { useSessionDetailData } from "../hooks/useSessionDetailData";
import SessionDetailHeader from "./session-detail/SessionDetailHeader";
import SessionRawView from "./session-detail/SessionRawView";
import SessionViewHost from "./session-detail/SessionViewHost";
import { SessionAuxPanels, SessionQualityCard } from "./session-detail/SessionAuxBlocks";
import WebArticleView from "../components/WebArticleView";
import SpeakerSwitchCard from "../components/SpeakerSwitchCard";
import type { GlossaryTerm, SessionDetail } from "../types";

/** 术语表 summary 的三种文案（null=加载中 / 0 条 / N 条）——原文案逐字，条件整串注入视图 */
const glossarySummaryOf = (glossary: GlossaryTerm[] | null): string =>
  glossary === null
    ? "加载中…"
    : glossary.length === 0
      ? "无术语（画面高频 × 语音低频未命中）"
      : `${glossary.length} 条（画面高频 × 语音低频）`;

interface Props {
  detail: SessionDetail;
  /** 本会话是否融合中（父层 fusingId === detail.session.id） */ fusing: boolean;
  /** 关键降级一次性横幅（null=无） */ degradedBanner: string | null;
  /** 转为笔记 / 删除会话 / 重新拉详情（三者都由父层负责反馈与刷新） */
  onToNote: (id: number) => void;
  onRemove: (id: number) => void;
  onRefreshDetail: (id: number) => void;
  /** v0.16.1 工作台深链：任务 id / 消费完成回调（App 清空 focus）/ 精修任务启动回调（→ 对话页） */
  autoRefineTaskId?: number | null;
  onAutoTaskConsumed?: () => void;
  onRefineTaskStarted?: (sessionId: number, taskId: number) => void;
}

export default function SessionDetailPanel({ detail, fusing, degradedBanner, onToNote, onRemove, onRefreshDetail, autoRefineTaskId, onAutoTaskConsumed, onRefineTaskStarted }: Props) {
  const [viewMode, setViewMode] = useState<"raw" | "preview">("raw"); // v0.5.0 M7 + v0.6.0 M6：两视图
  const sessionId = detail.session.id;
  // v0.5.0 M7：会话切换回到原料视图（裁决 D1：viewMode 状态留面板；数据面重置见 hook）
  useEffect(() => { setViewMode("raw"); }, [sessionId]);
  // 数据面（质量/术语/baseUrl/屏→OCR 分组）+ 精修链路 + 屏卡瞬时态（hook 持有 ⇒ 跨视图切换不丢）
  const {
    quality, glossary, baseUrl, ocrBlocksByScreen, refining, refineMsg, deepTaskId, setDeepTaskId, startRefine,
    selectingScreen, setSelectingScreen, panelToast, showPanelToast, clearPanelToast,
  } = useSessionDetailData({ detail, viewMode, onRefreshDetail });
  // REQ-282（v0.19.6）：标题行内改名 —— 连同改名状态与提交逻辑拆至 session-detail/SessionDetailHeader.tsx
  // v0.20.2（REQ-268/270）：两个裁决面板的显隐 —— 「会话切换即关」的 effect 随面板搬至
  //   `SessionAuxPanels`（state 留本件：工具条三按钮在切换器行里，就近持有回调更少暴露面）。
  const [showPass2, setShowPass2] = useState(false);
  const [showProofread, setShowProofread] = useState(false);
  // v0.16.1 工作台深链：autoTaskId 到达即切预览视图。深链快照由 hook 持有——App 侧 focus 清空
  // 早于本层 effect，直接透传 prop 会在卡片挂载前被置空（竞态）；快照 + 会话切换清除保证
  // 「只消费一次、不跨会话遗留」。切换 effect 按裁决 D1 留面板。
  useEffect(() => {
    if (autoRefineTaskId != null) {
      setDeepTaskId(autoRefineTaskId);
      setViewMode("preview");
      onAutoTaskConsumed?.();
    }
  }, [autoRefineTaskId, onAutoTaskConsumed, setDeepTaskId]);

  // v0.20.4（REQ-303）：web 会话专用详情（文章阅读 + 元数据回链 + 转笔记；
  // 无时间轴/屏卡/精修面——h2 标题即页标题，改名在会话列表进行）
  if (detail.session.kind === "web") {
    return (
      <div style={{ padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>{detail.session.title}</h2>
          <span style={{ fontSize: 11, color: "#0d9488", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, padding: "1px 8px" }}>
            web 采集
          </span>
        </div>
        <WebArticleView sessionId={sessionId} onToNote={onToNote} onRemove={onRemove} />
      </div>
    );
  }

  return (
    <>
      {/* 降级横幅 + 详情头（改名/状态行/融合中徽标/操作）—— 拆至 session-detail/SessionDetailHeader.tsx */}
      <SessionDetailHeader detail={detail} fusing={fusing} degradedBanner={degradedBanner} onToNote={onToNote} onRemove={onRemove} onRefreshDetail={onRefreshDetail} />

      {/* M6（REQ-076）：可信度总览卡片 —— 拆至 SessionAuxBlocks.tsx 的 SessionQualityCard */}
      {quality && <SessionQualityCard quality={quality} />}

      {/* v0.7.2（REQ-153）：讲者切换（弱化版说话人分离——懒加载幂等；
          v0.12.1：图文会话跳过（无音频，不再误报红色错误）） */}
      <SpeakerSwitchCard sessionId={sessionId} kind={detail.session.kind} />

      {/* 切换器行 + 视图区 —— 拆至 SessionViewHost.tsx（过渡形态：手写 2 按钮切换组逐字
          搬移，T10 再改注册表驱动的多视图宿主）；children = 原文视图节点 */}
      <SessionViewHost
        sessionId={sessionId}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        autoRefineTaskId={deepTaskId}
        onRefineTaskStarted={onRefineTaskStarted}
        refining={refining}
        onStartRefine={startRefine}
        canSecondPass={detail.session.status === "finished" && detail.session.kind !== "photo"}
        onOpenPass2={() => setShowPass2(true)}
        onOpenProofread={() => setShowProofread(true)}
      >
        <SessionRawView
          detail={detail}
          baseUrl={baseUrl}
          ocrBlocksByScreen={ocrBlocksByScreen}
          selectingScreen={selectingScreen}
          onSelectScreen={setSelectingScreen}
          panelToast={panelToast}
          onShowToast={showPanelToast}
          onClearToast={clearPanelToast}
          glossarySummary={glossarySummaryOf(glossary)}
          glossary={glossary}
        />
      </SessionViewHost>

      {/* refineMsg 行 + 两个裁决面板 —— 拆至 SessionAuxBlocks.tsx 的 SessionAuxPanels */}
      <SessionAuxPanels
        sessionId={sessionId}
        refineMsg={refineMsg}
        refining={refining}
        showPass2={showPass2}
        showProofread={showProofread}
        onClosePass2={() => setShowPass2(false)}
        onCloseProofread={() => setShowProofread(false)}
      />
    </>
  );
}
