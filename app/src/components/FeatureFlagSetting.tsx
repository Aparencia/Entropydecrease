/**
 * FeatureFlagSetting — 功能开关面板（v0.11.1：feed 碎片捕获；v0.12.2 转正）。
 *
 * @ai-context: v0.11.1 预览纪律（默认关）→ v0.12.2 收件箱动线转正：本开关
 *              语义改为「快速记录入口」（默认开）；后端 promote/delete 等
 *              命令二次校验仍保留（后端不信前端隐藏——switch 减面不减安全）。
 *              开关状态经 get_feature_flags/set_feature_flag 读写（JSON 持久化）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface FeatureFlags {
  feedCapture: boolean;
}

export default function FeatureFlagSetting() {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      const f = await invoke<FeatureFlags>("get_feature_flags");
      setFlags(f);
    } catch (e) {
      setStatus(`开关读取失败: ${e}`);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleFeed = async () => {
    if (!flags) return;
    const next = !flags.feedCapture;
    try {
      await invoke<boolean>("set_feature_flag", { name: "feed_capture", value: next });
      setFlags({ ...flags, feedCapture: next });
      setStatus("");
    } catch (e) {
      setStatus(`开关切换失败: ${e}`);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={flags?.feedCapture ?? true}
            disabled={!flags}
            onChange={() => void toggleFeed()}
          />
          快速记录（收件箱碎片捕获入口）
        </label>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          {flags?.feedCapture ? "已启用" : "已关闭"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
        笔记页侧栏的「⚡ 快速记录」入口与收件箱的升笔记/升卡/删除操作。
        碎片不是笔记——独立原料层，升为笔记沉淀或升为闪卡复习（v0.12.2 收件箱动线）。
      </p>
      {status && <p style={{ fontSize: 12, color: "#dc2626", margin: "6px 0 0" }}>{status}</p>}
    </div>
  );
}
