/**
 * UUID v4 生成工具
 *
 * @ai-context: 纯函数，无副作用。全站实体主键统一由此生成，
 * 保证离线创建的记录在云端合并时不冲突（CRDT 依赖全局唯一 id）。
 */
import { v4 as uuidv4 } from 'uuid';

/**
 * 生成 UUID v4 字符串
 * 用于所有实体的主键生成，替代原自增 number ID
 */
export function generateId(): string {
  return uuidv4();
}
