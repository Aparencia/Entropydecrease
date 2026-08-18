/**
 * OCR 推理设备设置（ADR-009 / v0.4.0 M1）。
 *
 * @ai-context: 模式下拉（Auto/ForceGpu/ForceCpu）+ 实际生效后端 + 回退原因 +
 *              "重新检测"校准（CPU/GPU 各 3 帧取中位数）+ 校准基准展示。
 * @ai-context: 配置变更与校准结果均在下一次引擎启动生效（不做热重启，
 *              避免中断进行中会话）——提示文案承担生效时机说明。
 * @ai-context: 校准期间轮询 ocr_device_status（后端 calibrating 标记）；
 *              校准完成后 bench 更新即停止轮询。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { OcrDeviceMode, OcrDeviceStatus } from "../types";

const MODE_LABELS: Record<OcrDeviceMode, string> = {
  Auto: "自动（推荐）",
  ForceGpu: "强制 GPU（CUDA）",
  ForceCpu: "强制 CPU",
};

/** 后端展示名（Rust OcrBackend：Cpu | {"Cuda":{device_id}}） */
function backendLabel(backend: OcrDeviceStatus["actual"]): string {
  if (backend === "Cpu") return "CPU";
  if (typeof backend === "object" && backend !== null && "Cuda" in backend) {
    return `GPU（CUDA #${backend.Cuda.device_id}）`;
  }
  return String(backend);
}

/** 规范化比较键（审查修复：Cuda 对象 JSON 反序列化后引用不相等，不能用 !== 判回退） */
function backendKey(backend: OcrDeviceStatus["actual"]): string {
  if (backend === "Cpu") return "Cpu";
  if (typeof backend === "object" && backend !== null && "Cuda" in backend) {
    return `Cuda#${backend.Cuda.device_id}`;
  }
  return String(backend);
}

export function OcrDeviceSetting() {
  const [status, setStatus] = useState<OcrDeviceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pollingRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<OcrDeviceStatus>("ocr_device_status");
      setStatus(s);
      setError(null);
      return s;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }, []);

  // 首次加载 + 校准完成时刷新（polling 由校准触发）
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // 校准中轮询：后端 calibrating 置 false 后停止并刷新一次
  useEffect(() => {
    if (!status?.calibrating || pollingRef.current) return;
    pollingRef.current = true;
    const timer = setInterval(async () => {
      const s = await loadStatus();
      if (s && !s.calibrating) {
        clearInterval(timer);
        pollingRef.current = false;
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      pollingRef.current = false;
    };
  }, [status?.calibrating, loadStatus]);

  const setMode = async (mode: OcrDeviceMode) => {
    try {
      const s = await invoke<OcrDeviceStatus>("ocr_device_set_mode", { mode });
      setStatus(s);
      setNote("模式已保存，下次引擎启动生效");
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const recalibrate = async () => {
    setNote(null);
    try {
      await invoke<OcrDeviceStatus>("ocr_device_recalibrate");
      // 立即刷新（校准标记 true 触发轮询）
      void loadStatus();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#374151" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>OCR 推理设备</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
        <select
          value={status?.mode ?? "Auto"}
          onChange={(e) => void setMode(e.target.value as OcrDeviceMode)}
          style={{
            flex: 1,
            padding: "4px 6px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#fff",
            fontSize: 12,
          }}
        >
          {(Object.keys(MODE_LABELS) as OcrDeviceMode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </select>
        <button
          onClick={() => void recalibrate()}
          disabled={status?.calibrating}
          style={{
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: status?.calibrating ? "default" : "pointer",
          }}
        >
          {status?.calibrating ? "校准中…" : "⟳ 重新检测"}
        </button>
      </div>
      {status && (
        <div style={{ fontSize: 11, lineHeight: 1.7, color: "#6b7280" }}>
          <div>
            当前后端：
            <b style={{ color: backendLabel(status.actual) === "CPU" ? "#6b7280" : "#0d9488" }}>
              {backendLabel(status.actual)}
            </b>
            {backendKey(status.requested) !== backendKey(status.actual) && (
              <span style={{ color: "#9ca3af" }}>（请求 {backendLabel(status.requested)}）</span>
            )}
          </div>
          {status.fallback_reason && (
            <div style={{ color: "#b45309" }}>⚠ {status.fallback_reason}</div>
          )}
          {status.bench && (
            <div>校准：CPU {status.bench.cpu_ms.toFixed(1)}ms / GPU {status.bench.gpu_ms.toFixed(1)}ms</div>
          )}
        </div>
      )}
      {note && <div style={{ fontSize: 11, color: "#0d9488", marginTop: 4 }}>{note}</div>}
      {error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>}
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
        变更与校准结果在下次引擎启动生效
      </div>
    </div>
  );
}
