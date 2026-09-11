/**
 * useSessionDetailData — 会话详情面板的数据面 + 精修链路（自 SessionDetailPanel.tsx 拆出）。
 *
 * @ai-context: 承接拆分前面板内的 5 类副作用，**时机与参数逐字保持**：
 *              ① 详情随 sessionId 并发拉取三者：session_quality_report / session_glossary /
 *                 session_images_base_url（失败分别降级为 保留 null / [] / ""，不阻断详情展示）；
 *              ② 原料视图懒触发 auto_refine_session（viewMode==="raw" 首次进入，autoRefinedRef
 *                 以 sessionId 幂等；**每会话一次、会话切换不重置、组件重挂重置**）；
 *              ③ 精修事件监听 4 条（session:refining / refined / refine-skipped / refine-failed）
 *                 ——refined 到达时经 onRefreshDetailRef 回拉详情，驱动屏卡 rendered 回填；
 *              ④ 工作台深链快照 deepTaskId（App 侧 focus 清空早于本层 effect，直接透传 prop 会在
 *                 卡片挂载前被置空；快照 + 会话切换清除保证「只消费一次、不跨会话遗留」）；
 *              ⑤ 手动精修入口 startRefine（🔬 课后精修，与懒触发同命令、**失败文案不同**：
 *                 懒触发静默 catch，此处显式「精修失败: {e}」——两条分支不得合并）。
 *
 * @ai-context: 副作用边界——本 hook 只做 IPC 与状态，不渲染；卸载时解绑 4 条 listen（异步
 *              `p.then(fn => fn())`，顺序与拆分前一致）。
 * @ai-context: 性能契约——ocrBlocksByScreen 分组的 memo（M7 修复：排序 + 双指针一次遍历，替代
 *              逐屏 filter 的 O(n×m)）**必须留在本 hook 层并以 Map 下发**；下沉到屏卡子组件会随
 *              每次重渲重算，重新引入原性能问题。
 * @ai-context: 陈旧闭包契约——listen 只在 [sessionId] 上注册（拆分前即带
 *              eslint-disable exhaustive-deps），回调经 onRefreshDetailRef 读最新 prop；
 *              改为 useCallback 直接闭包会让 session:refined 调用过期回调，屏卡回填静默失效。
 * @ai-context: 决策 D1——viewMode 状态仍归面板持有，本 hook 只按值判断懒触发；
 *              面板保留 DeepLink 切换 effect（setViewMode("preview")）与会话切换重置 effect。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GlossaryTerm, QualityReport, SessionDetail, SessionOcrBlock } from "../types";

/** 精修进度载荷（Rust RefineProgress；v0.11.5 事件驱动屏卡回填） */
interface RefineProgressPayload {
  done: number;
  total: number;
  currentKind: string;
}

interface Params {
  /** 受控详情（父层持有并刷新）——分组 memo 的 deps 仍是整个 detail（与拆分前一致） */
  detail: SessionDetail;
  /** 原料/预览视图（仅用于懒触发判定；状态由面板持有，见 D1） */
  viewMode: "raw" | "preview";
  /** 重新拉详情（session:refined 事件驱动屏卡结构回填） */
  onRefreshDetail: (id: number) => void;
}

export interface SessionDetailData {
  /** 质量报告（可信度总览卡片；null=未就绪） */
  quality: QualityReport | null;
  /** 术语表（null=加载中；[]=已加载但无命中——两者渲染文案不同） */
  glossary: GlossaryTerm[] | null;
  /** 屏卡配图 baseUrl（""=无图集/拉取失败） */
  baseUrl: string;
  /** 屏→OCR 块分组（memo 预构建，直接下发屏卡组件） */
  ocrBlocksByScreen: Map<number, SessionOcrBlock[]>;
  /** 精修中（事件驱动；驱动 🔬 按钮禁用与文案） */
  refining: boolean;
  /** 精修状态文案（懒触发降级/进度/完成/跳过/失败共用一行） */
  refineMsg: string;
  /** 工作台深链快照（供 NotePreviewView/AiRefineCard 消费） */
  deepTaskId: number | null;
  /** 深链快照写入（面板的 DeepLink effect 按裁决 D1 留面板，需要此 setter） */
  setDeepTaskId: React.Dispatch<React.SetStateAction<number | null>>;
  /** 🔬 课后精修手动入口（失败文案与懒触发不同——见文件头） */
  startRefine: () => void;
}

export function useSessionDetailData({ detail, viewMode, onRefreshDetail }: Params): SessionDetailData {
  // M6（REQ-076）：质量报告（可信度总览卡片）
  const [quality, setQuality] = useState<QualityReport | null>(null);
  // v0.11.5（spec 8️⃣）：术语表（词汇表移出笔记 → 会话详情直供；null=加载中）
  const [glossary, setGlossary] = useState<GlossaryTerm[] | null>(null);
  // v0.7.3（REQ-160）：屏卡配图 baseUrl（图集同款：convertFileSrc 拼本地路径）
  const [baseUrl, setBaseUrl] = useState("");
  // v0.11.5（spec 5️⃣）：课后精修状态（精修中/完成/跳过——面板层徽标，自 ArtifactView 迁移）
  const [refining, setRefining] = useState(false);
  const [refineMsg, setRefineMsg] = useState("");
  // 懒触发防重（每会话只触发一次；sessionId 变化重置）
  const autoRefinedRef = useRef<Set<number>>(new Set());
  const onRefreshDetailRef = useRef(onRefreshDetail);
  onRefreshDetailRef.current = onRefreshDetail;
  const sessionId = detail.session.id;
  // v0.16.1：工作台深链快照（面板内持有——App 侧 focus 清空早于本层 effect，见文件头）
  const [deepTaskId, setDeepTaskId] = useState<number | null>(null);

  // M7 修复：屏→OCR 块分组预构建（原 screens.map 内逐屏 filter 为 O(n×m)）——
  // 排序后双指针一次遍历归组；屏区间不重叠，与原 filter 语义一致
  const ocrBlocksByScreen = useMemo(() => {
    const map = new Map<number, SessionOcrBlock[]>();
    for (const s of detail.screens) map.set(s.first_seen_ms, []);
    const screens = [...detail.screens].sort((a, b) => a.first_seen_ms - b.first_seen_ms);
    const blocks = [...detail.ocr_blocks].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
    let si = 0;
    for (const b of blocks) {
      // 块时间戳单调递增——跳过已结束的屏（last_seen_ms < ts）
      while (si < screens.length && screens[si].last_seen_ms < b.timestamp_ms) si++;
      if (si < screens.length && b.timestamp_ms >= screens[si].first_seen_ms) {
        map.get(screens[si].first_seen_ms)?.push(b);
      }
    }
    return map;
  }, [detail]);

  // 质量报告 + 术语表随详情加载（v0.11.5：大纲随产物视图下线；失败不阻断详情展示）
  // 注：拆分前面板在同一 effect 内还调用 setViewMode("raw")——按裁决 D1 viewMode 留面板，
  //     该重置由面板同 deps 的 effect 承担（同一次 commit 批处理，渲染结果不变）
  useEffect(() => {
    setQuality(null);
    setGlossary(null);
    void invoke<QualityReport>("session_quality_report", { id: sessionId })
      .then(setQuality)
      .catch(() => undefined);
    void invoke<GlossaryTerm[]>("session_glossary", { id: sessionId })
      .then(setGlossary)
      .catch(() => setGlossary([]));
    void invoke<string>("session_images_base_url", { sessionId })
      .then(setBaseUrl)
      .catch(() => setBaseUrl(""));
  }, [sessionId]);

  // v0.11.5（spec 5️⃣）：课后精修懒自动化——原料视图首次进入自动触发
  // （每会话仅一次：autoRefinedRef 防重；停止后触发通道已覆盖刚停止的会话——
  // 双通道共享 run_refine 幂等过滤，不会重复推理）
  useEffect(() => {
    if (viewMode !== "raw") return;
    if (autoRefinedRef.current.has(sessionId)) return;
    autoRefinedRef.current.add(sessionId);
    void invoke<string>("auto_refine_session", { sessionId })
      .then((msg) => {
        // no-pending=无待精修结构区域（静默）；started=后台精修启动（事件驱动刷新）；
        // 其他（模型未下载等）= 降级提示徽标
        if (msg !== "no-pending" && msg !== "started") setRefineMsg(msg);
      })
      .catch(() => undefined);
  }, [viewMode, sessionId]);

  // v0.16.1 深链快照：会话切换即清除（不跨会话遗留；autoRefinedRef 不随之重置）
  useEffect(() => { setDeepTaskId(null); }, [sessionId]);

  // v0.11.5（spec 5️⃣）：精修事件监听（自 ArtifactView 迁移）——
  // refining 进度 → refined 重新拉详情（屏卡 rendered 回填）→ skipped/failed 徽标
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<RefineProgressPayload>("session:refining", (e) => {
        setRefining(true);
        setRefineMsg(`精修中：${e.payload.currentKind} ${e.payload.done}/${e.payload.total}`);
      }),
      listen<RefineProgressPayload>("session:refined", (e) => {
        setRefining(false);
        setRefineMsg(`精修完成：${e.payload.done} 区域已升级为模型版`);
        // 事件驱动屏卡实时回填：重新拉详情（父层受控 detail）
        onRefreshDetailRef.current(sessionId);
      }),
      listen<string>("session:refine-skipped", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
      listen<string>("session:refine-failed", (e) => {
        setRefining(false);
        setRefineMsg(e.payload);
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  /** 🔬 课后精修手动入口（与懒触发同命令，幂等防重由后端 run_refine 承担） */
  const startRefine = () => {
    setRefining(true);
    setRefineMsg("精修启动中…");
    void invoke<string>("auto_refine_session", { sessionId })
      .then((msg) => {
        if (msg === "no-pending") {
          setRefining(false);
          setRefineMsg("无待精修结构区域（表格/公式）");
        } else if (msg !== "started") {
          setRefining(false);
          setRefineMsg(msg);
        }
      })
      .catch((e) => {
        setRefining(false);
        setRefineMsg(`精修失败: ${e}`);
      });
  };

  return { quality, glossary, baseUrl, ocrBlocksByScreen, refining, refineMsg, deepTaskId, setDeepTaskId, startRefine };
}
