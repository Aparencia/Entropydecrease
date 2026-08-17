/**
 * Capacitor 媒体桥接：相机/相册图片选取
 *
 * @ai-context: @capacitor/camera v7 的 getPhoto 仅支持图片（mediaType 已移除）。
 * 图片取回的是 content:// 临时授权 URI，WebView 无法稳定长期引用，必须先用
 * Filesystem 拷贝到应用私有目录（Directory.Data）再使用。
 * 视频选取不走本模块：相册导入由原生插件 EntropyCapture.pickVideo 提供
 * （content:// 流式拷贝 + 本地绝对路径，供音频抽取/本地 ASR）；WebView 内
 * <input type="file" accept="video/*"> 亦可直接唤起系统选择器（PWA/浏览器）。
 * @ai-context EN: camera v7 getPhoto is images-only. Image picks return
 * ephemeral content:// URIs — copy them into the app-private data directory
 * first. Video picking lives in the native EntropyCapture.pickVideo plugin
 * (streaming copy to app-private dir, absolute path for audio extraction).
 */
import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

/** 应用私有数据目录（图片副本落盘位置，不占相册） */
const MEDIA_DIR = Directory.Data;

export interface PickedImage {
  /** 落盘后的文件名（相对应用私有目录） */
  fileName: string;
  /** 可被 <img> 直接引用的本地 URL（blob:/file:） */
  localUrl: string;
}

function ensureCapacitor(): void {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Capacitor 媒体能力仅在原生壳内可用');
  }
}

/** 选取图片（相机拍摄/相册/系统选择弹窗），拷贝到应用私有目录后返回 */
export async function pickImage(
  source: 'camera' | 'photos' | 'prompt' = 'photos',
): Promise<PickedImage | null> {
  ensureCapacitor();
  const cameraSource =
    source === 'camera' ? CameraSource.Camera : source === 'prompt' ? CameraSource.Prompt : CameraSource.Photos;
  const photo: Photo = await Camera.getPhoto({
    resultType: CameraResultType.Uri,
    source: cameraSource,
    quality: 90,
    allowEditing: false,
  });
  const uri = photo.path ?? photo.webPath;
  if (!uri) return null;

  const fileName = `img-${Date.now()}.jpg`;
  // 图片体积小：读 base64 后写入私有目录，绕开 content:// 生命周期问题
  // （readFile 在 Android 支持 content:// URI）
  const read = await Filesystem.readFile({ path: uri, directory: MEDIA_DIR });
  await Filesystem.writeFile({ path: fileName, data: read.data, directory: MEDIA_DIR, recursive: true });
  return { fileName, localUrl: photo.webPath ?? uri };
}

/** 将应用私有目录中的文件读为 File（供 FormData/压缩/插入编辑器等 JS 侧消费） */
export async function readDataFile(fileName: string, mime = 'application/octet-stream'): Promise<File> {
  const read = await Filesystem.readFile({ path: fileName, directory: MEDIA_DIR });
  let blob: Blob;
  if (typeof read.data === 'string') {
    // base64 → Blob
    const binary = atob(read.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    blob = read.data;
  }
  return new File([blob], fileName, { type: mime });
}
