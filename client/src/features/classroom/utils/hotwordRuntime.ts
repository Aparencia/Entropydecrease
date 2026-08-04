/**
 * 课堂会话级热词运行时（P1-3 接线层，外置以控制 useClassroomEvents 行数）
 * Session-scoped hotword runtime: loads the course vocabulary at session
 * start and exposes a sync apply-function for transcript display points.
 *
 * @ai-context: 会话启动时按 courseMeta.courseName 一次性加载"课程专属 +
 * 全局"词条（hotwordStore），替换词条转为 ReplaceRule 供展示层单点调用；
 * boost 词条暂存备用（本地 ASR 暂不支持 hotwords，见 local-asr TODO）。
 * 模块级单例状态：同一时刻仅一个采集会话，stop 时 clear。
 * @ai-context: EN: replacing acts on display text only — storage keeps the
 * original transcript (audioSegments.audioText) for traceability. Load
 * failures degrade silently to "no vocabulary" (local-first, never blocking).
 */
import { hotwordStore } from '@/lib/storage/hotwordStore';
import { applyReplaceTerms, type ReplaceRule } from '@/lib/capture/hotwordApply';

/** 当前会话生效的替换规则（会话启动时加载，停止时清空） */
let activeReplaces: ReplaceRule[] = [];
/** 当前会话生效的热词增强词（预留送 ASR 引擎） */
let activeBoosts: string[] = [];
/**
 * 会话代际标记：load 为异步（Dexie 查询），若其 resolve 前会话已 stop
 * （clear 使 seq 前进），resolve 时丢弃陈旧结果，防止旧词表被写回。
 */
let sessionSeq = 0;

/**
 * 会话启动时加载词表：课程专属词条（courseId === courseName）+ 全局词条。
 * 失败静默降级为空词表，不阻塞采集启动时序。
 */
export async function loadSessionHotwords(courseName?: string): Promise<void> {
  const seq = ++sessionSeq;
  try {
    const entries = await hotwordStore.listForCourse(courseName);
    // 代际校验：await 期间已 stop / 被新会话覆盖 → 丢弃陈旧结果
    if (seq !== sessionSeq) return;
    activeReplaces = entries
      .filter((e) => e.enabled && e.kind === 'replace' && e.term.length > 0)
      .map((e) => ({ term: e.term, target: e.target ?? '' }));
    activeBoosts = entries
      .filter((e) => e.enabled && e.kind === 'boost' && e.term.length > 0)
      .map((e) => e.term);
  } catch (err) {
    if (seq !== sessionSeq) return;
    console.warn('[hotwordRuntime] 词表加载失败，本次会话不应用热词:', err);
    activeReplaces = [];
    activeBoosts = [];
  }
}

/** 会话停止时清空（防止陈旧词表作用于残余转写回调） */
export function clearSessionHotwords(): void {
  // 先推进代际，使在途 load 的 await 结果作废，再清空
  sessionSeq++;
  activeReplaces = [];
  activeBoosts = [];
}

/** 展示层单点入口：对 final 转写文本应用当前会话替换词条（无词条时原样返回） */
export function applySessionReplaces(text: string): string {
  return applyReplaceTerms(text, activeReplaces);
}

/** 当前会话热词增强词列表（5.3 预留：ASR 引擎支持后经可选 IPC 字段透传） */
export function getSessionBoostWords(): string[] {
  return activeBoosts;
}
