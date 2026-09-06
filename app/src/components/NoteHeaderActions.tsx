/**
 * NoteHeaderActions — 笔记阅读头动作组（v0.20.5：NotesPage 编排瘦身拆分）。
 *
 * @ai-context: 原内联于 NotesPage 阅读视图 headerExtra 插槽——色点（笔记级
 *              颜色入口：显式色写库、显示色含组继承）/ 移动到组 / 挂体系 /
 *              🤖 AI 精修入口 / 🧠 模型卡草稿入口。本组件只消费选中笔记与
 *              回调，自持局部态（色板开合 + 主题推导），NotesPage 不必感知；
 *              错误经 onError 上抛（沿用父层 status 区展示，不吞异常）。
 * @ai-context: 全部为「对单条笔记的转换/组织动作」——v0.20.5 域页剥离时
 *              裁决保留在笔记上下文（不属行动/复习域）。
 */
import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Note, NoteGroup } from "../types";
import { paletteHex, parseNoteProperties } from "../utils/colorPalette";
import type { ThemeMode } from "../utils/colorPalette";
import NoteColorPicker from "./NoteColorPicker";
import NoteMoveToGroupMenu from "./NoteMoveToGroupMenu";
import NoteLinkToSystem from "./NoteLinkToSystem";

interface Props {
  note: Note;
  /** 已解析显示色（含组继承——父层 noteColors 映射给出；null=默认灰） */
  resolvedColor: string | null;
  groups: NoteGroup[];
  /** 变更后父层刷新（列表重载 + 右栏选中对象回读） */
  onChanged: () => void;
  /** 错误上抛（父层 status 区展示） */
  onError: (msg: string) => void;
  /** 跳体系页并打开建体系向导（TD-2026-09-05-A 空体系引导） */
  onGotoKnowledgeSystem?: () => void;
  /** 打开编辑态 AI 能力对话框（阅读态点击直接进入编辑态） */
  onOpenAi: () => void;
  /** 打开模型卡草稿对话框（组内 model 卡唯一生成链） */
  onOpenModelCard: () => void;
}

export default function NoteHeaderActions({
  note, resolvedColor, groups, onChanged, onError, onGotoKnowledgeSystem, onOpenAi, onOpenModelCard,
}: Props) {
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  // v0.14 B：当前主题（跟随 prefers-color-scheme；jsdom 无 matchMedia 回退 light）
  const theme: ThemeMode = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    [],
  );

  return (
    <>
      {/* v0.14 B：笔记级颜色入口——色点显示解析色（含继承），picker 编辑显式色 */}
      <div style={{ position: "relative" }}>
        <span
          data-testid="note-color-dot"
          onClick={() => setColorPickerOpen((v) => !v)}
          title="设置笔记颜色"
          style={{ width: 12, height: 12, borderRadius: 3, cursor: "pointer", display: "inline-block", background: paletteHex(resolvedColor, theme) }}
        />
        {colorPickerOpen && (
          <div
            data-testid="note-color-picker-pop"
            style={{ position: "absolute", top: "100%", right: 0, zIndex: 30, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}
          >
            <NoteColorPicker
              value={parseNoteProperties(note).color ?? null}
              onChange={(color) => {
                invoke("update_note_color", { id: note.id, color })
                  .then(() => {
                    setColorPickerOpen(false);
                    // 刷新列表（色条）+ 右栏（笔记对象，handleNoteChanged 内 get_note 取最新）
                    onChanged();
                  })
                  .catch((e) => onError(`笔记颜色设置失败: ${e}`));
              }}
            />
          </div>
        )}
      </div>
      {/* v0.16.1：手动分组显式入口——移动/移出组（onChanged 刷新列表+右栏） */}
      <NoteMoveToGroupMenu
        key={`move-${note.id}`}
        note={note}
        groups={groups}
        onChanged={onChanged}
      />
      {/* v0.13.7 触点②：标题栏「挂到体系」入口；key=note.id 切笔记重置内部态 */}
      <NoteLinkToSystem
        key={`link-${note.id}`}
        noteId={note.id}
        onChanged={onChanged}
        onGotoKnowledgeSystem={onGotoKnowledgeSystem}
      />
      {/* v0.17.0：编辑态 AI 能力统一入口（阅读态点击直接进入编辑态） */}
      <button
        data-testid="note-ai-entry"
        onClick={onOpenAi}
        title="AI 精修 / 知识补充"
        style={{
          padding: "3px 8px", cursor: "pointer", fontSize: 11, borderRadius: 6,
          border: "1px solid #c7d2fe", background: "#f5f3ff", color: "#4c1d95",
        }}
      >
        🤖 AI
      </button>
      {/* v0.20.3（REQ-302）：笔记段 → 模型卡草稿（组内 model 卡唯一生成链） */}
      <button
        data-testid="note-model-card-entry"
        onClick={onOpenModelCard}
        title="把本条笔记提炼为模型卡草稿（需已归组）"
        style={{
          padding: "3px 8px", cursor: "pointer", fontSize: 11, borderRadius: 6,
          border: "1px solid #d1fae5", background: "#ecfdf5", color: "#047857",
        }}
      >
        🧠 模型卡
      </button>
    </>
  );
}
