/**
 * 敏感字段加解密映射 — 唯一权威源
 *
 * @ai-context: 历史上加密映射（writeWithLog）与解密映射（StorageAdapter）
 * 各自维护一份，曾出现 feynman 三表解密字段写错为 'content'（实际为
 * explanation/summary/text）导致加密数据读取永不解密的 Bug。
 * 2026-07 迁移重构时合并为本共享模块，加解密两侧必须且只能引用这里。
 * @ai-context: 新增加密表时仅需修改本文件；字段名必须与 @/types 中
 * 对应实体的属性名严格一致。
 */

/** 敏感字段映射：entityType（=Dexie 表名）-> 需要加/解密的字段名列表 */
export const SENSITIVE_FIELDS: Record<string, string[]> = {
  notes: ['content'],
  flashcards: ['front', 'back'],
  feynmanNotes: ['explanation'],
  feynmanSummaries: ['summary'],
  feynmanWeakPoints: ['text'],
};

/** 非敏感表白名单：这些表不含加密字段，读取路径可直接跳过解密 */
export const NON_SENSITIVE_TABLES: ReadonlySet<string> = new Set([
  'pomodoroSessions',
  'studyCheckIns',
  'studyGoals',
  'flashcardReviews',
  'searchIndex',
]);
