/**
 * CRDT 二进制编解码（Automerge 变更传输格式）
 *
 * @ai-context: 上行/下行采用对称的二进制传输模式（经 runtime 脚本实测验证）：
 * 上行 getChangesSince() 得到的多条自描述 chunk 经 concatChanges() 拼接为
 * 单一 Uint8Array 再 base64 编码；下行 base64 解码后直接交给
 * automerge.loadIncremental()——该 API 原生支持多 chunk 拼接格式。
 * 禁止改用 getChanges(doc, doc) 或对 merge 结果取下标（历史 API 误用已修复）。
 * @ai-context: 纯函数，无副作用。逐字节循环而非展开运算符，避免大数组栈溢出。
 */

/** 将 Automerge 二进制变更编码为 base64 字符串 */
export function encodeChanges(changes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < changes.length; i++) {
    binary += String.fromCharCode(changes[i]);
  }
  return btoa(binary);
}

/**
 * 将多条 Automerge 变更（每条为独立的自描述 chunk）顺序拼接为单一二进制
 * 下行端通过 loadIncremental 解析，天然支持多 chunk 拼接格式
 */
export function concatChanges(changes: Uint8Array[]): Uint8Array {
  const totalLength = changes.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const c of changes) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}

/** 将 base64 字符串解码为 Automerge 二进制变更 */
export function decodeChanges(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
