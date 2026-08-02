/**
 * 流式输出光标
 *
 * @ai-context: 赛博青闪烁光标，标示 AI 正在生成回复；
 * 纯 CSS animate-pulse，零 JS 开销。
 */
export function StreamingCursor() {
  return (
    <span className="inline-block w-[2px] h-[1em] bg-cyber ml-0.5 animate-pulse align-text-bottom" />
  );
}
