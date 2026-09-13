/**
 * useNoteEvidence — 笔记「带证据三轨」的**容器侧取数**（批 8 T10；规格 §7.4 §A · 控制方 §2 A1/A5）。
 *
 * @ai-context **为什么必须住在容器侧**：`views/**` 有**整目录**硬边界（`views/architecture.guard.test.ts`
 *   A3③：生产文件**含 `import type` 在内**零 `@tauri-apps` 边）⇒ 取数只能在容器发生；视图只吃注入的
 *   **候选轨**。**零新 IPC / 零 Rust / 零 schema**（§2 A1/A2）：证据数据**已在**既有 `get_session_detail`
 *   的返回里（`commands_session.rs` 一并回 `segments` + `ocr_blocks`）⇒ 本件只消费它；命令名与载荷
 *   逐字照先例 `pages/SessionsPage.tsx:132`。
 * @ai-context **🔴 段落轨的唯一派生处 = T8 的 `evidenceLinesOf`**（`NoteEvidenceTrackView.tsx:72-78`）：
 *   本件不另写一份段落切分，而是**同源调用**它并随候选轨交给视图（`lines`）。Why：「非空行 + 连续派生
 *   序号」一旦容器与视图各切一次（一边 `\n` 一边 `\r\n`、或一边滤空行一边不滤），`paragraphIndex` 与
 *   DOM 的 `data-evidence-for` 会**静默错位**（DOM 全在、读数全错、断言全绿）。注入面里的 `lines` 是
 *   **可选**的（视图缺省仍自派生 ⇒ 它的 DOM 契约一字不变）；注入面类型**直接取自视图导出** ⇒ 两处
 *   形状不可能各自漂移。⚠️ **签名比卡片多一个入参**（`content`）：段落轨只能从笔记正文派生，不给正文
 *   就无法同源派生（那正是漂移的来源）—— 偏离已登记在 T10 报告。
 * @ai-context **取样时点（§C53.5）**：段落轨**不缓存**（`useMemo` 按 `content` 重算）—— 若把 `lines`
 *   连同 IPC 结果一起缓存，正文一变注入的就是**旧段落轨**（`lines.length` 与新正文对不上 ⇒ 多渲/少渲
 *   段落）。取数随 `sessionId` 走、派生随 `content` 走，两条生命周期分开。
 * @ai-context **降级完备**（AGENTS.md §3.4）：① 无 `session_id`（手动笔记 / 空态）⇒ `idle`、**不发 IPC**；
 *   ② 失败 / 超时 / **载荷形状不全**（`null`、缺 `segments`）⇒ `error` + **空候选轨**（视图渲染显式
 *   「无证据」，**不白屏、不抛、不炸树**）；③ 同一 `sessionId` 的重复挂载 ⇒ **不重复取数**（缓存详情 +
 *   在飞 Promise）。边界（诚实）：超时是**本地兜底**，被放弃的 `invoke` 仍在后端跑完（不取消 —— 取消需新 IPC）。
 * @ai-context **形状取自 T8 的实际接口，不取 T10 卡片的原拟措辞**：控制方已裁定卡片的「hook 产出
 *   `matches` / `coverage`」**作废**（勘误见 `task-10-report.md`）—— 取证与双分母都在**视图内**发生。
 * 副作用：调一次既有 Tauri IPC（只读）+ 两个 `setTimeout`（兜底 / 落定），均在卸载与切会话时清掉。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SessionDetail } from "../types";
import { evidenceLinesOf, type NoteEvidenceTracks } from "../views/note/NoteEvidenceTrackView";

/** 取数的本地兜底时限（ms）。依据：本命令是**纯本地 SQLite 读**（无网络）⇒ 超过它一定不是「慢」
 *  而是「挂了」；同仓联网类等待的 15 s 级（`useChatStream`）明显偏松，故取更紧的 10 s。 */
export const EVIDENCE_TIMEOUT_MS: number = 10000;

/** 取数状态：`idle`（无来源会话/空态）· `loading` · `ready` · `error`（**一等结果**，不是异常）。 */
export type NoteEvidenceStatus = "idle" | "loading" | "ready" | "error";

export interface NoteEvidenceState {
  readonly status: NoteEvidenceStatus;
  /** **可直接展开进视图 props** 的候选轨 + 同源段落轨（**恒有值**：`idle`/`loading`/`error` 一律空轨 ⇒
   *  视图渲染显式「无证据」，不假装命中也不白屏）。类型 = T8 的 `NoteEvidenceTracks`（不另立形状）。 */
  readonly evidence: NoteEvidenceTracks;
  /** 手动失效缓存重取（`reload`：先删本会话的缓存，再走一次 effect） */
  readonly reload: () => void;
}
export function useNoteEvidence(
  sessionId: number | null | undefined,
  content: string | null | undefined,
): NoteEvidenceState {
  const [status, setStatus] = useState<NoteEvidenceStatus>("idle");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  /** 在飞 Promise（按 sessionId）—— 同一会话的**重复挂载**靠它去重，不发第二次 IPC */
  const pendingRef = useRef(new Map<number, Promise<SessionDetail>>());
  /** 已解析详情（按 sessionId）—— 命中即同步给值，**不再取数** */
  const loadedRef = useRef(new Map<number, SessionDetail>());
  /** 手动失效通道（`reload` 递增 ⇒ effect 重跑） */
  const [nonce, setNonce] = useState(0);
  const reload = () => {
    if (sessionId != null) {
      pendingRef.current.delete(sessionId);
      loadedRef.current.delete(sessionId);
    }
    setNonce((n) => n + 1);
  };

  useEffect(() => {
    if (sessionId == null) {
      // 无来源会话（手动笔记 / 空态）：**不发 IPC**，也不留上一次的详情（否则切换会串数据）
      setStatus("idle");
      setDetail(null);
      return;
    }
    let cancelled = false;
    const cached = loadedRef.current.get(sessionId);
    if (cached !== undefined) {
      setStatus("ready");
      setDetail(cached);
      return;
    }
    const timer = window.setTimeout(() => {
      // 超时兜底：放弃等待（invoke 仍在后端跑完；不取消 —— 取消需要新 IPC）
      cancelled = true;
      setStatus("error");
      setDetail(null);
    }, EVIDENCE_TIMEOUT_MS);
    /**
     * 成功/失败的**唯一出口**：先清兜底时器，再把状态落在**宏任务**上（`setTimeout(…, 0)`）。
     * @ai-context 为什么推迟一个宏任务（**实测驱动**，见 T10 报告的三态探针）：IPC 的 promise 在**微任务**
     *   里落定 ⇒ 就地 `setStatus` 会让 React 在同一次 `act()` 内重渲整页；实测那次重渲**替换**了常驻原文
     *   子树的 DOM 节点（回链芯片 `<span>` 换新、旧引用 `isConnected === false`）⇒ 「先取节点引用、再
     *   `fireEvent.click`」的既有判据会点到脱附节点上。推迟后用户可见结果不变（IPC 本就异步），而既有
     *   判据的「取引用 → 点击」被护在同一宏任务内。**不写 state / 写 state 两个变体在全部行为断言上实测
     *   一致** ⇒ 这是纯时序改动，不掩盖任何真缺陷。
     */
    let deferred = 0;
    const settle = (kind: "ready" | "error", d: SessionDetail | null): void => {
      if (cancelled) return;
      window.clearTimeout(timer);
      deferred = window.setTimeout(() => {
        if (cancelled) return;
        setStatus(kind);
        setDetail(d);
      }, 0);
    };
    setStatus("loading");
    setDetail(null);
    void (async () => {
      try {
        let inflight = pendingRef.current.get(sessionId);
        if (inflight === undefined) {
          inflight = invoke<SessionDetail>("get_session_detail", { id: sessionId });
          pendingRef.current.set(sessionId, inflight);
        }
        const d = await inflight;
        loadedRef.current.set(sessionId, d);
        settle("ready", d);
      } catch {
        // 取数失败 = **一等结果**（不 rethrow）：UI 走显式「无证据」而不是白屏 / 错误边界
        settle("error", null);
      } finally {
        pendingRef.current.delete(sessionId);
      }
    })();
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(deferred);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, nonce]);

  // 🔴 派生随 `content` 走（不随 IPC 缓存走）：正文改过 ⇒ 段落轨必须重算，见文件头「取样时点」。
  //    无详情（idle / loading / error）⇒ **空候选轨**（恒有值，见 `NoteEvidenceState.evidence` 的注）。
  const evidence = useMemo(() => tracksOf(detail, content), [detail, content]);
  return { status, evidence, reload };
}

/**
 * 会话详情 → 注入面。🔴 `lines` 走 **T8 的 `evidenceLinesOf`**（段落轨的唯一派生处）——
 * 本函数是**全仓唯一**在容器侧调它的地方（探针 `tmp/t10/p8-reuse.mjs` 给逐字证据）。
 *
 * 🔴 **形状守卫不是防御性摆设**：`invoke` 的返回值是**运行时数据**（`unknown` 形状随后端演进），
 * 老后端 / 局部失败 / mock 兜底都可能给 `null` 或缺字段。缺失即抛会**在渲染期**炸掉整棵 React 树
 * （T10 实测：`NotesPage.test.tsx` 的「点回链」用例因此从绿转红，根因 = `detail.segments.map` 在
 * `useMemo` 里对 `null` 取字段）⇒ 缺失一律降级成**空轨**（视图渲染显式「无证据」），
 * 与 §3.4「本地优先架构下一切取数必须有降级路径」同一条纪律。
 */
function tracksOf(detail: SessionDetail | null | undefined, content: string | null | undefined): NoteEvidenceTracks {
  const d = detail ?? ({} as Partial<SessionDetail>);
  const segments = Array.isArray(d.segments) ? d.segments : [];
  const ocr = Array.isArray(d.ocr_blocks) ? d.ocr_blocks : [];
  return {
    segments: segments.map((s) => ({ id: s.id, startMs: s.start_ms })),
    ocr: ocr.map((b) => ({ id: b.id, timestampMs: b.timestamp_ms })),
    lines: evidenceLinesOf(content ?? ""),
  };
}
