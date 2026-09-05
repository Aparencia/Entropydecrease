/**
 * AsrConfusionPanel — ASR 混淆画像闭环面板（v0.20.2 / REQ-269）。
 *
 * @ai-context: 画像由「离线精修采纳流」自动采集（用户采纳=有标注参考），本面板
 *              展示达门槛候选（共现才替换、确认制——OCR ocr_confusion 哲学迁移）：
 *              确认=进纠错规则（转笔记/预览产物文本应用）+ 正确词反哺流式热词；
 *              忽略=不再推荐（dismissed 可人工编辑 asr_confusion.json 复原）。
 */
import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface AsrPairView {
  wrong: string;
  right: string;
  count: number;
}
interface AsrRuleView {
  from: string;
  to: string;
}
interface AsrConfusionView {
  candidates: AsrPairView[];
  rules: AsrRuleView[];
  dismissed_count: number;
}

const rowBtn: React.CSSProperties = {
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#374151",
};

export function AsrConfusionPanel() {
  const [view, setView] = useState<AsrConfusionView | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try {
      setErr("");
      const v = await invoke<AsrConfusionView>("asr_confusion_get");
      setView(v);
    } catch (e) {
      setErr(`加载失败: ${e}`);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const confirm = async (wrong: string, right: string) => {
    try {
      await invoke("asr_confusion_confirm", { wrong, right });
      setMsg(`✓ 已确认「${wrong}→${right}」：纠错规则生效，正确词已加入 ASR 热词`);
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const dismiss = async (wrong: string, right: string) => {
    try {
      await invoke("asr_confusion_dismiss", { wrong, right });
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const removeRule = async (from: string) => {
    try {
      await invoke("asr_confusion_remove_rule", { from });
      setMsg(`已删除规则「${from}」（热词保留，可单独管理）`);
      await reload();
    } catch (e) {
      setErr(String(e));
    }
  };

  const candidates = view?.candidates ?? [];

  return (
    <div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>
        <b>ASR 同音混淆闭环</b>{" "}
        <span style={{ color: "#9ca3af", fontSize: 11 }}>
          画像来自离线精修采纳流；确认=纠错规则（共现才替换）+ 反哺热词；asr_confusion.json 可校准
        </span>
      </div>
      {msg && (
        <div style={{ fontSize: 11, color: "#047857", background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ fontSize: 11, color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 8px", marginBottom: 6 }}>
          {err}
        </div>
      )}
      <div style={{ fontSize: 12, marginBottom: 4 }}>
        待确认候选（{candidates.length}）
        {view != null && view.dismissed_count > 0 && (
          <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>已忽略 {view.dismissed_count} 条</span>
        )}
      </div>
      {candidates.length === 0 ? (
        <div style={{ fontSize: 12, color: "#9ca3af" }}>
          {view === null ? "加载中…" : "暂无新候选——采纳离线精修草稿后自动积累画像（≥2 次出现才提名）"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {candidates.map((c) => (
            <div key={`${c.wrong}|${c.right}`} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 4, padding: "1px 6px" }}>
                {c.wrong}
              </span>
              <span style={{ color: "#9ca3af" }}>→</span>
              <span style={{ background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 4, padding: "1px 6px" }}>
                {c.right}
              </span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>×{c.count}</span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                <button style={{ ...rowBtn, color: "#047857", borderColor: "#6ee7b7" }} onClick={() => void confirm(c.wrong, c.right)}>
                  确认纠错+热词
                </button>
                <button style={rowBtn} onClick={() => void dismiss(c.wrong, c.right)}>
                  忽略
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {(view?.rules.length ?? 0) > 0 && (
        <>
          <div style={{ fontSize: 12, margin: "10px 0 4px" }}>已确认规则（{view?.rules.length}）</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {view?.rules.map((r) => (
              <div key={r.from} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                <span style={{ color: "#6b7280" }}>{r.from} → {r.to}</span>
                <button style={{ ...rowBtn, marginLeft: "auto", color: "#dc2626" }} onClick={() => void removeRule(r.from)}>
                  删除
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default AsrConfusionPanel;
