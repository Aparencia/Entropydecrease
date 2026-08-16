/**
 * 窗口智能评分与过滤模块（组合入口）
 *
 * 编排信号层（windowSignals）与规则层（windowRules）：对 desktopCapturer
 * 返回的窗口列表附加系统信号（进程/几何/前台）与记忆 boost 后双向打分排序，
 * 过滤系统/不可见窗口，将最可能是网课/直播/会议的窗口排在前面。
 * 无信号注入时退化为纯标题评分（与旧版行为一致）。
 *
 * @ai-context: 采集窗口智能评分过滤：排除自身窗口（含旧品牌'课伴'关键词——
 * 防旧版本窗口被采集，为兼容保留勿删）与系统窗口。信号源全部可选：native
 * 缺失时仅标题关键词评分，保证行为不回归。
 * @ai-context EN: Composition entry for window scoring. All signal sources
 * are optional; without them the output matches legacy title-only behavior.
 */
import { scoreWindow, type Confidence, type WindowSignalInput } from './windowRules.js';

// ================================================================
// 类型定义
// ================================================================

export interface ScoredWindow {
  id: string;
  title: string;
  thumbnail: string;
  score: number;
  matched?: string;
  processName?: string;
  confidence?: Confidence;
  reasons?: string[];
  /** 未被娱乐负分主导的学习分 */
  learningScore?: number;
  /** 记忆命中的课程名（供渲染层回填课程） */
  memoryCourseName?: string;
  /** 是否前台窗口（渲染层自动选中规则②使用） */
  isForeground?: boolean;
}

export interface ScoreAndFilterOptions {
  /** 按 source id 注入的信号 */
  signalsBySourceId?: Map<string, WindowSignalInput>;
  /** 记忆查找注入（windowHistory 包装） */
  memoryLookup?: (processName: string, title: string) => { courseName?: string; boost: number } | null;
}

export function scoreAndFilterWindows(
  windows: { id: string; title: string; thumbnail: string }[],
  options?: ScoreAndFilterOptions,
): ScoredWindow[] {
  const scored: ScoredWindow[] = [];

  for (const win of windows) {
    if (!win.title || win.title.trim() === '') continue;

    const signal: WindowSignalInput = {
      title: win.title,
      ...(options?.signalsBySourceId?.get(win.id) ?? {}),
    };

    const result = scoreWindow(signal);
    if (result.filtered) continue;

    const out: ScoredWindow = {
      id: win.id,
      title: win.title,
      thumbnail: win.thumbnail,
      score: result.score,
      matched: result.reasons[0],
      reasons: result.reasons,
      confidence: result.confidence,
      learningScore: result.score - result.entertainmentPenalty,
    };

    if (signal.processName) out.processName = signal.processName;
    if (signal.isForeground) out.isForeground = true;

    // 记忆查找以标题为锚：进程缺失时传空串降级调用，不阻断记忆命中
    if (options?.memoryLookup) {
      const mem = options.memoryLookup(signal.processName ?? '', win.title);
      if (mem) {
        out.score += mem.boost;
        out.memoryCourseName = mem.courseName;
      }
    }

    scored.push(out);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return scored;
}
