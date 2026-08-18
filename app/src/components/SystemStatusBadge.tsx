/**
 * SystemStatusBadge — 系统健康徽标 + 开发期诊断面板（REQ-042 / v0.4.0 M7）。
 *
 * @ai-context: 徽标显示磁盘告警/模型缺失/引擎心跳（F2 资源健康监测）；
 *              展开面板显示 OCR 缓存命中率/失败计数/后端/回退原因（G2 诊断面板，
 *              开发期可见可隐藏）；ASR 降级事件由 ClassroomPage 监听展示横幅。
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** 健康快照（Rust HealthSnapshot，snake_case 契约） */
interface HealthSnapshot {
  disk_free_gb: number | null;
  disk_warn: boolean;
  missing_models: string[];
  asr_alive: boolean;
  ocr_alive: boolean;
}

/** 诊断快照（Rust DiagSnapshot，snake_case 契约） */
interface DiagSnapshot {
  ocr_cache_hits: number;
  ocr_cache_misses: number;
  ocr_hit_rate: number;
  asr_failures: number;
  ocr_failures: number;
  ocr_backend: string | { Cuda: { device_id: number } };
  ocr_fallback_reason: string | null;
}

function backendLabel(b: DiagSnapshot["ocr_backend"]): string {
  if (b === "Cpu") return "CPU";
  if (typeof b === "object" && b !== null && "Cuda" in b) return `CUDA #${b.Cuda.device_id}`;
  return String(b);
}

export function SystemStatusBadge() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [diag, setDiag] = useState<DiagSnapshot | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setHealth(await invoke<HealthSnapshot>("health_status"));
      setDiag(await invoke<DiagSnapshot>("diag_snapshot"));
    } catch {
      // 状态获取失败不打扰用户（徽标保持上次值）
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const warn = health?.disk_warn || (health?.missing_models.length ?? 0) > 0 || health?.asr_alive === false || health?.ocr_alive === false;
  const engineDown = health && (health.asr_alive === false || health.ocr_alive === false);

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}>
      <span
        title={warn ? "存在健康告警（磁盘/模型/引擎），点击查看" : "系统健康"}
        onClick={() => setOpen((o) => !o)}
        style={{ cursor: "pointer", color: warn ? "#dc2626" : "#0d9488" }}
      >
        {warn ? "⚠ 系统告警" : "● 健康"}
      </span>
      {open && (
        <span
          style={{
            position: "absolute",
            right: 12,
            top: 44,
            zIndex: 20,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "10px 12px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            fontSize: 11,
            color: "#374151",
            lineHeight: 1.8,
            width: 260,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>系统状态（每 15s 刷新）</div>
          <div>
            磁盘剩余：
            {health?.disk_free_gb != null ? `${health.disk_free_gb.toFixed(1)} GB` : "未知"}
            {health?.disk_warn && <b style={{ color: "#dc2626" }}>（⚠ 不足 500MB）</b>}
          </div>
          <div>
            模型文件：
            {health && health.missing_models.length === 0
              ? "完整"
              : <b style={{ color: "#dc2626" }}>缺 {health?.missing_models.join(", ")}</b>}
          </div>
          <div>
            引擎心跳：ASR {health?.asr_alive ? "●" : "✗"} OCR {health?.ocr_alive ? "●" : "✗"}
            {engineDown && <b style={{ color: "#dc2626" }}>（引擎异常）</b>}
          </div>
          <hr style={{ border: "none", borderTop: "1px solid #f3f4f6", margin: "6px 0" }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>诊断（开发期）</div>
          <div>OCR 缓存：命中 {diag?.ocr_cache_hits ?? 0} / 未中 {diag?.ocr_cache_misses ?? 0}（{diag?.ocr_hit_rate.toFixed(0)}%）</div>
          <div>失败计数：ASR {diag?.asr_failures ?? 0} / OCR {diag?.ocr_failures ?? 0}</div>
          <div>OCR 后端：{diag ? backendLabel(diag.ocr_backend) : "…"}</div>
          {diag?.ocr_fallback_reason && (
            <div style={{ color: "#b45309" }}>回退原因：{diag.ocr_fallback_reason}</div>
          )}
        </span>
      )}
    </span>
  );
}
