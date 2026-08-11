/**
 * WAV 编码工具（纯函数）
 *
 * @ai-context: 从 vadMarker 拆出。44 字节标准 WAV 头 + Int16 PCM 数据，
 * 无需第三方库，保证纯前端环境可用。输出 base64 供 ASR IPC 传输，
 * 编码格式与网关 ASR 端解码约定一致（16-bit LE PCM）。
 */

/**
 * 将 Float32 PCM 样本编码为 16-bit WAV base64 字符串
 */
export function encodeWavBase64(
  floatSamples: Float32Array,
  sampleRate: number,
  channels: number,
): string {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const pcmBytes = floatSamples.length * (bitsPerSample / 8);
  const totalBytes = 44 + pcmBytes;

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // RIFF 头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalBytes - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt 子块
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                    // 子块大小
  view.setUint16(20, 1, true);                     // PCM 格式
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // data 子块
  writeString(view, 36, 'data');
  view.setUint32(40, pcmBytes, true);

  // Float32 → Int16 转换并写入
  let offset = 44;
  for (let i = 0; i < floatSamples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return arrayBufferToBase64(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  // P2 审计优化：分块构建（每 0x8000 字节一批）替代逐字节 += ——
  // 长语音段（28s ≈ 900KB PCM）逐字节 rope 拼接 + btoa 是主线程热点，
  // 分块后从 String.fromCharCode 批量生成，耗时降约 3-5 倍且行为一致
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}
