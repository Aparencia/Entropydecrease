/**
 * resolveNoteImageSrc — 笔记图片 src 解析纯函数（v0.14 子项目 A 提取）。
 *
 * @ai-context: 编辑（RichEditorView 图片 widget）与阅读（NoteImage）共用同一判定
 *              逻辑：http/https/data/blob 直出无需本地解析；空白为无效；其余视为
 *              data_dir 相对引用（经 resolve_note_image 命令校验）。纯逻辑无副作用，
 *              可单测（spec §6.1：相对/绝对/外链/空 src 四类覆盖）。
 */

/** 图片 src 归属类型 */
export type ImageSrcKind = "external" | "local" | "invalid";

/** 无需本地解析的直出源（http/data/blob） */
const EXTERNAL = /^(https?:|data:|blob:)/i;

export function resolveNoteImageSrc(src: string): ImageSrcKind {
  const trimmed = src.trim();
  if (!trimmed) return "invalid";
  return EXTERNAL.test(trimmed) ? "external" : "local";
}
