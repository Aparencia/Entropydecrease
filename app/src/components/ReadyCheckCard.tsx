/**
 * ReadyCheckCard — 引擎与模型就绪清单（2026-08 C1：开始前准备流）。
 *
 * @ai-context: 聚合现有只读命令（零后端改动）：health_status（磁盘/流式模型/
 *              SenseVoice/引擎心跳）+ structure_model_status（结构模型）+
 *              ocr_device_status（OCR 设备）——开始实时捕获前"能不能开始"
 *              一目了然；有缺失项时提示对应修复入口（下载按钮仍在各设置面板）。
 * @ai-context: 就绪项绿 ✓、缺失项红 ✗、降级项黄 ⚠（OCR CPU 回退/磁盘告警）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface HealthSnapshot {
  disk_free_gb: number | null;
  disk_warn: boolean;
  missing_models: string[];
  asr_alive: boolean;
  ocr_alive: boolean;
}

interface StructureStatus {
  kind: string;
  state: string;
}

interface OcrDeviceStatus {
  mode: string;
  actual: string | { Cuda: { device_id: number } };
  fallback_reason: string | null;
}

interface ReadyItem {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
}

function ocrBackendLabel(backend: OcrDeviceStatus["actual"]): string {
  if (backend === "Cpu") return "CPU";
  if (typeof backend === "object" && backend !== null && "Cuda" in backend) {
    return `GPU（CUDA #${backend.Cuda.device_id}）`;
  }
  return String(backend);
}

export default function ReadyCheckCard() {
  const [items, setItems] = useState<ReadyItem[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [health, structures, ocr] = await Promise.all([
        invoke<HealthSnapshot>("health_status"),
        invoke<StructureStatus[]>("structure_model_status"),
        invoke<OcrDeviceStatus>("ocr_device_status"),
      ]);
      const missingStreaming = health.missing_models.filter((m) => m.startsWith("streaming"));
      const missingSense = health.missing_models.filter((m) => m.startsWith("sensevoice"));
      const structureMissing = structures.filter((s) => s.state !== "done").length;
      const list: ReadyItem[] = [
        {
          label: "流式转写模型（Zipformer）",
          ok: missingStreaming.length === 0,
          detail: missingStreaming.length > 0 ? `缺 ${missingStreaming.join("、")}` : undefined,
        },
        {
          label: "离线转写（SenseVoice）",
          ok: missingSense.length === 0,
          detail: missingSense.length > 0 ? `缺 ${missingSense.join("、")}` : undefined,
        },
        {
          label: `OCR 引擎（${ocrBackendLabel(ocr.actual)}）`,
          ok: health.ocr_alive,
          warn: !health.ocr_alive ? false : !!ocr.fallback_reason,
          detail: !health.ocr_alive
            ? "引擎未就绪"
            : ocr.fallback_reason ?? undefined,
        },
        {
          label: "结构分析模型（版面/表格/公式）",
          ok: structureMissing === 0,
          detail: structureMissing > 0 ? `${structureMissing} 项未下载（未下载自动用规则版）` : undefined,
        },
        {
          label: "磁盘空间",
          ok: !health.disk_warn,
          detail: health.disk_free_gb != null ? `${health.disk_free_gb.toFixed(1)}GB 可用` : "未知",
        },
      ];
      setItems(list);
    } catch (e) {
      setError(`就绪检查失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const allOk = items?.every((i) => i.ok) ?? false;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>🔌 就绪检查</span>
        <button
          onClick={() => void refresh()}
          style={{ marginLeft: "auto", fontSize: 11, color: "#0d9488", cursor: "pointer", border: "none", background: "none", padding: 0 }}
        >
          ⟳ 刷新
        </button>
      </div>
      {allOk && (
        <div style={{ fontSize: 12, color: "#0d9488", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
          ✅ 一切就绪，可开始实时捕获
        </div>
      )}
      {items ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {items.map((item) => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ color: item.ok ? (item.warn ? "#b45309" : "#0d9488") : "#dc2626", flexShrink: 0 }}>
                {item.warn ? "⚠" : item.ok ? "✓" : "✗"}
              </span>
              <span style={{ color: "#374151", flexShrink: 0 }}>{item.label}</span>
              {item.detail && (
                <span style={{ color: item.ok ? "#9ca3af" : "#b45309", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#9ca3af" }}>{error || "检查中…"}</div>
      )}
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 6 }}>
        缺失模型的下载入口在各设置面板（实时捕获/结构模型）
      </div>
    </div>
  );
}
