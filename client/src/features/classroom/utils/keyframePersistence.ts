/**
 * 关键帧图片本地持久化（渲染进程侧）
 * Persist keyframe images to local disk via IPC and back-fill fileUrl.
 *
 * @ai-context: smart:keyframe 到达时后台异步调用主进程 keyframe_save，
 * 成功后把 keyframe:// URL 回填到 keyframe.fileUrl（事件对象与
 * pendingKeyframesRef / bundle_ready 共享同一引用，故原地写 fileUrl 的同时
 * 需对 smartBundle 做不可变更新）；失败仅 console.warn 静默降级，
 * 不阻塞采集。增量分析完成后清空 imageBase64 的内存策略保持不变。
 */
import type { Dispatch, SetStateAction } from 'react';
import type { KeyFrame, SessionBundle } from '@/lib/capture';

/**
 * 后台保存关键帧图片并回填 fileUrl
 * @param sessionId 采集会话 ID（作为图片目录名）
 * @param keyframe  关键帧对象（保存成功后原地写入 fileUrl）
 * @param setBundle smartBundle 状态更新器（不可变同步 fileUrl）
 */
export function persistKeyframeImage(
  sessionId: string,
  keyframe: KeyFrame,
  setBundle: Dispatch<SetStateAction<Partial<SessionBundle>>>,
): void {
  // 非 Electron 环境（浏览器/PWA）无 electronAPI，直接跳过持久化
  if (typeof window === 'undefined' || !window.electronAPI) return;
  window.electronAPI.invoke('keyframe_save', {
    sessionId,
    keyframeId: keyframe.id,
    imageBase64: keyframe.imageBase64,
  }).then((res) => {
    const url = (res as { url?: string } | undefined)?.url;
    if (!url) return;
    // 同步到事件对象引用（pendingKeyframesRef/bundle_ready 共享同一引用）
    keyframe.fileUrl = url;
    setBundle((prev) => ({
      ...prev,
      keyframes: (prev.keyframes ?? []).map((kf) =>
        kf.id === keyframe.id ? { ...kf, fileUrl: url } : kf,
      ),
    }));
  }).catch((err) => {
    console.warn('[keyframePersistence] 关键帧图片保存失败:', err);
  });
}
