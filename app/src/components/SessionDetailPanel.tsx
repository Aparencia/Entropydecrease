/**
 * SessionDetailPanel — 会话详情面板（注册表驱动的多视图；v0.11.5 产物视图下线）。
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
 * @ai-context: 批 5 T10（C5 · 本件是**视图记忆的唯一真身与唯一写入者**）：视图态从 `useState`
 *              迁到 `useViewMemory("session", …)`，键 = `view:default:session`（**不含 `kind`**；
 *              代价：web/photo/video 共享一份记忆 —— 已登记）。`objectType` 常量 `"session"` 与
 *              该 hook 同住本件（不变量：hook 与它的键口径不能分居两处）。真正的视图宿主是
 *              `SessionViewHost`，它收 `viewKey` / `onViewKeyChange` 两个受控 props（它自己的
 *              头注写了「为什么 hook 上移到面板而不是下沉到宿主」的完整理由）。
 * @ai-context: 本件仍是**唯一数据面**（`useSessionDetailData`）；`viewMode` 入参按 plan Step 2
 *              的逐字口径映射：`viewKey === views[0].key ? "raw" : "preview"`。**等价性**：该 hook
 *              只拿 `viewMode` 做「进入原料视图懒触发 `auto_refine_session`」一个判定
 *              （`useSessionDetailData.ts:169` `if (viewMode !== "raw") return;`），即**只要「当前
 *              是不是默认（原文）视图」这一个布尔**；默认视图的键由注册表 `views[0].key` 唯一决定，
 *              故 `raw`/`preview` 两档字面量在这里**退化为「默认 / 非默认」**，与 T2 的等价语义一致。
 * @ai-context: DOM 顺序契约（逐字不变）：`SessionDetailHeader` → `SessionQualityCard` →
 *              `SpeakerSwitchCard` → 切换器行（含 `SessionRefineSection`）→ `refineMsg` 行
 *              → 视图区 → 两个裁决面板；全部为**同级兄弟**（视图区内的两个新包裹层见宿主头注）。
 * @ai-context: **批 6 T25 的容器侧接线（控制方授权的唯一落点）**：`useSessionAudio` 今天**没有别的
 *              生产调用点**（宿主 H0 判据要求「宿主自身不 `invoke`」），若本件不接，注入槽
 *              `audio` 在生产路径上永远是 `undefined` ⇒ 视图侧的「纯注入」无从注入。故本件在此
 *              ① 调 `useSessionAudio(sessionId)`（**唯一**取数点仍在 `session-detail/useSessionAudio.ts`，
 *              本件自身零 `invoke` ⇒ **H0 判据一字不动仍绿**）；② 持有播放头状态
 *              `playheadMs` / `onSeekMs`（槽位文档写明「容器负责 `setState` + 播放头动效」）。
 *              ⚠️ hook 必须在 `kind === "web"` 早退**之前**调用（hooks 规则）⇒ web 会话也会发一次
 *              只读 IPC（该命令对无音频会话返回 `None`，代价已登记）。
 *              ⚠️ **本件不做 `[[ts:ms]]` 深链**（T26）：它只需把 `setPlayheadMs` 接上同一条状态。
 */
import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useSessionDetailData } from "../hooks/useSessionDetailData";
import { useSessionAudio } from "./session-detail/useSessionAudio";
import SessionDetailHeader from "./session-detail/SessionDetailHeader";
import SessionRawView from "./session-detail/SessionRawView";
import SessionViewHost from "./session-detail/SessionViewHost";
import { SessionAuxPanels, SessionQualityCard } from "./session-detail/SessionAuxBlocks";
import WebArticleView from "../components/WebArticleView";
import SpeakerSwitchCard from "../components/SpeakerSwitchCard";
import { useViewMemory } from "../views/useViewMemory";
import type { SessionViewSlot, ViewSpec } from "../views/registry";
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
  /** 视图清单（C1①：由 `SessionsPage` 从 `views/registry` 取后注入；本件不 import `viewsFor`） */
  views: readonly ViewSpec<SessionViewSlot>[];
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

export default function SessionDetailPanel({ detail, views, fusing, degradedBanner, onToNote, onRemove, onRefreshDetail, autoRefineTaskId, onAutoTaskConsumed, onRefineTaskStarted }: Props) {
  const sessionId = detail.session.id;
  /** 默认视图键 = 注册表 `views[0].key`（A5①：`registry.ts` 的 `[0]` 就是「原文」） */
  const defaultKey = views.length > 0 ? views[0].key : "";
  // 批 5 C5：**显式改判**旧「裁决 D1」——视图态改由 `view:default:session` 记忆持有；**有记忆 ⇒ 用
  // 记忆值**（切会话不再静默丢弃用户选择）。**旧的「裁决 D1」在视图记忆范围内作废**（其余部分不受
  // 影响），见 v0.22「过程中纠正的计划错误」段。T2 转来的 `:64` 复位 effect **整条删除**（不是加
  // 条件）：记忆 hook 的惰性初始化 + `validKeys` 校验已覆盖「无记忆 ⇒ 默认 `views[0].key`（原文）」。
  const [viewKey, setViewKey] = useViewMemory("session", defaultKey, views.map((spec) => spec.key));
  // 数据面（质量/术语/baseUrl/屏→OCR 分组）+ 精修链路 + 屏卡瞬时态（hook 持有 ⇒ 跨视图切换不丢）
  const {
    quality, glossary, baseUrl, ocrBlocksByScreen, refining, refineMsg, deepTaskId, setDeepTaskId, startRefine,
    selectingScreen, setSelectingScreen, panelToast, showPanelToast, clearPanelToast,
  } = useSessionDetailData({ detail, viewMode: viewKey === defaultKey ? "raw" : "preview", onRefreshDetail });
  // REQ-282（v0.19.6）：标题行内改名 —— 连同改名状态与提交逻辑拆至 session-detail/SessionDetailHeader.tsx
  // v0.20.2（REQ-268/270）：两个裁决面板的显隐 —— 「会话切换即关」的 effect 随面板搬至
  //   `SessionAuxPanels`（state 留本件：工具条三按钮在切换器行里，就近持有回调更少暴露面）。
  const [showPass2, setShowPass2] = useState(false);
  const [showProofread, setShowProofread] = useState(false);
  // 批 6 T25（授权①）：音频引用（唯一取数在 useSessionAudio）+ 播放头位置。
  //   `playheadMs` 由视图经 `onSeekMs` 请求（点时间码 / `<audio>` 的 timeupdate 回报）⇒ 这里 setState。
  const audio = useSessionAudio(sessionId);
  const [playheadMs, setPlayheadMs] = useState<number | null>(null);
  // v0.16.1 工作台深链：autoTaskId 到达即切预览视图。深链快照由 hook 持有——App 侧 focus 清空
  // 早于本层 effect，直接透传 prop 会在卡片挂载前被置空（竞态）；快照 + 会话切换清除保证
  // 「只消费一次、不跨会话遗留」。切换 effect 按裁决 D1 留面板（T10 起写入视图记忆）。
  useEffect(() => {
    if (autoRefineTaskId != null) {
      setDeepTaskId(autoRefineTaskId);
      setViewKey("preview");
      onAutoTaskConsumed?.();
    }
  }, [autoRefineTaskId, onAutoTaskConsumed, setDeepTaskId, setViewKey]);

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

  // 视图槽（C14②）：**数据面全在这里** ⇒ 非默认视图自身零取数、零 `invoke`；`imageUrl` 把
  // `convertFileSrc` 收口在容器侧（T9 的 K6：视图自己 import Tauri 会破 `views/**` 的边界）。
  const slot: SessionViewSlot = {
    detail,
    imageUrl: (imageRef) => (imageRef && baseUrl ? convertFileSrc(`${baseUrl}/${imageRef}`) : null),
    ocrBlocksByScreen,
    selectingScreen,
    onSelectScreen: setSelectingScreen,
    panelToast,
    onShowToast: showPanelToast,
    onClearToast: clearPanelToast,
    autoRefineTaskId: deepTaskId,
    onRefineTaskStarted,
    // T25：三个 T24 槽位在这里**有值**（audio = hook 产出；playheadMs/onSeekMs = 本件的播放头状态）
    audio,
    playheadMs,
    onSeekMs: setPlayheadMs,
  };

  return (
    <>
      {/* 降级横幅 + 详情头（改名/状态行/融合中徽标/操作）—— 拆至 session-detail/SessionDetailHeader.tsx */}
      <SessionDetailHeader detail={detail} fusing={fusing} degradedBanner={degradedBanner} onToNote={onToNote} onRemove={onRemove} onRefreshDetail={onRefreshDetail} />

      {/* M6（REQ-076）：可信度总览卡片 —— 拆至 SessionAuxBlocks.tsx 的 SessionQualityCard */}
      {quality && <SessionQualityCard quality={quality} />}

      {/* v0.7.2（REQ-153）：讲者切换（弱化版说话人分离——懒加载幂等；
          v0.12.1：图文会话跳过（无音频，不再误报红色错误）） */}
      <SpeakerSwitchCard sessionId={sessionId} kind={detail.session.kind} />

      {/* 注册表驱动的视图宿主（T10）：默认视图常驻 + 非默认惰性 + C11 错误槽位；
          `resident` = 原文视图节点（默认视图**不经** `React.lazy`，同步渲染后常驻） */}
      <SessionViewHost
        views={views}
        viewKey={viewKey}
        onViewKeyChange={setViewKey}
        slot={slot}
        resident={
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
        }
        refining={refining}
        onStartRefine={startRefine}
        canSecondPass={detail.session.status === "finished" && detail.session.kind !== "photo"}
        onOpenPass2={() => setShowPass2(true)}
        onOpenProofread={() => setShowProofread(true)}
      />

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
