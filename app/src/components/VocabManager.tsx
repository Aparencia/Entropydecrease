/**
 * VocabManager — 词表管理（REQ-040 / v0.4.0 M5：热词/替换词闭环 + 课件预热）。
 *
 * @ai-context: 热词 CRUD（注入流式 ASR，端点断句自动生效）+ 替换词对（OCR 后纠错）
 *              + 课件文本提取候选（pptx/txt/md）+ 最近会话 OCR 高频词建议。
 * @ai-context: 候选/建议仅为"提名人"——用户确认后一键加入（OCR 误识别词不得自动进词表）。
 * @ai-context: 变更经后端 JSON 原子持久化；ASR 热词在下一个端点断句生效（无需重启会话）。
 */

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** 词表全量（Rust VocabState） */
interface VocabState {
  hotwords: string[];
  replacements: { from: string; to: string }[];
}

const btn: React.CSSProperties = {
  padding: "3px 8px",
  fontSize: 11,
  borderRadius: 6,
  border: "1px solid #e5e7eb",
  background: "#fff",
  cursor: "pointer",
};

export function VocabManager() {
  const [state, setState] = useState<VocabState>({ hotwords: [], replacements: [] });
  const [newWord, setNewWord] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await invoke<VocabState>("vocab_get"));
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addHotword = async () => {
    const word = newWord.trim();
    if (!word) return;
    try {
      const added = await invoke<number>("vocab_add_hotwords", { words: [word] });
      setMessage(added > 0 ? `已加入热词：${word}` : "该词已在词表中");
      setNewWord("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const addHotwordsBatch = async (words: string[]) => {
    if (words.length === 0) return;
    try {
      const added = await invoke<number>("vocab_add_hotwords", { words });
      setMessage(`已加入 ${added} 个热词`);
      setCandidates([]);
      setSuggestions([]);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const removeHotword = async (word: string) => {
    try {
      await invoke("vocab_remove_hotword", { word });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const addReplacement = async () => {
    if (!from.trim()) return;
    try {
      await invoke("vocab_add_replacement", { from, to });
      setMessage("替换词对已保存（OCR 后纠错生效）");
      setFrom("");
      setTo("");
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const removeReplacement = async (f: string) => {
    try {
      await invoke("vocab_remove_replacement", { from: f });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const extractCourseware = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const picked = await open({
        multiple: false,
        filters: [
          { name: "课件", extensions: ["pptx", "txt", "md", "pdf"] },
        ],
      });
      if (typeof picked === "string") {
        const cands = await invoke<string[]>("vocab_extract_courseware", { path: picked });
        setCandidates(cands);
        setMessage(cands.length > 0 ? `课件提取完成，候选 ${cands.length} 个（确认后加入）` : "课件中未提取到候选词");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const suggestFromOcr = async () => {
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const sugg = await invoke<string[]>("vocab_suggest_from_ocr");
      setSuggestions(sugg);
      setMessage(sugg.length > 0 ? `最近会话 OCR 高频词建议 ${sugg.length} 个（确认后加入）` : "暂无高频词建议（需先有会话 OCR 记录）");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontSize: 12, color: "#374151" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
        词表（热词注入 ASR，替换词纠错 OCR）
      </div>

      {/* 热词 CRUD */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addHotword()}
            placeholder="术语/人名（如：Transformer）"
            style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <button onClick={() => void addHotword()} style={btn}>
            添加
          </button>
        </div>
        {state.hotwords.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {state.hotwords.map((w) => (
              <span
                key={w}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 6px",
                  background: "#f0fdfa",
                  border: "1px solid #99f6e4",
                  borderRadius: 10,
                  fontSize: 11,
                }}
              >
                {w}
                <button
                  onClick={() => void removeHotword(w)}
                  title="删除"
                  style={{ border: "none", background: "none", cursor: "pointer", color: "#0d9488", padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 替换词对 */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="错词（如：主者）"
            style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <span style={{ alignSelf: "center", color: "#9ca3af" }}>→</span>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="正词（如：王者）"
            style={{ flex: 1, padding: "4px 6px", fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }}
          />
          <button onClick={() => void addReplacement()} style={btn}>
            添加
          </button>
        </div>
        {state.replacements.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {state.replacements.map((p) => (
              <span
                key={p.from}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "1px 6px",
                  background: "#fefce8",
                  border: "1px solid #fde68a",
                  borderRadius: 10,
                  fontSize: 11,
                }}
              >
                {p.from}→{p.to}
                <button
                  onClick={() => void removeReplacement(p.from)}
                  title="删除"
                  style={{ border: "none", background: "none", cursor: "pointer", color: "#b45309", padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 课件预热 + OCR 建议 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        <button onClick={() => void extractCourseware()} disabled={busy} style={{ ...btn, flex: 1 }}>
          📄 课件提取候选（pptx/txt/md）
        </button>
        <button onClick={() => void suggestFromOcr()} disabled={busy} style={{ ...btn, flex: 1 }}>
          🔍 OCR 高频词建议
        </button>
      </div>
      {(candidates.length > 0 || suggestions.length > 0) && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {candidates.map((c) => (
              <button key={`c-${c}`} onClick={() => void addHotwordsBatch([c])} title="加入热词" style={btn}>
                {c} ＋
              </button>
            ))}
            {suggestions.map((s) => (
              <button key={`s-${s}`} onClick={() => void addHotwordsBatch([s])} title="加入热词" style={btn}>
                {s} ＋
              </button>
            ))}
          </div>
          {(candidates.length > 0 || suggestions.length > 0) && (
            <button
              onClick={() => void addHotwordsBatch([...candidates, ...suggestions])}
              style={{ ...btn, marginTop: 4, background: "#0d9488", color: "#fff", border: "none" }}
            >
              全部加入热词
            </button>
          )}
        </div>
      )}
      {message && <div style={{ fontSize: 11, color: "#0d9488", marginTop: 4 }}>{message}</div>}
      {error && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{error}</div>}
      <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
        ASR 热词在下一个断句生效；替换词即时生效
      </div>
    </div>
  );
}
