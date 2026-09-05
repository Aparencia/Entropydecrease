/**
 * SealToggle — SE 情绪 tag（#树洞 类）显隐开关（v0.20.3 / REQ-301）。
 *
 * @ai-context: 封存默认排除（列表默认不可见——SE 内容不进学习主流程）；开启后
 *              设置可显（默认关=保持排除，feature_flags.sealed_tags_visible）。
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function SealToggle() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void invoke<{ sealedTagsVisible?: boolean }>("get_feature_flags")
      .then((f) => setOn(!!f.sealedTagsVisible))
      .catch(() => undefined);
  }, []);

  const toggle = async (next: boolean) => {
    try {
      await invoke("set_feature_flag", { name: "sealed_tags_visible", value: next });
      setOn(next);
      setMsg(next ? "已显示 #树洞 类封存笔记（默认排除态解除）" : "已恢复默认：封存（#树洞）笔记在列表隐藏");
    } catch (e) {
      setMsg(`设置失败: ${e}`);
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#374151", display: "flex", alignItems: "center", gap: 8 }}>
      <b>🧊 封存显隐（#树洞）</b>
      <input type="checkbox" checked={on} onChange={(e) => void toggle(e.target.checked)} style={{ cursor: "pointer" }} />
      <span style={{ fontSize: 11, color: "#9ca3af" }}>{on ? "显示封存笔记" : "默认排除（推荐——情绪内容不进学习主流程）"}</span>
      {msg && <span style={{ fontSize: 11, color: msg.startsWith("设置失败") ? "#dc2626" : "#047857" }}>{msg}</span>}
    </div>
  );
}

export default SealToggle;
