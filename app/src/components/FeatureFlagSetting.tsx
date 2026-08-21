/**
 * FeatureFlagSetting — 功能预览开关面板（v0.11.1：feed 碎片捕获）。
 *
 * @ai-context: v4 §11.3 交付层纪律——feed 能力功能开关默认关；本面板是
 *              用户唯一的开关入口（后端 capture_fragment 二次校验，不信前端隐藏）。
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
            checked={flags?.feedCapture ?? false}
            disabled={!flags}
            onChange={() => void toggleFeed()}
          />
          碎片快速捕获（feed 进料口）
        </label>
        <span style={{ fontSize: 11, color: "#9ca3af" }}>
          {flags?.feedCapture ? "已启用" : "默认关闭"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 0" }}>
        启用后笔记页组侧栏出现碎片捕获框：几句话 + 可选截图，按领域自动归入主题组。
        碎片不是笔记——独立原料层，供组级复习与结算消费（v4 契约）。
      </p>
      {status && <p style={{ fontSize: 12, color: "#dc2626", margin: "6px 0 0" }}>{status}</p>}
    </div>
  );
}
