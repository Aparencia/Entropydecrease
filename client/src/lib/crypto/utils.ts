/**
 * Base64 编解码工具
 *
 * @ai-context: 纯函数。加密模块二进制数据与 JSON 存储格式互转的唯一通道。
 * 逐字节 String.fromCharCode 循环（而非展开运算符）是为避免大数组展开导致栈溢出。
 */
export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
