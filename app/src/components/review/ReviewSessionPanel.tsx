/**
 * ReviewSessionPanel — 复习会话面板（v0.20.10 批 5：复习独立顶层页——Overlay 全页化）。
 *
 * @ai-context: 由 components/ReviewSessionOverlay.tsx 迁移更名（git mv 保历史，
 *              2026-09-09 批 5）。原形态=fixed 全屏遮罩模态（组侧栏/ⓘ 弹层原地
 *              宿主）；批 5 起复习=顶层「🔄 复习」Tab 唯一入口——本组件渲染为
 *              页面主体区：去 fixed/inset:0 遮罩与居中卡片（Why：页面自身即
 *              上下文，无需模态层级；组件职责收敛为"一轮会话"）。
 * @ai-context: 提取优先（v0.11.2 语义不变，后端命令不变）：front 线索 →
 *              「回忆完成」→ back 验证 → 四档评分推进 FSRS 调度；队列一次性
 *              拉取（评分出的卡不回插本轮——下次到期再现）；无被动重读/无
 *              streak（弹性承诺——不追债不清零）。
 * @ai-context: 组过滤/全量 = groupId prop（null=全部到期卡，与 list_due_cards
 *              命令契约一致）；「开始」语义=页面层以挂载表达（挂载即开一轮），
 *              退出/完成回调 onExit 回总览（评分完成的卡已落库，中途退出
 *              只损失当前未评分卡——原模态语义延续）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Flashcard } from "../../types/notes";
import PromoteCardButton from "../PromoteCardButton";
import { Loading, Skeleton, StatusLine, Text } from "../../ui/primitives";

/** 四档评分按钮（文案=回忆质量自评） */
const RATINGS: { value: string; label: string; color: string }[] = [
  { value: "again", label: "忘了", color: "#dc2626" },
  { value: "hard", label: "困难", color: "#d97706" },
  { value: "good", label: "记得", color: "#059669" },
  { value: "easy", label: "轻松", color: "#0284c7" },
];

/** 一轮队列上限——镜像后端 DUE_LIST_LIMIT_MAX=200（list_due_cards 截断值）；
 *  全页化后一轮=全部到期卡的上限批，超出部分下一轮再取（旧模态 50 太小，
 *  独立页打开即练的场景下 200 才是后端能力全量） */
const ROUND_LIMIT = 200;

interface Props {
  /** 组过滤（null=全部到期卡） */
  groupId: number | null;
  /** 会话范围名（头部展示：组名 / 全部组） */
  groupName: string;
  /** 页面是否可见（ReviewPage active 透传——display:none 保活期不注册 ESC；
   *  缺省 true=既有测试/独立宿主兼容） */
  active?: boolean;
  /** 退出本轮（返回总览；头部按钮与 ESC 同义） */
  onExit: () => void;
}

export default function ReviewSessionPanel({ groupId, groupName, active = true, onExit }: Props) {
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false);
  // 上一张卡的**新间隔**（`review_card` 返回体的 intervalDays —— PB2 ①域：精确值）。
  // null = 尚未评分 / 后端没给该字段（不猜 0：「缺失」≠「间隔为 0」，PB2 裁决）
  const [lastInterval, setLastInterval] = useState<number | null>(null);

  // 加载到期队列（一次性——复习中评分出的卡不回插本队列，下次再现）
  const loadQueue = useCallback(async () => {
    try {
      const cards = await invoke<Flashcard[]>("list_due_cards", { groupId, limit: ROUND_LIMIT });
      setQueue(cards);
    } catch (e) {
      setStatus(`复习队列加载失败: ${e}`);
    } finally {
      setLoaded(true);
    }
  }, [groupId]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  // ESC 退出（复习中误触保护：原模态语义——直接退出本轮，未评分卡不算）。
  // 审查 P2-11：监听注册门控到 active——复习会话在页面隐藏期（display:none
  // 保活）仍可能进行中，全局 window 监听会把**别页的 ESC** 误判为退出信号
  // （静默结束隐藏中的复习会话）；仅可见期注册、隐藏期不注册，卸载清理照旧
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      // 长按自动重复（e.repeat）只退一次——首次已触发 onExit 卸载面板，
      // 重复 keydown 属物理按键噪声（防抖口径与行菜单 ESC 一致）
      if (e.key !== "Escape" || e.repeat) return;
      onExit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, onExit]);

  const current = queue[index] ?? null;

  const rate = async (rating: string) => {
    if (!current) return;
    try {
      // 接住返回值（PB2 Q5：旧写法 `await invoke(...)` 把整份返回体丢弃）。这里用的是
      // `review_card` 的 **intervalDays = 精确域**（①域）—— 与 `list_due_cards` 的整天粒度
      // **不同源**，故绝不与队列里的整天值混用（PB2：两个精度域不许混为一谈）。
      const rated = await invoke<Flashcard>("review_card", { cardId: current.id, rating });
      const days: unknown = rated?.intervalDays;
      setLastInterval(typeof days === "number" && Number.isFinite(days) ? days : null);
      setDone((d) => d + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
      setStatus("");
    } catch (e) {
      setStatus(`评分失败: ${e}`);
    }
  };

  const finished = loaded && (!current || index >= queue.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* 会话头部（页面自适应形态——去模态遮罩后的固定工具行） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid #e5e7eb", background: "#fff", flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>🎴 复习 · {groupName}</span>
        {current && <Text size={5} tone="ink-3" testId="session-progress">{index + 1}/{queue.length}</Text>}
        {/* 评分回执：`review_card` 返回的 intervalDays（精确域）—— 字段被真用起来的可见证据 */}
        {lastInterval !== null && (
          <Text size={5} tone="due" testId="session-last-interval">{`上一张下次间隔 ${lastInterval} 天`}</Text>
        )}
        <button
          onClick={onExit}
          data-testid="session-exit"
          style={{ marginLeft: "auto", cursor: "pointer", fontSize: 13, border: "none", background: "none", color: "#6b7280" }}
          title="结束本轮，返回总览（未评分卡不算）"
        >
          ✕ 退出本轮
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 24 }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {!loaded && (
            <div>
              {/* 批 4 T14：可读语义（role="status" + 逐字文案）由 `Loading` 给，骨架只承载形状 */}
              <Loading />
              <div style={{ marginTop: 10 }}>
                <Skeleton lines={3} />
              </div>
            </div>
          )}

          {finished && (
            <div data-testid="session-finished" style={{ textAlign: "center", padding: "48px 0" }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>
                {done > 0 ? `本轮复习完成：${done} 张卡片` : "当前没有到期卡片"}
              </p>
              <Text as="p" size={5} tone="ink-3" style={{ marginTop: 6 }}>
                {done > 0
                  ? "间隔已由 FSRS 推进，到期后再来。"
                  : "本范围没有到期卡——可在笔记页组 ⓘ「⚙ 生成闪卡」补充卡池，或等待调度到期。"}
              </Text>
              <button
                onClick={onExit}
                data-testid="session-back-overview"
                style={{ marginTop: 18, padding: "8px 20px", fontSize: 13, cursor: "pointer", background: "#0f766e", color: "#fff", border: "none", borderRadius: 8 }}
              >
                ✓ 回到总览
              </button>
            </div>
          )}

          {current && !finished && (
            <div>
              {/* 卡类型徽标（REQ-199 内容分型 + REQ-201 碎片卡——身份诚实可见） */}
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                {current.fragmentId != null && (
                  <span style={{ fontSize: 10, color: "#7c3aed", background: "#faf5ff", borderRadius: 8, padding: "0 6px" }}>
                    🧩 碎片卡
                  </span>
                )}
                {current.kind === "action" && (
                  <span style={{ fontSize: 10, color: "#b45309", background: "#fffbeb", borderRadius: 8, padding: "0 6px" }}>
                    ⚡ 动作卡
                  </span>
                )}
                {current.kind === "model" && (
                  <span style={{ fontSize: 10, color: "#7c3aed", background: "#faf5ff", borderRadius: 8, padding: "0 6px" }}>
                    🧠 概念卡
                  </span>
                )}
              </div>
              {/* front（线索——先回忆再看） */}
              <div style={{
                minHeight: 90, padding: 16, background: "#f9fafb", borderRadius: 8,
                fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {current.front}
              </div>
              {!revealed ? (
                <button
                  onClick={() => setRevealed(true)}
                  style={{
                    width: "100%", marginTop: 12, padding: "10px 0", fontSize: 14,
                    cursor: "pointer", background: "#0f766e", color: "#fff",
                    border: "none", borderRadius: 8,
                  }}
                >
                  回忆完成 · 查看答案
                </button>
              ) : (
                <>
                  {/* back（验证材料） */}
                  <div style={{
                    marginTop: 10, minHeight: 70, padding: 14, background: "#f0fdfa",
                    borderRadius: 8, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap",
                    maxHeight: 220, overflowY: "auto",
                  }}>
                    {current.back}
                  </div>
                  {/* 四档评分（提取质量自评 → FSRS 调度） */}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {RATINGS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => void rate(r.value)}
                        style={{
                          flex: 1, padding: "8px 0", fontSize: 13, cursor: "pointer",
                          border: `1px solid ${r.color}`, color: r.color,
                          background: "#fff", borderRadius: 6,
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {/* v0.13.2 kind==='model' 卡：纳入体系（独立一行，不打断评分流——§五） */}
                  {current.kind === "model" && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f3f4f6" }}>
                      <PromoteCardButton card={current} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {status && <div style={{ marginTop: 8 }}><StatusLine kind="error">{status}</StatusLine></div>}
        </div>
      </div>
    </div>
  );
}
