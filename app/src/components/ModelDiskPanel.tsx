/**
 * ModelDiskPanel — 模型磁盘占用面板（TD-2026-08-19-E 清偿：REQ-131 model_disk_overview 前端接入）。
 *
 * @ai-context: 命令已注册多年无 UI——本面板消费：models 目录总占用 + 各子目录
 *              明细（按占用降序，带版本标记）；只读清单（回退动作在下载器侧）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ModelDirEntry {
  name: string;
  totalBytes: number;
  fileCount: number;
  version: string | null;
}

interface ModelDiskOverview {
  totalBytes: number;
  entries: ModelDirEntry[];
}

/** 字节 → 可读大小（纯函数）。 */
function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function ModelDiskPanel() {
  const [overview, setOverview] = useState<ModelDiskOverview | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setOverview(await invoke<ModelDiskOverview>("model_disk_overview"));
    } catch (e) {
      setError(`磁盘占用查询失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>💾 模型磁盘占用</span>
        {overview && (
          <span style={{ fontSize: 12, color: "#0f766e", fontWeight: 600 }}>
            合计 {fmtBytes(overview.totalBytes)}
          </span>
        )}
        <button
          onClick={() => void refresh()}
          style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer" }}
        >
          ⟳
        </button>
        {error && <span style={{ fontSize: 11, color: "#dc2626" }}>{error}</span>}
      </div>
      {overview && overview.entries.length > 0 && (
        <div style={{ fontSize: 11.5, color: "#374151", lineHeight: 1.7 }}>
          {overview.entries.map((e) => (
            <div key={e.name} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{e.name}</span>
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {fmtBytes(e.totalBytes)}（{e.fileCount} 文件）
              </span>
              {e.version && (
                <span style={{ background: "#eef2ff", color: "#4338ca", borderRadius: 8, padding: "0 6px", fontSize: 10.5 }}>
                  v{e.version}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
