/**
 * 字符串哈希工具（全站统一入口）
 *
 * @ai-context: 2026-08 全仓体检（D12）收敛——此前 NotesPage（两次内联）、
 * proceduralTextures.idToSeed、SituationalReviewMode.hashString 各有独立实现，
 * 算法近似但互不相同（h*31 变体 vs 移位加）。本文件统一为 FNV-1a 变体
 * （与原 NotesPage 实现输出一致，避免影响既有视觉 hash 分配）。
 * @ai-context: 纯函数，无副作用。返回 32 位有符号整数范围（JS 位运算语义），
 * 调用方自行映射到目标范围。
 */

/**
 * 字符串 → 32 位整数哈希（与原 NotesPage 内联实现同算法：((h<<5)-h+c)|0）。
 * 稳定：同输入恒同输出，可安全用于视觉种子/索引分配。
 */
export function stringHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

/** 哈希 → [0, max) 非负整数（供取模分配使用） */
export function hashToRange(str: string, max: number): number {
  if (max <= 0) return 0;
  return Math.abs(stringHash(str)) % max;
}
