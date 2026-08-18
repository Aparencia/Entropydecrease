/**
 * StructureModelSetting — 结构模型设置面板（v0.5.0 模型版：版面/表格/公式）。
 *
 * @ai-context: 按需启用：三类模型独立下载/独立状态（未下载/下载中/就绪/失败）；
 *              公式默认 PP-FormulaNet-s（231MB），可切换 UniMERNet 高精度档
 *              （1.84GB，显式确认）；模型未下载时对应能力自动降级规则版。
 * @ai-context: 课后精修入口：会话停止后自动触发（方案 A 增强版），本面板仅管理
 *              模型资产与档位。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type ModelKind = "layout" | "table" | "formula";

interface ModelStatus {
  kind: ModelKind;
  state: string; // idle | downloading | done | failed
  currentFile: string | null;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

const KIND_LABEL: Record<ModelKind, string> = {
  layout: "版面分析（pp-doclayout-l 129MB）",
  table: "表格结构（SLANet v2 8MB）",
  formula: "公式识别（PP-FormulaNet-s 231MB）",
};

const STATE_LABEL: Record<string, string> = {
  idle: "未下载",
  downloading: "下载中…",
  done: "已就绪",
  failed: "下载失败",
};

const btn: React.CSSProperties = { padding: "4px 10px", cursor: "pointer", fontSize: 12 };

export default function StructureModelSetting() {
  const [statuses, setStatuses] = useState<ModelStatus[]>([]);
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [confirmHigh, setConfirmHigh] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<ModelStatus[]>("structure_model_status");
      setStatuses(list);
    } catch {
      // 静默：面板非关键路径
    }
  }, []);

  useEffect(() => {
    void refresh();
    // 下载事件实时刷新
    const unlisteners: Promise<() => void>[] = [
      listen<string>("structure-model:download-done", () => void refresh()),
      listen<string>("structure-model:download-failed", () => void refresh()),
    ];
    return () => {
      unlisteners.forEach((p) => void p.then((fn) => fn()));
    };
  }, [refresh]);

  const download = async (kind: ModelKind) => {
    // 公式高精度档需确认（1.84GB）
    if (kind === "formula" && highAccuracy && !confirmHigh) {
      setConfirmHigh(true);
      return;
    }
    setConfirmHigh(false);
    try {
      await invoke<number>("structure_model_download", {
        kind,
        highAccuracyFormula: kind === "formula" ? highAccuracy : false,
      });
      void refresh();
    } catch (e) {
      alert(`下载启动失败: ${e}`);
    }
  };

  const statusOf = (kind: ModelKind) => statuses.find((s) => s.kind === kind);

  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        结构分析模型（v0.5.0 模型版——按需下载，未下载自动用规则版）
      </div>
      {(["layout", "table", "formula"] as ModelKind[]).map((kind) => {
        const st = statusOf(kind);
        const state = st?.state ?? "idle";
        return (
          <div key={kind} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, width: 210, color: "#374151" }}>{KIND_LABEL[kind]}</span>
            <span
              style={{
                fontSize: 11,
                color: state === "done" ? "#0d9488" : state === "failed" ? "#dc2626" : "#6b7280",
                width: 60,
              }}
            >
              {STATE_LABEL[state] ?? state}
            </span>
            {st?.currentFile && (
              <span style={{ fontSize: 10, color: "#9ca3af" }}>
                {st.currentFile} {st.totalBytes > 0 ? `${(st.downloadedBytes / 1048576) | 0}MB/${(st.totalBytes / 1048576) | 0}MB` : ""}
              </span>
            )}
            {state !== "done" && state !== "downloading" && (
              <button style={btn} onClick={() => void download(kind)}>
                {state === "failed" ? "重试" : "下载"}
              </button>
            )}
            {state === "failed" && st?.error && (
              <span style={{ fontSize: 10, color: "#dc2626" }} title={st.error}>⚠</span>
            )}
          </div>
        );
      })}
      {/* 公式档位切换（默认 PP-FormulaNet-s；高精度 UniMERNet 需确认） */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "#6b7280" }}>公式档位：</span>
        <label style={{ fontSize: 11, color: "#374151", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={highAccuracy}
            onChange={(e) => setHighAccuracy(e.target.checked)}
          />
          高精度档（UniMERNet 1.84GB，中文效果最佳）
        </label>
        {confirmHigh && (
          <span style={{ fontSize: 11, color: "#b45309" }}>
            大模型下载（1.84GB），确认后点"下载"公式
          </span>
        )}
      </div>
    </div>
  );
}
