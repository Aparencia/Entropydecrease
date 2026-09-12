/**
 * @ai-context ⌘K 的**检索取样 hook**（批 3 Task 12；规格 §6.1「⌘K 命令入口」+ §9 表第 14 行
 *   「`kb_search` → ⌘K 的数据源」）。
 *
 * Why 从 `CommandPalette.tsx` 里拆出来：面板本体的行数红线是 **≤220**（计划 `### Task 12` 的
 *   Files 行），把「防抖 + 只认最后一次请求 + 失败降级」塞进组件会把接线细节和渲染细节糊在一起
 *   并且越线。拆出来之后：**数据形状在 `kbCommands.ts`（纯函数）· 取样节奏在本文件（hook）·
 *   渲染与键盘在 `CommandPalette.tsx`** —— 三块各自可单测，各自守自己的行数。
 *
 * 四条行为纪律（计划 Step 4 逐字，加两条 follow-up）：
 *   · 输入变化后 **`KB_SEARCH_DEBOUNCE_MS`（180ms）** 防抖（**本批唯一允许的计时器**；且这里**消费**
 *     那个常量而不是硬写裸数字 —— M-2：否则「单一真源」名存实亡，改常量运行期一个字都不变）；
 *   · **只认最后一次请求**（`seq` 计数，与 `NotesPage` 的 `seqRef` 同款）：慢响应回来时若已不是
 *     最后一次，直接丢弃 —— 否则旧查询的结果会覆盖新查询的；
 *   · **关闭/重查时作废在飞响应**（M-5：`open` 变 false 时 effect 不会重跑，只有清理函数能递增
 *     `seq` —— 否则「输入后立刻 Esc」的迟到结果照样写进状态）；
 *   · **失败静默降级**：`kbCommands` 已把 IPC 错误吞成空列表（并 `console.warn` 带上下文），这里
 *     把它的 `degraded` 标记原样交给面板显示一行灰字提示 —— 「检索失败」与「没有命中」两种情形
 *     在 UI 上必须给不同的说法；同理，**命中但无跳转目标**的条数（`skipped`）也要如实上抛（I-2）。
 *
 * 边界：本 hook **不认识任何 `focus*` 状态**（只把跳转意图交给注入的回调，落库是 `App.tsx` 的事）；
 *   不做本地过滤（页面命令的过滤在面板里，检索结果由后端给序）。
 */
import { useEffect, useRef, useState } from "react";
import {
  commandsFromHits,
  KB_SEARCH_DEBOUNCE_MS,
  KB_SEARCH_DEFAULT_LIMIT,
  kbSearchHits,
  type HitJumpHandler,
} from "./kbCommands";
import type { Command } from "./CommandPalette";

/** 取样结果（`commands` 空 = 尚未返回或没有可跳转的命中；`skipped` = 命中里无跳转目标、被跳过的条数） */
export interface KbPaletteResults {
  commands: readonly Command[];
  skipped: number;
  degraded: boolean;
}

export function useKbPaletteSearch(open: boolean, query: string, onJump: HitJumpHandler): KbPaletteResults {
  const [results, setResults] = useState<KbPaletteResults>({ commands: [], skipped: 0, degraded: false });
  const seqRef = useRef(0);
  // 回调走 ref 镜像（与 `CommandPalette` 的 closeRef 同款）：调用点写的是内联箭头（每次渲染新身份），
  // 直接进 deps 会让每个按键都重挂一次取样链。
  const jumpRef = useRef(onJump);
  useEffect(() => {
    jumpRef.current = onJump;
  }, [onJump]);
  useEffect(() => {
    if (!open) return;
    const seq = ++seqRef.current;
    const q = query.trim();
    if (!q) {
      // 空查询 = 只列页面命令（也是每次打开时的初始态）；不发 IPC（Rust 侧对空白串同样返回空）
      setResults({ commands: [], skipped: 0, degraded: false });
      return;
    }
    // 防抖窗宽走常量（不是裸 180）：这样改常量 ⇒ 行为跟着改（M-2 的单一真源）
    const timer = setTimeout(() => {
      void kbSearchHits(q, KB_SEARCH_DEFAULT_LIMIT).then((out) => {
        if (seq !== seqRef.current) return; // 过期响应直接丢弃（慢的那次不得覆盖新的；关闭面板也作废）
        const commands = commandsFromHits(out.hits, jumpRef.current);
        // 被跳过的条数 = 命中总数 − 可跳命令数（同一把 `isJumpable` 尺子，不另写一套判定）
        setResults({ commands, skipped: out.hits.length - commands.length, degraded: out.degraded });
      });
    }, KB_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      // M-5：递增 seq 作废在飞响应 —— 关闭面板/重查时 effect 不重跑，只有这里拦得住迟到的 setResults
      seqRef.current += 1;
    };
  }, [open, query]);
  return results;
}
