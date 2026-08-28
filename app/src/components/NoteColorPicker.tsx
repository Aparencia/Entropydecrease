/**
 * NoteColorPicker — 色板选择器（v0.14 B 视觉系统；笔记级/组级/标签级三处复用）。
 *
 * @ai-context: spec §4.1/§4.2——固定 12 色语义色板（不开放自定义），null=未设置
 *              （渲染层回退默认灰）。色点内文字取 onColorText（黑/白高对比，
 *              WCAG AA ≥4.5:1 由 isThemeSafe 定义期保证）；主题经 matchMedia
 *              跟随 App.css 的 prefers-color-scheme。受控组件——选中态/清除
 *              完全由 value/onChange 驱动。
 */
import { useMemo, useState } from "react";
import { COLOR_IDS, COLOR_PALETTE, onColorText, paletteHex } from "../utils/colorPalette";
import type { ColorId, ThemeMode } from "../utils/colorPalette";

interface Props {
  /** 当前色板 id（null=未设置） */
  value: string | null;
  onChange: (color: string | null) => void;
  /** 色点直径（默认 18px） */
  size?: number;
}

/** 当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 时回退 light） */
function useTheme(): ThemeMode {
  return useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }, []);
}

export default function NoteColorPicker({ value, onChange, size = 18 }: Props) {
  const theme = useTheme();
  // 本地悬停态（色点 title 提示语义；受控值不参与）
  const [hover, setHover] = useState<ColorId | null>(null);

  return (
    <div
      data-testid="note-color-picker"
      style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: size * 6 + 36 }}
      onClick={(e) => e.stopPropagation()}
    >
      {COLOR_IDS.map((id) => {
        const hex = paletteHex(id, theme);
        const active = value === id;
        const textColor = onColorText(id, theme);
        return (
          <button
            key={id}
            data-testid={`color-${id}`}
            data-active={active || undefined}
            title={COLOR_PALETTE[id].label}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onChange(active ? null : id)}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              background: hex,
              border: active ? "2px solid #111827" : hover === id ? "2px solid #9ca3af" : "1px solid rgba(0,0,0,0.15)",
              cursor: "pointer",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: size * 0.55,
              color: textColor,
              lineHeight: 1,
            }}
          >
            {active ? "✓" : ""}
          </button>
        );
      })}
      {/* 清除（回默认灰）——独立按钮避免与灰色色板混淆 */}
      <button
        data-testid="color-clear"
        onClick={() => onChange(null)}
        title="清除颜色（默认灰）"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          background: "repeating-linear-gradient(45deg, #e5e7eb 0 3px, #fff 3px 6px)",
          border: "1px dashed #9ca3af",
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.5,
          color: "#6b7280",
          lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}
