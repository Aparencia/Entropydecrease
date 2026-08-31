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
import type {
  BatchNoteResult, CourseGroup, SessionDetail, SessionListItem,
} from "../types";

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

interface Toast {
  msg: string;
  kind: "ok" | "err";
}

export default function SessionsPage({ focusSessionId, focusRefineTaskId, onFocusRefineTaskConsumed, onRefineTaskStarted, active, onOpenNote }: Props) {
  // v0.15：左栏列状态（可拖拽 + 记忆 + 窄窗折叠；默认值=历史固定宽度 320）
  const listCol = useColumnLayout("sessions-list", { default: 320, min: 240, max: 420, autoFoldBelow: 860 });
  const [items, setItems] = useState<SessionListItem[]>([]);
  const [groups, setGroups] = useState<CourseGroup[] | null>(null); // REQ-078：课程分组模式
  const [grouped, setGrouped] = useState(false);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [fusingId, setFusingId] = useState<number | null>(null);
  const [degradedBanner, setDegradedBanner] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [loading, setLoading] = useState(true);
  const [justFinished, setJustFinished] = useState(0); // 新完成会话数（一次性横幅）
  const openIdRef = useRef<number | null>(null);
  const prevFinishedRef = useRef<Set<number>>(new Set()); // 上次快照的已完成 id 集
  const toastTimerRef = useRef<number | null>(null);
  // 段搜索定位滚动定时器（ref 持有 + 卸载清理——防卸载后 DOM 操作残留）
  const scrollTimerRef = useRef<number | null>(null);
  // TD-003 模式：请求序号防竞态——live:status 与 session:fused 可并发触发刷新，
  // 慢响应返回时不覆盖新结果（旧快照短暂回显 + justFinished 重复计数）
  const refreshSeqRef = useRef(0);

  const showToast = useCallback((msg: string, kind: Toast["kind"]) => {
    setToast({ msg, kind });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  // toast 定时器 + 滚动定位定时器卸载清理（防卸载后 setState/DOM 操作）
  useEffect(
    () => () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
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
      const note = await invoke<{ id: number }>("session_to_note", { id: item.session.id });
      showToast(`「${item.session.title}」已转为笔记 #${note.id}`, "ok");
      void refresh();
    } catch (e) {
      showToast(`转笔记失败: ${e}`, "err");
    }
  };

  /** 详情页"转为笔记"（有意重新生成——新笔记新关联，历史保留） */
  const toNote = async (id: number) => {
    try {
      const note = await invoke<{ id: number }>("session_to_note", { id });
      showToast(`已转为笔记 #${note.id}`, "ok");
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

  /** 批量删除（确认框说明后果；笔记保留——SET NULL 语义） */
  const deleteSelected = async (ids: number[]) => {
    const ok = await confirm(
      `确定删除选中的 ${ids.length} 个会话？将删除其转写/OCR/图集，关联笔记保留。`,
      { title: "熵减", kind: "warning" },
    );
    if (!ok) return;
    let failed = 0;
    for (const id of ids) {
      try {
        await invoke<boolean>("delete_session", { id });
        if (detail?.session.id === id) {
          setDetail(null);
          openIdRef.current = null;
        }
      } catch {
        failed += 1;
      }
    }
    showToast(
      failed > 0 ? `已删除 ${ids.length - failed} 个，${failed} 个失败` : `已删除 ${ids.length} 个会话`,
      failed > 0 ? "err" : "ok",
    );
    void refresh();
  };

  // id → 条目映射（批量可转化判定用；覆盖列表与课程分组两个数据源）
  // （映射实际位于 SessionListPanel.runBatchConvert——本层只收可转化 id 集合）

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", minHeight: 0 }}>
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
          onBatchConvert={(ids) => void convertSelected(ids)}
          onBatchDelete={(ids) => void deleteSelected(ids)}
          showToast={showToast}
          onCollapse={() => listCol.setManualFolded(true)}
        />
      )}
      <ColumnResizer onResize={listCol.resizeBy} onReset={listCol.resetWidth} />

      {/* ── 右栏：会话详情（v0.7.1 拆出 SessionDetailPanel） ── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 16 }}>
        {!detail ? (
          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", marginTop: 60 }}>
            选择左侧会话查看转写时间轴与画面要点
          </p>
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

      {/* 操作反馈 toast（自绘，3s 自动消失） */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 64,
            right: 16,
            zIndex: 100,
            maxWidth: 420,
            fontSize: 12,
            padding: "8px 14px",
            borderRadius: 6,
            color: toast.kind === "ok" ? "#065f46" : "#991b1b",
            background: toast.kind === "ok" ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${toast.kind === "ok" ? "#6ee7b7" : "#fca5a5"}`,
            boxShadow: "0 2px 8px rgba(0,0,0,.12)",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
