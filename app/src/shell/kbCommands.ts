/**
 * @ai-context ⌘K 的**数据源适配层**（规格 §9 表第 14 行：`kb_search` → 补 UI（本批），说明逐字
 *   「**⌘K 的数据源**（ADR-029 RAG 层）」；批 3 Task 12）。
 *
 * Why 单独立文件：把「IPC 结果 → 命令列表」做成**纯函数**，就能在没有 Tauri 运行时的 vitest 环境里测
 *   （本仓 vitest 全局 `environment: "node"`，`invoke` 不可用）⇒ T12 的测试面是 100%，而不是 0%。
 *
 * 契约**逐字取自 Rust**（`app/src-tauri/src/commands_kb.rs:36-60`，不凭记忆写）：
 *   `pub fn kb_search(state: State<'_, AppState>, query: String, limit: Option<usize>) -> Result<Vec<KbHit>, String>`
 *   · 入参 `query: String` / `limit: Option<usize>`（JS 侧键名同名：两个参数都无下划线，不受 camelCase 重命名影响）；
 *   · 返回 `Vec<KbHit>`，`KbHit` 带 `#[serde(rename_all = "camelCase")]` ⇒ 前端 `KbHit`（`app/src/types/chat.ts:40`）逐字段同形；
 *   · 错误是 `String`（`Result<_, String>`）⇒ IPC 拒绝值即可读中文串，不是结构化错误体；
 *   · Rust 侧行为：空白 query ⇒ `Ok(vec![])`（不报错）· `query.chars().count() > 500` ⇒ `Err("查询过长（≤500 字符）")`
 *     · `limit` 缺省 10 且 `.min(50)`（命令层**只夹上界**；下界 1 在引擎层 `kb_search.rs:107` 的 `.clamp(1, 50)`）。
 *   ⚠️ 本任务**不增删命令**（`kb_search` 早已注册，见 `check-command-registry.mjs` 的 312/312）。
 *
 * 防御性（AGENTS.md §3.4：系统调用必须有超时/重试/降级）：
 *   · 查询串空白 ⇒ **不发 IPC**，返回空列表（Rust 侧对空白串也返回空，但省一次往返）；
 *   · IPC 抛错 ⇒ 返回空列表且**不抛出**（⌘K 是导航入口，不能因为检索失败而不可用）——失败经
 *     `degraded` 标记上抛给面板显示灰字提示（**不是空 catch**：`console.warn` 带命令名与原因）；
 *   · 命中缺字段 / 形状不对 / 无跳转目标 ⇒ **跳过该条**（不让一条脏数据毁掉整个列表）。
 *
 * 边界：本模块**不 import 任何 React**（纯逻辑；也因此可脱离 Tauri 运行时单测）· 不做排序（顺序由后端给）
 *   · 不做中文分词（Rust 侧 `kb_fts.rs` 已把中文规划成 trigram）· 不碰 `focus*` 状态（落状态机是 `App.tsx` 的事）。
 */
import { invoke } from "@tauri-apps/api/core";
import type { KbHit } from "../types";
import { firstMarkedTerm, hitLabel } from "../utils/kbHits";
import type { Command } from "./CommandPalette";

/** Rust `KB_SEARCH_DEFAULT_LIMIT` 的前端镜像（两端同值：默认取 10 条命中） */
export const KB_SEARCH_DEFAULT_LIMIT = 10;
/**
 * Rust `KB_SEARCH_MAX_LIMIT` 的前端镜像（**上界**同值 50）。⚠️ 口径**不是**「两端同一处 clamp」（M-4）：
 * Rust **命令层**只夹上界（`commands_kb.rs:57` = `limit.unwrap_or(10).min(50)`，`Some(0)` 原样透传）——
 * 下界 1 要到**引擎层** `kb_search.rs:107` 的 `.clamp(1, KB_SEARCH_MAX_LIMIT)` 才兜住 ⇒ 前端在命令层
 * 就自夹 `[1, 50]`（`kbSearchHits`）；**别照这条注释去 Rust 命令层"对齐"下界**（那边本来就没有）。
 */
export const KB_SEARCH_MAX_LIMIT = 50;

/**
 * 输入变化后的防抖窗（计划 Step 4 逐字 180ms，**本批唯一允许的计时器**；不得引入动效）。
 * 放这里而不是组件里：它是「数据源的取样节奏」，且这样能被纯函数测试面看见。
 */
export const KB_SEARCH_DEBOUNCE_MS = 180;

/** 一条命中派生的**跳转意图**（App 侧落到 `focus*` 状态机；本模块只描述、不执行） */
export interface HitJump {
  /** 目标笔记（`focusNoteId` 的载荷——kb 命中里只有笔记有跳转目标） */
  noteId: number;
  /** snippet 首个标记词（`focusNoteSearch.search`；空串 = 不注入笔记内搜索，与 `CitationChips` 同口径） */
  search: string;
  /** 命中块 id（命令 id 的一部分；同一次检索里天然唯一） */
  chunkId: number;
}

/** 命令被选中时的跳转回调（面板注入 `onPick`；纯函数测试里注入探针） */
export type HitJumpHandler = (jump: HitJump) => void;

/** 元素级契约校验：形状不对 / 碎片命中（无跳转页）/ 缺 noteId ⇒ 不可用（跳过该条） */
function isJumpable(x: unknown): x is KbHit & { noteId: number } {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.chunkId === "number" &&
    o.sourceKind === "note" &&
    typeof o.noteId === "number" &&
    typeof o.snippet === "string"
  );
}

/**
 * 命中 → 结果命令（计划 `Interfaces` 的 `commandsFromHits(hits: KbHit[]): Command[]`；
 * 第二参可选，是本文件的加法：面板用它把「选中」接回 `onPick`，纯函数测试用它做探针）。
 */
export function commandsFromHits(hits: readonly KbHit[], onJump?: HitJumpHandler): Command[] {
  const out: Command[] = [];
  for (const hit of hits) {
    if (!isJumpable(hit)) continue;
    const jump: HitJump = { noteId: hit.noteId, search: firstMarkedTerm(hit.snippet) ?? "", chunkId: hit.chunkId };
    out.push({
      id: `hit:${hit.chunkId}`,
      label: hitLabel(hit),
      hint: "命中",
      run: () => onJump?.(jump),
    });
  }
  return out;
}

/** 一次 `kb_search` 的**原始命中** + 降级标记（⌘K 的 hook 要数「命中里被跳过的条数」⇒ 命中层单独开口） */
export interface KbHitsOutcome { hits: KbHit[]; degraded: boolean }

/** 一次 `kb_search` 的结果 + 是否走了降级路径（面板据此显示灰字提示；「没命中」**不算**降级） */
export interface KbSearchOutcome { commands: Command[]; degraded: boolean }

/** IPC 拒绝值的可读化（错误是 Rust 的 `String`，但也可能被运行时包成 Error——两种都给出信息量） */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return JSON.stringify(e) ?? String(e);
}

/**
 * 检索 → **原始命中**（带降级标记）。⌘K 的 hook 走这条：除了「命中 → 命令」，它还要算
 * **被跳过的条数**（I-2：无跳转目标的命中必须在 UI 上如实说出来，不许静默丢弃后谎报「没有匹配」）。
 * 「空结果」与「检索失败」必须可区分 ⇒ 失败时 `degraded = true` 且**不抛**。
 */
export async function kbSearchHits(q: string, limit: number = KB_SEARCH_DEFAULT_LIMIT): Promise<KbHitsOutcome> {
  const query = q.trim();
  // 空白串不发 IPC（省一次往返；Rust 侧同样返回空）——也顺带让「只输空格」不进降级态
  if (!query) return { hits: [], degraded: false };
  const n = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), KB_SEARCH_MAX_LIMIT) : KB_SEARCH_DEFAULT_LIMIT;
  try {
    const hits = await invoke<KbHit[]>("kb_search", { query, limit: n });
    // 后端契约是数组；真收到别的形状（版本漂移/代理层包装）按空结果处理，不猜结构
    return { hits: Array.isArray(hits) ? hits : [], degraded: false };
  } catch (e) {
    console.warn("[kbCommands] kb_search 失败——⌘K 降级为仅页面命令:", describeError(e));
    return { hits: [], degraded: true };
  }
}

/**
 * 检索 → 结果命令（带降级标记；「空结果」与「检索失败」必须可区分）。
 * 计划 `Interfaces` 的 `searchCommands` 见下方薄封装。
 */
export async function kbSearchCommands(
  q: string,
  limit: number = KB_SEARCH_DEFAULT_LIMIT,
  onJump?: HitJumpHandler,
): Promise<KbSearchOutcome> {
  const { hits, degraded } = await kbSearchHits(q, limit);
  return { commands: commandsFromHits(hits, onJump), degraded };
}

/** 计划 `Interfaces` 的逐字签名 `searchCommands(q, limit?)`：只要结果命令、不要降级标记时用它 */
export async function searchCommands(q: string, limit?: number, onJump?: HitJumpHandler): Promise<Command[]> {
  return (await kbSearchCommands(q, limit ?? KB_SEARCH_DEFAULT_LIMIT, onJump)).commands;
}
