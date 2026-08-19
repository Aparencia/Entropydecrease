/**
 * 音频预处理链设置（REQ-101 / v0.7.0 M1）。
 *
 * @ai-context: CER 微基准（bin/cer_bench.rs 对 S4 落盘音频对比"开/关"两路转写）
 *              给出数据结论后，本开关承载用户选择；配置持久化 JSON，下次实时
 *              会话生效（不热切换进行中会话——音频链路抖动风险）。
 * @ai-context: 显示"生效开关"（env ENTROPY_AUDIO_PREPROC 覆盖配置文件时
 *              两者不同——开发期快速实测通道可观测）。
 * @ai-context: 2026-08 用户需求：默认开启（防低音量课程 VAD 截断）；UI 风格
 *              与 OCR 推理设备等其他设置面板统一（此前误用未定义 CSS 类
 *              setting-card*，渲染为无样式裸控件——已改为内联样式同款卡片）。
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AudioPreprocStatus {
  enabled: boolean;
  effective: boolean;
}

export function AudioPreprocSetting() {
  const [status, setStatus] = useState<AudioPreprocStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<AudioPreprocStatus>("audio_preproc_status");
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const toggle = async (enabled: boolean) => {
    try {
      const s = await invoke<AudioPreprocStatus>("audio_preproc_set", { enabled });
      setStatus(s);
      setNote(
        enabled
          ? "已开启：AGC + 削波检测 + 动态静音阈值将在下次实时会话生效"
          : "已关闭：音频直通，将在下次实时会话生效",
      );
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#374151" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>音频预处理链</span>
        {status && status.effective !== status.enabled && (
          <span
            style={{
              fontSize: 10, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: 4, padding: "0 4px",
            }}
            title="env ENTROPY_AUDIO_PREPROC 正在覆盖配置文件"
          >
            env 覆盖中
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.6, marginBottom: 6 }}>
        AGC 增益 + 削波检测 + 动态静音阈值——低音量课程防 VAD 截断（默认开启，CER
        微基准数据支撑，REQ-101）
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, cursor: status ? "pointer" : "default" }}>
        <input
          type="checkbox"
          checked={status?.effective ?? true}
          disabled={!status}
          onChange={(e) => void toggle(e.target.checked)}
          style={{ cursor: status ? "pointer" : "default" }}
        />
        <span>开启预处理链（下次实时会话生效）</span>
      </label>
      {note && <div style={{ fontSize: 11, color: "#0d9488", marginTop: 4 }}>{note}</div>}
      {error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>设置失败：{error}</div>}
    </div>
  );
}
