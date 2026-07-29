/**
 * localStorage 旧键一次性迁移工具
 *
 * @ai-context: 品牌重构（课伴→熵减）统一键迁移模式：新键缺失且旧键存在
 * 时复制并删除旧键，随后按新键读取。全部 keban* 旧键分支兼容保留至
 * 2027-01，届时可删除各调用点的 legacyKey 参数与本工具的迁移分支。
 * @ai-context: 纯函数式包装（除 localStorage I/O 外无副作用），SSR/
 * localStorage 不可用时静默返回 null。
 */

/**
 * 读取 localStorage 值，读取前自动完成旧键→新键的一次性迁移
 * @param newKey 新键名（ed* 前缀）
 * @param legacyKey 旧键名（keban* 前缀）
 */
export function readWithLegacyMigration(newKey: string, legacyKey: string): string | null {
  try {
    if (localStorage.getItem(newKey) === null) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        localStorage.setItem(newKey, legacy);
        localStorage.removeItem(legacyKey);
      }
    }
    return localStorage.getItem(newKey);
  } catch {
    // localStorage 不可用（隐私模式等），静默返回
    return null;
  }
}
