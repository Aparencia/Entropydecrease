/**
 * 笔记图片压缩（P2-10）
 *
 * 大图（超过体积阈值）经 canvas 降采样到最长边 MAX_DIMENSION 并以 JPEG 重编码，
 * 控制内嵌 base64 体积，避免笔记 JSON 与 IndexedDB 膨胀；小图原样返回。
 * 配合 Image 扩展的 loading="lazy" 实现懒加载，降低长笔记渲染/解码开销。
 *
 * @ai-context: 纯客户端图像处理。压缩失败时回退原始 data URL（不阻塞插入），
 * 不做 blob 迁移（存量数据保持内嵌，向后兼容）。
 */

/** 最长边上限（px）——超过则等比降采样 */
const MAX_DIMENSION = 1920;
/** 体积阈值（字节）——小于此值原样内嵌，不压缩 */
const COMPRESS_THRESHOLD_BYTES = 300 * 1024;
/** JPEG 重编码质量 */
const JPEG_QUALITY = 0.85;

/** 读取 File 为 data URL */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 加载 data URL 为 HTMLImageElement */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
}

/**
 * 压缩图片为内嵌 data URL：
 * - 小图（≤ 阈值）原样返回；
 * - 大图降采样到最长边 MAX_DIMENSION 并以 JPEG 重编码。
 * 压缩失败时回退原始 data URL（不阻塞插入）。
 */
export async function compressImageForNote(file: File): Promise<string> {
  const original = await readAsDataURL(file);
  if (file.size <= COMPRESS_THRESHOLD_BYTES) return original;

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch {
    return original; // 压缩失败回退原图
  }
}
