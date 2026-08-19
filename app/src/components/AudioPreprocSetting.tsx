/**
 * 音频预处理链设置（REQ-101 / v0.7.0 M1）。
 *
 * @ai-context: CER 微基准（bin/cer_bench.rs 对 S4 落盘音频对比"开/关"两路转写）
 *              给出数据结论后，本开关承载用户选择；配置持久化 JSON，下次实时
 *              会话生效（不热切换进行中会话——音频链路抖动风险）。
 * @ai-context: 显示"生效开关"（env ENTROPY_AUDIO_PREPROC 覆盖配置文件时
 *              两者不同——开发期快速实测通道可观测）。
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
    <div className="setting-card">
      <div className="setting-header">
        <span className="setting-title">音频预处理链</span>
        {status && status.effective !== status.enabled && (
          <span className="setting-badge" title="env ENTROPY_AUDIO_PREPROC 正在覆盖配置文件">
            env 覆盖中
          </span>
        )}
      </div>
      <p className="setting-desc">
        AGC 增益 + 削波检测 + 动态静音阈值——低音量课程防 VAD 截断（默认值由 CER
        微基准数据支撑，REQ-101）
      </p>
      <label className="switch-row">
        <input
          type="checkbox"
          checked={status?.effective ?? false}
          disabled={!status}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span>开启预处理链（下次实时会话生效）</span>
      </label>
      {note && <p className="setting-note">{note}</p>}
      {error && <p className="setting-error">设置失败：{error}</p>}
    </div>
  );
}
