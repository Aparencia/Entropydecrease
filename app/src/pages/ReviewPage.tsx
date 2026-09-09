/**
 * ReviewPage — 🔄 复习域页（v0.20.10 批 5：复习功能独立为顶层页，用户问题 6）。
 *
 * @ai-context: 意图分层（学/做/记/练各归其位）——复习面从笔记页剥离（组侧栏
 *              「🎴 复习 N」按钮/Overlay 宿主移除），顶层「🔄 复习」Tab 为唯一
 *              到期感知入口（沿用行动域裁决：无被动提醒——导航/侧栏不到期徽标，
 *              打开本页即见到期数）。spec §9 二期预留方向兑现：ReviewSessionOverlay
 *              全页化 + 全量到期卡 + 组过滤器。
 * @ai-context: 刷新契约：flashcards/review_logs 不在 useDbRefresh 五域事件总线
 *              （DataDomain::Notes/Sessions/NoteGroups/Goals/Knowledge——闪卡与
 *              笔记域零耦合，ADR-018）→ 无事件订阅；切回重载走 active 门控
 *              （TD-004 同 ActionPage），会话退出/完成后再拉一次（评分改变到期分布）。
 * @ai-context: 深链：笔记域 ⓘ「复习本组」→ App setPage("review")+focusReviewGroupId
 *              ——本页消费（预选该组）后 onFocusGroupConsumed 清空（重复深链
 *              同组可再触发）；深链到达时会话进行中则先退出会话（新意图优先——
 *              模态时代不可能并发两场复习）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { NoteGroup } from "../types/notes";
import ReviewSessionPanel from "../components/review/ReviewSessionPanel";
import { dueGroupRows, scopeDueCount, scopeLabel } from "../utils/reviewStats";

interface Props {
  /** 页面是否可见（App 层 display 门控同步透传——切回时重载到期统计） */
  active: boolean;
  /** 跨页深链预选组（笔记域 ⓘ「复习本组」→ 复习页；消费后父层清空） */
  focusGroupId?: number | null;
  /** 深链已消费通知（App 清空 focusReviewGroupId——同组重复深链可再触发） */
  onFocusGroupConsumed?: () => void;
}

/** 会话态（null=总览；非 null=一轮复习会话进行中） */
interface SessionState {
  /** 会话范围（null=全部到期卡） */
  groupId: number | null;
  /** 范围名（头部展示） */
  groupName: string;
}

export default function ReviewPage({ active, focusGroupId, onFocusGroupConsumed }: Props) {
  const [groups, setGroups] = useState<NoteGroup[]>([]);
  // 到期统计：total=全量；byGroup=按组（count_due_cards group_id Option 面）
  const [totalDue, setTotalDue] = useState(0);
  const [byGroupDue, setByGroupDue] = useState<Record<number, number>>({});
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState(0);
  // 过滤器范围（null=全部；只选不启——「开始复习」才进入会话）
  const [selGroupId, setSelGroupId] = useState<number | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);

  // active 门控切回重载：首挂跳过（挂载 effect 已拉取）——仅 false→true 时递增
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (active) setToken((t) => t + 1);
  }, [active]);

  // 到期统计加载：组清单 + 全量/每组到期数。
  // Why 逐组 count_due_cards：后端无批量到期查询命令（既有命令面最小实现，
  // 不加 Rust 命令）——组数=笔记组规模（数十级），Promise.all 并行一次可接受。
  const load = useCallback(async () => {
    try {
      const list = await invoke<NoteGroup[]>("list_note_groups", { terrain: null });
      setGroups(list);
      const results = await Promise.all([
        invoke<number>("count_due_cards", { groupId: null }),
        ...list.map((g) => invoke<number>("count_due_cards", { groupId: g.id })),
      ]);
      const byGroup: Record<number, number> = {};
      list.forEach((g, i) => { byGroup[g.id] = results[i + 1]; });
      setTotalDue(results[0]);
      setByGroupDue(byGroup);
      setStatus("");
      setLoaded(true);
    } catch (e) {
      setStatus(`到期统计加载失败: ${e}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load, token]);

  // 跨页深链消费：预选组 + 退出进行中的会话（新意图优先）+ 通知父层清空
  useEffect(() => {
    if (focusGroupId == null) return;
    setSession(null);
    setSelGroupId(focusGroupId);
    onFocusGroupConsumed?.();
  }, [focusGroupId, onFocusGroupConsumed]);

  // 到期>0 的组行（chips 数据源；纯归约见 utils/reviewStats）
  const dueRows = useMemo(() => dueGroupRows(groups, byGroupDue), [groups, byGroupDue]);
  const scopeDue = scopeDueCount(selGroupId, byGroupDue, totalDue);
  const scopeName = scopeLabel(groups, selGroupId);

  // 「开始复习」=挂载一轮会话（本轮范围=当前过滤器选择）
  const startSession = () => {
    if (scopeDue <= 0) return;
    setSession({ groupId: selGroupId, groupName: scopeName });
  };

  // 会话退出/完成：回总览并重载到期统计（评分已改变到期分布）
  const exitSession = () => {
    setSession(null);
    setToken((t) => t + 1);
  };

  if (session) {
    return (
      <div style={{ height: "calc(100vh - 56px)", display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
        <ReviewSessionPanel
          groupId={session.groupId}
          groupName={session.groupName}
          onExit={exitSession}
        />
      </div>
    );
  }

  // 空态文案分支：全局无到期 / 本组无到期但别组有（引导换范围，避免困惑）
  const emptyTitle = totalDue === 0
    ? "当前没有到期卡片 🎉"
    : "该组当前没有到期卡片";
  const emptyBody = totalDue === 0
    ? "闪卡由笔记组产出（组 ⓘ 管理「⚙ 生成闪卡」/「＋ 概念卡」/碎片升卡），到期时间由 FSRS 间隔调度——到期后再来复习（弹性承诺，不追债）。若从未生成过闪卡：到「📝 笔记」页任一组点 ⓘ →「⚙ 生成闪卡」起步。"
    : `其余组共 ${totalDue} 张到期——切换上方范围即可复习。`;

  return (
    <div style={{ height: "calc(100vh - 56px)", display: "flex", flexDirection: "column", minHeight: 0, background: "#fff" }}>
      {/* 头部：标题 + 到期总数 + 开始复习 */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>🔄 复习</span>
          {loaded && (
            <span data-testid="review-total-due" style={{ fontSize: 12, color: totalDue > 0 ? "#b45309" : "#9ca3af" }}>
              {totalDue > 0 ? `共 ${totalDue} 张到期` : "暂无到期卡"}
            </span>
          )}
          <button onClick={() => void load()} style={{ fontSize: 13, cursor: "pointer", border: "none", background: "none", color: "#9ca3af" }} title="刷新到期统计">⟳</button>
          <button
            onClick={startSession}
            data-testid="review-start"
            disabled={scopeDue <= 0}
            title={scopeDue > 0 ? `复习「${scopeName}」的 ${scopeDue} 张到期卡` : "当前范围没有到期卡片"}
            style={{
              marginLeft: "auto", padding: "6px 18px", fontSize: 13, cursor: scopeDue > 0 ? "pointer" : "not-allowed",
              background: scopeDue > 0 ? "#0f766e" : "#d1d5db", color: "#fff", border: "none", borderRadius: 8,
            }}
          >
            ▶ 开始复习{scopeDue > 0 ? `（${scopeDue}）` : ""}
          </button>
        </div>

        {/* 组过滤器：全部 + 有到期卡的组（含到期数；打开即见——本页即到期感知面） */}
        <div data-testid="review-scope-bar" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <button
            onClick={() => setSelGroupId(null)}
            data-testid="review-scope-all"
            style={{
              fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 12,
              border: selGroupId === null ? "1px solid #0f766e" : "1px solid #d1d5db",
              background: selGroupId === null ? "#f0fdfa" : "#fff",
              color: selGroupId === null ? "#0f766e" : "#374151", fontWeight: selGroupId === null ? 600 : 400,
            }}
          >
            全部（{totalDue}）
          </button>
          {dueRows.map(({ group, due }) => (
            <button
              key={group.id}
              onClick={() => setSelGroupId(group.id)}
              data-testid={`review-scope-${group.id}`}
              title={`本组 ${due} 张到期`}
              style={{
                fontSize: 12, cursor: "pointer", padding: "3px 10px", borderRadius: 12,
                border: selGroupId === group.id ? "1px solid #0f766e" : "1px solid #d1d5db",
                background: selGroupId === group.id ? "#f0fdfa" : "#fff",
                color: selGroupId === group.id ? "#0f766e" : "#374151", fontWeight: selGroupId === group.id ? 600 : 400,
                maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {group.name}（{due}）
            </button>
          ))}
        </div>
      </div>

      {/* 主体：加载/错误/空态/范围引导（会话开始后切换为会话面板） */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
        {!loaded && <p style={{ fontSize: 13, color: "#9ca3af" }}>加载中…</p>}
        {status && <p data-testid="review-status" style={{ fontSize: 12, color: "#dc2626" }}>{status}</p>}
        {loaded && !status && scopeDue <= 0 && (
          <div data-testid="review-empty" style={{ textAlign: "center", padding: "56px 0", maxWidth: 480, margin: "0 auto" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>{emptyTitle}</p>
            <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 10, lineHeight: 1.8 }}>{emptyBody}</p>
          </div>
        )}
        {loaded && !status && scopeDue > 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#6b7280", fontSize: 13 }}>
            <p>
              范围「{scopeName}」共 <b>{scopeDue}</b> 张到期卡，按到期先后出卡，一轮至多 200 张。
            </p>
            <p style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
              流程：看线索回忆 → 查看答案验证 → 四档评分推进 FSRS 调度。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
