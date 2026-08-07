/**
 * useAmbientLight — 环境光亮度采样（P2 可选增强）
 *
 * 通过摄像头获取环境亮度（0-1），驱动 Chronos 生物在明亮/昏暗环境下的
 * 自发光补偿，保证任何光线下清晰且不刺眼。
 *
 * 隐私优先：默认关闭（enabled=false 不申请摄像头权限）；仅在设置页
 * 显式开启后采样。采样频率 2s 一次，失败自动停用。
 *
 * @ai-context: Chronos P2 环境自适应 hook，getUserMedia 亮度采样。
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const SAMPLE_INTERVAL_MS = 2000;
const VIDEO_SIZE = 32; // 极低分辨率采样帧（1×1 像素足够测亮度）

export function useAmbientLight(enabled: boolean): number {
  const [brightness, setBrightness] = useState(0.5); // 中性默认
  const streamRef = useRef<MediaStream | null>(null);

  const sample = useCallback(async () => {
    try {
      const video = document.createElement('video');
      video.srcObject = streamRef.current;
      await video.play();
      const canvas = document.createElement('canvas');
      canvas.width = VIDEO_SIZE;
      canvas.height = VIDEO_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, VIDEO_SIZE, VIDEO_SIZE);
      const { data } = ctx.getImageData(0, 0, VIDEO_SIZE, VIDEO_SIZE);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
      }
      const avg = sum / (data.length / 4);
      // 压缩动态范围：0-1 亮度映射到 0.25-1（避免全黑/全白极端）
      setBrightness(Math.max(0.25, Math.min(1, avg * 1.2)));
    } catch {
      // 采样失败：保持当前值
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // 关闭：停止流并复位
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setBrightness(0.5);
      return;
    }
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 64, height: 64 }, // 最小分辨率，隐私与性能兼顾
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        await sample();
        interval = setInterval(sample, SAMPLE_INTERVAL_MS);
      } catch {
        // 权限拒绝/无摄像头：静默停用，保持中性值
      }
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, sample]);

  return brightness;
}