/**
 * sessionEligibility — 会话「可转笔记」判定的原子层（批 0-C2 自 SessionListPanel 拆出）。
 *
 * @ai-context: 纯函数零副作用：可转化 = 已结束（非录制中）+ 有内容 + 未转。
 *              面板（右键菜单 canConvert）、列表行（canConvert）与批量转笔记栏
 *              （eligible 过滤）三处消费**同一口径**——分散实现会让「行内按钮可点
 *              但批量被静默跳过」漂移。
 * @ai-context 边界：status="recording" 不可转（转写未定稿即转会产生半截笔记）；
 *              hasContent=false（无转写且无 OCR 的空会话）不可转；hasNote=true
 *              已转不重复转（后端 noteId 唯一，重复转会写第二份）。
 */
import type { SessionListItem } from "../types";

/** 可转化判定：已结束 + 有内容 + 未转（批量转只对该集合生效） */
export function isSessionConvertible(item: SessionListItem): boolean {
  return item.session.status !== "recording" && item.hasContent && !item.hasNote;
}
