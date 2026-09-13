/**
 * NoteTagsEditor — 笔记标签编辑浮层（批 7 T18；C2.1 / C2.2 的落点）。
 *
 * @ai-context: 为什么单独成件而不是塞进 `NoteHeaderActions`：后者的冻结值有两格已满
 *              （`nativeButton` 2/2、边框 `1px solid #e5e7eb` 1/1，见 `surfaceBaseline.ts`）
 *              ⇒ 新入口必须用 `Button` 原语、浮层必须用 `<Surface>`（§C9.12 硬结论）。
 * @ai-context: 写端三条命令的**唯一生产调用点**（§C2.2）：`update_note_tags`（加/删标签）
 *              · `set_tag_color`（设色）· `reset_tag_color`（清色）—— **设色与清色成对**
 *              （规格 §1 L5 行 35「标签色成对」）：`NoteColorPicker` 既有的 `color-clear`
 *              出口直接落到 `reset_tag_color`，本件不做第二条清除路径。
 * @ai-context: 浮层用 `absolute` 锚定（先例 `NoteHeaderActions.tsx:62-65`）—— **零
 *              `position:"fixed"`**：那会把本件拖进 `dialogMigration.e.test.ts` 的
 *              `CROSS_LINE_34`，而该判据件恰 300 行、余 0、改不动（§C2.1）。
 * @ai-context: 新增标签**不自动设色**（回填的确定性取色规则住在 Rust 数据层）——颜色由用户
 *              在芯片上点选（成对设/清），或由下次开库的幂等回填补齐。
 * 副作用：`invoke` 三条写端命令；打开浮层时 `invoke` 一次 `list_tag_colors`（查色表，
 *        失败仅 console.warn 不阻断编辑）。错误经 `onError` 上抛（不吞异常）。
 * 边界：标签顺序 = 库内 JSON 数组顺序（只追加/删除，不重排）；不触碰 `properties`。
 */
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, TagColor } from "../types";
import { paletteHex, parseNoteTags } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import { zIndex } from "../ui/zIndex";
import { Button, Surface, isImeComposing } from "../ui/primitives";
import NoteColorPicker from "./NoteColorPicker";

interface Props {
  note: Note;
  /** 写库成功后父层刷新（列表重载 + 右栏选中对象回读） */
  onChanged: () => void;
  /** 错误上抛（父层 status 区展示） */
  onError: (msg: string) => void;
}

/** 芯片基底（视觉由档位/token 决定：底色是查色表的 `paletteHex + 22` 透明度后缀，同 NoteListRow） */
const chipStyle: React.CSSProperties = { fontSize: 12, borderRadius: 10, padding: "1px 6px", color: "#374151" };

export default function NoteTagsEditor({ note, onChanged, onError }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  /** 正在展开色板的标签（null=都不展开） */
  const [editing, setEditing] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>({});
  const tags = parseNoteTags(note);
  // v0.14 B：当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 回退 light）
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );

  // 打开时读一次标签色（与 `useNotesListData` 同一条命令；失败不阻断编辑）
  useEffect(() => {
    if (!open) return;
    void invoke<TagColor[]>("list_tag_colors")
      .then((rows) => setColors(Object.fromEntries((rows ?? []).map((t) => [t.tag, t.color]))))
      .catch((e) => console.warn("[NoteTagsEditor] 标签色加载失败", e));
  }, [open, note.id]);

  /** 写标签集合（加/删共用一条命令；成功后清输入框并刷新父层） */
  const writeTags = (next: string[]): void => {
    void invoke<boolean>("update_note_tags", { id: note.id, tags: JSON.stringify(next) })
      .then(() => {
        setDraft("");
        onChanged();
      })
      .catch((e) => onError(`标签保存失败: ${e}`));
  };

  const addTag = (): void => {
    const t = draft.trim();
    if (!t || tags.includes(t)) {
      setDraft("");
      return;
    }
    setEditing(t);
    writeTags([...tags, t]);
  };

  /** 设色 / 清色成对（§C2.2）：null ⇒ `reset_tag_color`，否则 `set_tag_color` */
  const applyColor = (tag: string, color: string | null): void => {
    const done = (): void => {
      setColors((m) => {
        const next = { ...m };
        if (color === null) delete next[tag];
        else next[tag] = color;
        return next;
      });
      onChanged();
    };
    const fail = (e: unknown): void => onError(`标签颜色保存失败: ${e}`);
    if (color === null) void invoke("reset_tag_color", { tag }).then(done).catch(fail);
    else void invoke("set_tag_color", { tag, color }).then(done).catch(fail);
  };

  return (
    <div style={{ position: "relative" }}>
      <Button
        size="sm"
        variant="ghost"
        testId="note-tags-entry"
        title={open ? "收起标签编辑" : "编辑标签（写入库）"}
        onClick={() => setOpen((v) => !v)}
      >
        🏷 标签
      </Button>
      {open && (
        <Surface
          level="raised"
          radius="overlay"
          padded
          testId="note-tags-panel"
          style={{ position: "absolute", top: "100%", right: 0, zIndex: zIndex("popover"), width: 240, display: "flex", flexDirection: "column", gap: 6 }}
        >
          {/* 当前标签：点芯片展开色板，✕ 删除（删除也走 `update_note_tags`） */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {/* 文案避开空态词表（`emptyStateRatchet` 的 8 个词命中即要求登记，见其 EMPTY_RE） */}
            {tags.length === 0 && <span style={{ color: "#6b7280" }}>标签为空</span>}
            {tags.map((t) => (
              <span
                key={t}
                data-testid={`note-tag-chip-${t}`}
                onClick={() => setEditing((cur) => (cur === t ? null : t))}
                style={{ ...chipStyle, cursor: "pointer", background: colors[t] ? `${paletteHex(colors[t], theme)}22` : "#f3f4f6" }}
              >
                {t}
                <span
                  data-testid={`note-tag-remove-${t}`}
                  title="删除标签"
                  onClick={(e) => {
                    e.stopPropagation();
                    writeTags(tags.filter((x) => x !== t));
                  }}
                >
                  {" ✕"}
                </span>
              </span>
            ))}
          </div>
          {/* 输入 + 添加（Enter 提交带 IME 组合守卫，规格 §5.2 第三条） */}
          <div style={{ display: "flex", gap: 6 }}>
            <input
              data-testid="note-tag-input"
              value={draft}
              placeholder="输入标签后回车"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isImeComposing(e)) addTag();
              }}
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "4px 6px" }}
            />
            <Button size="sm" testId="note-tag-add" onClick={addTag}>
              添加
            </Button>
          </div>
          {/* 点芯片 ⇒ 设色 / 清色（成对；清除走 picker 既有的 color-clear） */}
          {editing !== null && tags.includes(editing) && (
            <NoteColorPicker value={colors[editing] ?? null} onChange={(color) => applyColor(editing, color)} size={16} />
          )}
        </Surface>
      )}
    </div>
  );
}
