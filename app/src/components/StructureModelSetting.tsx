/**
 * StructureModelSetting — 结构模型设置面板（v0.5.0 模型版：版面/表格/公式）。
 *
 * @ai-context: 按需启用：三类模型独立下载/独立状态（未下载/下载中/就绪/失败）；
 *              公式默认 PP-FormulaNet-s（231MB），可切换 UniMERNet 高精度档
 *              （1.84GB，显式确认）；模型未下载时对应能力自动降级规则版。
 * @ai-context: 2026-08 用户需求：清单整理——状态徽标化 + 行内体积/进度 +
 *              公式档位独立小节；状态修复（后端结构模型状态现按磁盘存在性
 *              兜底，启动不再误报"未下载"）。
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

/** 状态徽标（底色/文字色/前缀）——清单整理：徽标化取代平铺文字 */
const STATE_BADGE: Record<string, { bg: string; fg: string; text: string }> = {
  idle: { bg: "#f3f4f6", fg: "#6b7280", text: "未下载" },
  downloading: { bg: "#eff6ff", fg: "#2563eb", text: "下载中…" },
  done: { bg: "#f0fdfa", fg: "#0d9488", text: "✓ 已就绪" },
  failed: { bg: "#fef2f2", fg: "#dc2626", text: "下载失败" },
};

const btn: React.CSSProperties = { padding: "3px 10px", cursor: "pointer", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb", background: "#fff" };

export default function StructureModelSetting() {
  const [statuses, setStatuses] = useState<ModelStatus[]>([]);
  const [highAccuracy, setHighAccuracy] = useState(false);
  const [confirmHigh, setConfirmHigh] = useState(false);
  // 审查 L1/H3 修复：回显当前持久化档位（切换后不刷新会误导）
  const [activeTier, setActiveTier] = useState<string>("pp-formulanet");

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
    // 审查 H3 修复：回显持久化档位（structure_formula_tier 命令）
    void invoke<string>("structure_formula_tier")
      .then((t) => setActiveTier(t))
      .catch(() => setActiveTier("pp-formulanet"));
    // 下载事件实时刷新（审查 L1 修复：监听进度事件，大模型下载可见字节进度）
    const unlisteners: Promise<() => void>[] = [
      listen<string>("structure-model:download-done", () => void refresh()),
      listen<string>("structure-model:download-failed", () => void refresh()),
      listen<{ file: string; downloadedBytes: number; totalBytes: number }>(
        "structure-model:download-progress",
        (e) => {
          setStatuses((prev) =>
            prev.map((s) =>
              s.state === "downloading"
                ? {
                    ...s,
                    downloadedBytes: e.payload.downloadedBytes,
                    totalBytes: e.payload.totalBytes || s.totalBytes,
                    currentFile: e.payload.file,
                  }
                : s,
            ),
          );
        },
      ),
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
    <div style={{ fontSize: 12, color: "#374151" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        结构模型（版面/表格/公式；按需下载，未下载自动用规则版）
      </div>
      {(["layout", "table", "formula"] as ModelKind[]).map((kind) => {
        const st = statusOf(kind);
        const state = st?.state ?? "idle";
        const badge = STATE_BADGE[state] ?? STATE_BADGE.idle;
        const downloading = state === "downloading";
        return (
          <div key={kind} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, width: 200, color: "#374151" }}>{KIND_LABEL[kind]}</span>
            {/* 状态徽标 */}
            <span
              style={{
                fontSize: 11, padding: "1px 8px", borderRadius: 10,
                background: badge.bg, color: badge.fg, flexShrink: 0,
              }}
            >
              {badge.text}
            </span>
            {/* 下载进度（下载中显示当前文件 + 字节进度） */}
            {downloading && st?.currentFile && (
              <span style={{ fontSize: 10, color: "#9ca3af", flexShrink: 0 }}>
                {st.currentFile}{" "}
                {st.totalBytes > 0 ? `${(st.downloadedBytes / 1048576) | 0}MB/${(st.totalBytes / 1048576) | 0}MB` : "…"}
              </span>
            )}
            {state === "failed" && st?.error && (
              <span style={{ fontSize: 10, color: "#dc2626" }} title={st.error}>⚠ {st.error.slice(0, 40)}</span>
            )}
            {/* 操作：下载/重试；已就绪或下载中不显示 */}
            {state !== "done" && !downloading && (
              <button style={{ ...btn, marginLeft: "auto" }} onClick={() => void download(kind)}>
                {state === "failed" ? "重试" : "下载"}
              </button>
            )}
          </div>
        );
      })}
      {/* 公式档位切换（独立小节：默认 PP-FormulaNet-s；高精度 UniMERNet 需确认） */}
      <div style={{ borderTop: "1px dashed #e5e7eb", marginTop: 8, paddingTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>公式档位：</span>
          <label style={{ fontSize: 11, color: "#374151", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={highAccuracy}
              onChange={(e) => {
                setHighAccuracy(e.target.checked);
                setConfirmHigh(false);
              }}
            />
            高精度档（UniMERNet 1.84GB，中文效果最佳）
          </label>
          {activeTier === "uni-mer-net" && (
            <span style={{ fontSize: 10, color: "#0d9488" }}>已启用（装配路径已切换）</span>
          )}
          {confirmHigh && (
            <span style={{ fontSize: 11, color: "#b45309" }}>
              大模型下载（1.84GB），确认后点上方"下载"公式
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
