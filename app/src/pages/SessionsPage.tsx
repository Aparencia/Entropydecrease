/**
 * SessionsPage — 会话管理台编排层（v0.7.1：管理控制台 + 转化流水线）。
 *
 * @ai-context: 本层为状态宿主与数据编排：会话列表/详情状态、事件驱动刷新
 *              （live:status/session:fused/切页 active）、转化与删除操作；
 *              左栏列表 UI 拆至 SessionListPanel、右栏详情拆至 SessionDetailPanel
 *              （豁免清单拆分计划落地，本文件 ≤300 行）。
 * @ai-context: 状态实时性（痛点根治）：active prop（切页刷新）+ 事件刷新——
 *              display:none 挂载不刷新导致的"采集中"残留不再出现（TD-004 副作用）。
 * @ai-context: REQ-031 融合异步化：fusing/fused/fusion-failed 事件（fused 后
 *              刷新列表 + 详情）；REQ-080 降级横幅透传详情面板。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { confirm } from "@tauri-apps/plugin-dialog";
import SessionDetailPanel from "../components/SessionDetailPanel";
import SessionListPanel from "../components/SessionListPanel";
import ColumnResizer from "../components/ColumnResizer";
import ColumnBar from "../components/ColumnBar";
import { useColumnLayout } from "../hooks/useColumnLayout";
import { useDbRefresh } from "../hooks/useDbRefresh";
// 批 4 T10：页级 toast 的自绘实现（页内 useState + window.setTimeout + 固定定位 JSX + 内联三档配色）
// 整段删除，改用 `useTransientToast`（它自己也已把渲染交给 L1 的 `Toast` 原语）——
// 14 个 `showToast` 调用点的签名与文案一字未改（见 T10 报告的逐处对拍）。
import { useTransientToast } from "../hooks/useTransientToast";
import type {
  BatchNoteResult, BatchSessionDeleteResult, CourseGroup, SessionDetail, SessionListItem,
} from "../types";
// 批 3 T8：列规格（宽/夹取/阈值 1100）改从 `shell/columnRegistry` 取——页面不再自建规格
import { columnSpec } from "../shell/columnRegistry";
import { Text } from "../ui/primitives";

interface Props {
  focusSessionId?: number | null;
  /** v0.16.1：工作台深链任务 id（对话页任务视图 → 会话页自动展开精修工作台） */
  focusRefineTaskId?: number | null;
  /** v0.16.1：focusRefineTaskId 消费完成回调（App 清空——防陈旧值跨导航复触发） */
  onFocusRefineTaskConsumed?: () => void;
  /** v0.16.1：精修任务启动回调（→ AI 对话页展示任务卡/可追问） */
  onRefineTaskStarted?: (sessionId: number, taskId: number) => void;
  /** 页面激活（App 层注入；切到会话页时刷新列表——根治挂载不刷新） */
  active: boolean;
  /** 查看笔记 → 笔记页直达（App 层切页 + focusNoteId） */
  onOpenNote: (noteId: number) => void;
}

export default function SessionsPage({ focusSessionId, focusRefineTaskId, onFocusRefineTaskConsumed, onRefineTaskStarted, active, onOpenNote }: Props) {
  // v0.15：左栏列状态（可拖拽 + 记忆 + 窄窗折叠；规格 §6.2 两列页阈值 1100）
  // 批 3 T8：规格来自 `columnRegistry`，执行仍由 hook 完成
  const listCol = useColumnLayout("sessions-list", columnSpec("sessions-list"));
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [groups, setGroups] = useState<CourseGroup[] | null>(null); // REQ-078：课程分组模式
  const [grouped, setGrouped] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [fusingId, setFusingId] = useState<number | null>(null);
  const [degradedBanner, setDegradedBanner] = useState<string | null>(null);
  // 批 4 T10：页级 toast = `useTransientToast(3000)`（**显式**保留本页原来的 3s；渲染与层级归原语）。
  // 它与被删掉的自绘实现逐条对齐：新消息覆盖旧消息 + 重置计时（hook 的「先清后排」）· 卸载清理
  // （hook 的 cleanup 直接读 ref）· 单计时器。观感差异登记：落点从 `top:64/right:16` 改为原语
  // `viewport` 档的右下 18px（§10「观感从批 4 开始变」），并因此不再与 AI toast 抢同一角落。
  const { toast, showToast } = useTransientToast(3000);
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(0); // 新完成会话数（一次性横幅）
  const openIdRef = useRef<number | null>(null);
  const prevFinishedRef = useRef<Set<number>>(new Set()); // 上次快照的已完成 id 集
  // 段搜索定位滚动定时器（ref 持有 + 卸载清理——防卸载后 DOM 操作残留）
  const scrollTimerRef = useRef<number | null>(null);
  // TD-003 模式：请求序号防竞态——live:status 与 session:fused 可并发触发刷新，
  // 慢响应返回时不覆盖新结果（旧快照短暂回显 + justFinished 重复计数）
  const refreshSeqRef = useRef(0);

  // 滚动定位定时器卸载清理（防卸载后 DOM 操作）；toast 计时器的清理随实现搬进 hook
  useEffect(
    () => () => {
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    },
    [],
  );

  /** 拉取会话列表（含转化标记）；对比快照计算"新完成"计数（事件刷新后提示）。 */
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    try {
      setLoading(true);
      const list = await invoke<SessionListItem[]>("list_sessions", { limit: 200 });
      if (seq !== refreshSeqRef.current) return; // 竞态防护：过期响应直接丢弃
      setItems(list);
      const finishedNow = new Set(
        list.filter((i) => i.session.status === "finished").map((i) => i.session.id),
      );
      if (prevFinishedRef.current.size > 0) {
        const newly = [...finishedNow].filter((id) => !prevFinishedRef.current.has(id)).length;
        if (newly > 0) setJustFinished(newly);
      }
      prevFinishedRef.current = finishedNow;
    } catch (e) {
      if (seq === refreshSeqRef.current) showToast(`会话列表加载失败: ${e}`, "err");
    } finally {
      if (seq === refreshSeqRef.current) setLoading(false);
    }
  }, [showToast]);

  // 初始加载（挂载时一次；实际生效靠 active 切换）
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // v0.7.1：切到会话页时刷新（display:none 挂载不刷新的根治点）
  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // REQ-278（v0.19.4 §5）：data:sessions-changed / data:notes-changed 常驻订阅
  // ——会话列表含最新笔记标题/转化标记，他处（笔记改名/别页转化）也影响展示；
  // 常驻理由：隐藏期事件不漏收（切回即最新），后台成本即防抖后一次 refresh。
  // 注：active 翻转刷新（上方 effect）与总线刷新并存不冲突——防抖合并风暴
  useDbRefresh(["sessions", "notes"], () => void refresh());

  /** 打开会话详情（可选 targetSegId：段搜索命中段定位；无则不强制滚动） */
  const openDetail = useCallback(
    async (id: number, targetSegId?: number) => {
      openIdRef.current = id;
      try {
        const d = await invoke<SessionDetail>("get_session_detail", { id });
        setDetail(d);
        // M4 修复：滚动目标改用命中段 id（原硬编码 segments[0] 导致段搜索定位失效）；
        // 无目标段时不滚动（普通打开/融合刷新保持视口不跳动）
        if (targetSegId != null) {
          if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
          scrollTimerRef.current = window.setTimeout(() => {
            document.getElementById(`seg-${id}-${targetSegId}`)?.scrollIntoView({ block: "center" });
          }, 50);
        }
      } catch (e) {
        showToast(`加载详情失败: ${e}`, "err");
      }
    },
    [showToast],
  );

  // 2026-08 A4：跨页直达——课堂助手融合完成跳转后自动打开目标会话详情
  // （依赖补齐：openDetail 为稳定 useCallback——补入依赖数组消除隐式依赖）
  useEffect(() => {
    if (focusSessionId) void openDetail(focusSessionId);
  }, [focusSessionId, openDetail]);

  // 融合事件（REQ-031 异步化）+ v0.7.1 会话完成事件驱动列表刷新
  useEffect(() => {
    const unlisteners: Promise<() => void>[] = [
      listen<number>("session:fusing", (e) => setFusingId(e.payload)),
      listen<number>("session:fused", (e) => {
        setFusingId((cur) => (cur === e.payload ? null : cur));
        void refresh();
        if (openIdRef.current === e.payload) void openDetail(e.payload);
      }),
      listen<string>("session:fusion-failed", (e) => {
        setFusingId(null);
        showToast(e.payload, "err");
      }),
      // REQ-080：关键降级一次性横幅（ASR 降级链切换；恢复后消失）
      listen<string>("live:asr-degraded", (e) => setDegradedBanner(e.payload)),
      listen("live:asr-recovered", () => setDegradedBanner(null)),
      // v0.7.1：会话结束/失败 → 列表自动刷新（"已完成仍显示采集中"根治）
      listen<string>("live:status", (e) => {
        if (e.payload !== "recording") void refresh();
      }),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [refresh, openDetail, showToast]);

  /** REQ-078：切换课程分组模式 */
  const toggleGrouped = async () => {
    const next = !grouped;
    setGrouped(next);
    if (next) {
      try {
        setGroups(await invoke<CourseGroup[]>("list_session_courses"));
      } catch (e) {
        setGrouped(false); // 失败回滚——避免"分组中"按钮与未分组列表状态不一致
        showToast(`课程分组加载失败: ${e}`, "err");
      }
    }
  };

  /** 行内一键转化（4 步→1 步：不进详情直接转笔记） */
  const convertOne = async (item: SessionListItem) => {
    try {
      await invoke<{ id: number }>("session_to_note", { id: item.session.id });
      // REQ-277：toast 不带裸 # 数字（id 仅内部引用）
      showToast(`「${item.session.title}」已转为笔记（可在笔记页查看）`, "ok");
      void refresh();
    } catch (e) {
      showToast(`转笔记失败: ${e}`, "err");
    }
  };

  /** 详情页"转为笔记"（有意重新生成——新笔记新关联，历史保留） */
  const toNote = async (id: number) => {
    try {
      await invoke<{ id: number }>("session_to_note", { id });
      showToast("已转为笔记（可在笔记页查看）", "ok");
      void refresh();
    } catch (e) {
      showToast(`转笔记失败: ${e}`, "err");
    }
  };

  const removeOne = async (id: number) => {
    const ok = await confirm("删除该会话？将删除其转写/OCR/图集，关联笔记保留。", {
      title: "熵减",
      kind: "warning",
    });
    if (!ok) return;
    try {
      await invoke<boolean>("delete_session", { id });
      if (detail?.session.id === id) {
        setDetail(null);
        openIdRef.current = null;
      }
      showToast("会话已删除", "ok");
      void refresh();
    } catch (e) {
      showToast(`删除失败: ${e}`, "err");
    }
  };

  /** 批量转笔记（部分成功语义：后端跳过已转/进行中并回传原因） */
  const convertSelected = async (eligibleIds: number[]) => {
    try {
      const r = await invoke<BatchNoteResult>("batch_session_to_note", { ids: eligibleIds });
      const skippedMsg =
        r.skipped.length > 0 ? `；跳过 ${r.skipped.length} 个（${r.skipped[0].reason}）` : "";
      showToast(`已转 ${r.converted.length} 个会话${skippedMsg}`, "ok");
      void refresh();
    } catch (e) {
      showToast(`批量转笔记失败: ${e}`, "err");
    }
  };

  /** 批量删除（批 4：后端单事务原子 batch_delete_sessions——全删或全不删，
   *  不再逐条循环半删；resolve=true=全部成功，调用方据此清选集） */
  const deleteSelected = async (ids: number[]): Promise<boolean> => {
    const ok = await confirm(
      `确定删除选中的 ${ids.length} 个会话？将删除其转写/OCR/图集，关联笔记保留。`,
      { title: "熵减", kind: "warning" },
    );
    if (!ok) return false;
    try {
      const r = await invoke<BatchSessionDeleteResult>("batch_delete_sessions", { ids });
      if (detail && ids.includes(detail.session.id)) {
        setDetail(null);
        openIdRef.current = null;
      }
      // 原子全删：deleted<ids.length 仅因勾选集中含已不存在的会话（宽容语义）
      showToast(`已删除 ${r.deleted} 个会话`, "ok");
      void refresh();
      return true;
    } catch (e) {
      showToast(`批量删除失败: ${e}`, "err");
      return false;
    }
  };

  /** 行内改名成功（列表刷新经 data:sessions-changed 总线自动进行——update_session_title
   *  命令侧已广播；本层只补：当前打开的详情若是被改名会话则重拉，防右侧标题陈旧） */
  const sessionRenamed = (id: number) => {
    if (detail?.session.id === id) void openDetail(id);
  };

  // id → 条目映射（批量可转化判定用；覆盖列表与课程分组两个数据源）
  // （映射实际位于 SessionListPanel.runBatchConvert——本层只收可转化 id 集合）

  return (
    <div style={{ display: "flex", height: "calc(100vh - var(--ed-nav-h))", minHeight: 0 }}>
      {/* ── 左栏：会话管理台（v0.7.1 拆出 SessionListPanel；v0.15 可拖拽/折叠） ── */}
      {listCol.folded ? (
        <ColumnBar icon="🗂" title="会话列表" onClick={listCol.expand} />
      ) : (
        <SessionListPanel
          width={listCol.width}
          items={items}
          groups={groups}
          grouped={grouped}
          onToggleGrouped={() => void toggleGrouped()}
          loading={loading}
          justFinished={justFinished}
          onDismissJustFinished={() => setJustFinished(0)}
          openSessionId={detail?.session.id ?? null}
          onOpenDetail={(id, targetSegId) => void openDetail(id, targetSegId)}
          onConvert={(item) => void convertOne(item)}
          onOpenNote={onOpenNote}
          onBatchConvert={(ids) => convertSelected(ids)}
          onBatchDelete={(ids) => deleteSelected(ids)}
          onDeleteOne={(id) => void removeOne(id)}
          onSessionRenamed={(id) => sessionRenamed(id)}
          showToast={showToast}
          onCollapse={() => listCol.setManualFolded(true)}
        />
      )}
      <ColumnResizer onResize={listCol.resizeBy} onReset={listCol.resetWidth} />

      {/* ── 右栏：会话详情（v0.7.1 拆出 SessionDetailPanel） ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
        {!detail ? (
          <Text as="p" size={4} tone="ink-3" style={{ textAlign: "center", marginTop: 60 }}>
            选择左侧会话查看转写时间轴与画面要点
          </Text>
        ) : (
          <SessionDetailPanel
            detail={detail}
            fusing={fusingId === detail.session.id}
            degradedBanner={degradedBanner}
            onToNote={toNote}
            onRemove={removeOne}
            // v0.11.5（spec 5️⃣）：session:refined 事件驱动重新拉详情（屏卡 rendered 回填）
            onRefreshDetail={(id) => void openDetail(id)}
            // v0.16.1：工作台深链 / 精修启动跳转
            autoRefineTaskId={focusRefineTaskId}
            onAutoTaskConsumed={onFocusRefineTaskConsumed}
            onRefineTaskStarted={onRefineTaskStarted}
          />
        )}
      </div>

      {/* 操作反馈 toast（批 4 T10：`useTransientToast` 的节点 —— 自绘 3s 实现已删） */}
      {toast}
    </div>
  );
}
