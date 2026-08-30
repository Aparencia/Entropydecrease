/**
 * blobToBase64 — Blob → base64 工具（v0.14 C1 快速记录/ v0.15 剪贴板图片共用）。
 *
 * @ai-context: 分块转换（CHUNK=0x8000）——大截图直接 String.fromCharCode(...buf)
 *              会栈溢出（apply 参数个数上限）；Tauri IPC 图片走 base64 字符串
 *              （同 capture_fragment 先例——数字数组序列化 10MB 图≈35MB JSON）。
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
