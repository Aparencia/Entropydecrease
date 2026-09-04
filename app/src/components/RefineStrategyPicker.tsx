/**
 * RefineStrategyPicker — 精修策略选择器（v0.17.0 REQ-245；REQ-279 自定义档）。
 *
 * @ai-context: 三层交互：目标层（书面 chips + 自由输入关键词匹配，未命中诚实
 *              提示）→ 档位层（L1 忠实整理/L2 标准精修/L3 深度改写/L4 极简提取
 *              + L5 自定义）→ 旋钮层（6 维高级微调）。声明来源=后端 meta（零
 *              硬编码）；草稿形态见 utils/refineStrategy.ts（可单测纯函数）。
 * @ai-context: 点档位 → 旋钮跳到该档预设（替换语义清残留，REQ-279）；手动改
 *              旋钮 → "已偏离档位"徽标；intent 基准（chip）→ presetId=
 *              "intent:xxx"（不占档位语义）。自定义档=选中后写下自由文本
 *              （空文本提示——后端会按标准精修兜底，前端先行诚实提示）。
 * @ai-context: allowCustom=false 用于设置页偏好（自定义文本无法表达为全局
 *              默认档——只有发起点才有自由文本语境）。
 */
import { useState } from "react";
import type { RefineStrategyMeta } from "../types";
import {
  applyCustomText,
  applyDim,
  applyIntent,
  applyPreset,
  isDeviating,
  matchIntent,
  type StrategyDraft,
} from "../utils/refineStrategy";

const chipBtn = (active: boolean): React.CSSProperties => ({
  padding: "3px 10px", cursor: "pointer", fontSize: 12, borderRadius: 999,
  border: active ? "1px solid #4f46e5" : "1px solid #d1d5db",
  background: active ? "#eef2ff" : "#fff", color: active ? "#3730a3" : "#374151",
});

const optBtn = (active: boolean): React.CSSProperties => ({
  padding: "2px 8px", cursor: "pointer", fontSize: 11, borderRadius: 6,
  border: active ? "1px solid #4f46e5" : "1px solid #e5e7eb",
  background: active ? "#eef2ff" : "#fff", color: active ? "#3730a3" : "#4b5563",
});

export default function RefineStrategyPicker({
  meta, value, onChange, allowCustom = true, showIntents = true,
}: {
  meta: RefineStrategyMeta | null;
  value: StrategyDraft;
  onChange: (d: StrategyDraft) => void;
  /** 设置页偏好等场景禁用自定义档（无自由文本语境——REQ-279） */
  allowCustom?: boolean;
  /** 设置页偏好隐藏意图 chips/自由输入（目标是单次任务语义，非全局默认） */
  showIntents?: boolean;
}) {
  const [intentText, setIntentText] = useState("");
  const [intentHint, setIntentHint] = useState("");

  /** 自由输入 → 本地关键词匹配（未命中诚实提示——不瞎猜） */
  const applyIntentText = () => {
    const hit = matchIntent(intentText, meta);
    if (!hit) {
      setIntentHint("没匹配到目标——换种说法，或直接点上方目标按钮");
      return;
    }
    setIntentHint("");
    onChange(applyIntent(value, hit, meta));
  };

  const deviating = isDeviating(value, meta);
  const isCustom = value.presetId === "custom";
  const ladders = meta?.ladderPresets ?? [];
  const visibleLadders = allowCustom ? ladders : ladders.filter((p) => p.id !== "custom");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* 目标层：书面 chips + 自由输入（单次任务语义——设置页隐藏） */}
      {showIntents && (
      <div>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>
          你想要什么效果？
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {meta?.intents.map((i) => (
            <button
              key={i.id}
              style={chipBtn(value.presetId === `intent:${i.id}`)}
              title={i.keywords.join(" / ")}
              onClick={() => onChange(applyIntent(value, i, meta))}
            >
              {i.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {/* 关键词仅作意图映射提示——显示全部关键词兜底（声明唯一源） */}
          {meta && (
            <input
              value={intentText}
              onChange={(e) => { setIntentText(e.target.value); setIntentHint(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") applyIntentText(); }}
              placeholder={`或直接说目标（如「${meta.intents[0]?.keywords.slice(0, 2).join("、") ?? "说人话"}」）`}
              style={{ flex: 1, padding: "3px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6 }}
            />
          )}
          <button style={{ ...optBtn(false), border: "1px solid #d1d5db" }} onClick={applyIntentText}>
            应用
          </button>
        </div>
        {intentHint && <div style={{ fontSize: 11, color: "#b45309", marginTop: 2 }}>{intentHint}</div>}
      </div>
      )}

      {/* 档位层：四档阶梯 + 自定义（REQ-279） */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#6b7280" }}>内容变化程度</span>
          {deviating && !isCustom && <span style={{ fontSize: 10, color: "#b45309" }}>⚠ 已偏离档位预设</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${visibleLadders.length}, 1fr)`, gap: 6 }}>
          {visibleLadders.map((p) => (
            <button
              key={p.id}
              onClick={() => onChange(applyPreset(value, p, meta))}
              title={p.desc}
              style={{
                padding: "6px 4px", cursor: "pointer", fontSize: 12, borderRadius: 8,
                border: value.presetId === p.id ? "1.5px solid #4f46e5" : "1px solid #d1d5db",
                background: value.presetId === p.id ? "#eef2ff" : "#fff",
                color: value.presetId === p.id ? "#3730a3" : "#374151", textAlign: "center",
              }}
            >
              <div>{p.name}</div>
              <div style={{ fontSize: 10, color: value.presetId === p.id ? "#6366f1" : "#9ca3af", marginTop: 2 }}>
                {p.desc}
              </div>
            </button>
          ))}
        </div>
            {/* 自定义档：自由文本（空文本提示——后端按标准精修兜底） */}
        {isCustom && (
          <div style={{ marginTop: 6, border: "1px solid #e0e7ff", borderRadius: 8, padding: 8, background: "#fbfaff" }}>
            <div style={{ fontSize: 11, color: "#3730a3", marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>自定义要求（写下你想要的精修程度/风格，将随提示词发送）</span>
              {/* 低2（审查）：maxLength 与 Rust MAX_CUSTOM_TEXT_CHARS=500 对齐——所见即所发 */}
              <span style={{ color: "#9ca3af", flexShrink: 0 }}>≤500 字</span>
            </div>
            <textarea
              value={value.customText ?? ""}
              onChange={(e) => onChange(applyCustomText(value, e.target.value))}
              maxLength={500}
              placeholder="例如：更口语一些，概念多用一个生活化例子解释；但技术术语保持原文…"
              style={{ width: "100%", minHeight: 56, fontSize: 12, fontFamily: "inherit",
                border: "1px solid #d1d5db", borderRadius: 6, padding: 6, boxSizing: "border-box" }}
            />
            {!(value.customText ?? "").trim() && (
              <div style={{ fontSize: 10, color: "#b45309", marginTop: 2 }}>
                未填写时将按「标准精修」处理——可先写下要求，或改选其它档位
              </div>
            )}
          </div>
        )}
      </div>

      {/* 旋钮层：高级微调 */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 8 }}>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>高级微调</div>
        {meta?.strategyDims.map((dim) => (
          <div key={dim.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "#374151", width: 64, flexShrink: 0 }}>{dim.label}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {dim.options.map((o) => (
                <button
                  key={o.value}
                  style={optBtn(value.dims[dim.key] === o.value)}
                  title={o.instruction}
                  onClick={() => onChange(applyDim(value, dim.key, o.value))}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {!meta && <div style={{ fontSize: 11, color: "#9ca3af" }}>策略声明加载中…</div>}
      </div>
    </div>
  );
}
