/**
 * imageDecorationPlugin — CM ViewPlugin：图片内联渲染（v0.14 子项目 A）。
 *
 * @ai-context: 将 `![alt](url)` 以 Decoration.replace widget 替换为真实图片
 *              （NoteImageWidget 挂载 React NoteImage）。仅 docChanged 重算
 *              decorations（spec §4.1）；独立行图片 block 化（占整行，替换后
 *              不残留行内空隙）。noteId/onOpen 经工厂参数注入（组件层持有）。
 */
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from "@codemirror/view";
import { scanImageRefs, type ImageRef } from "./imageDecoration";
import { NoteImageWidget } from "./NoteImageWidget";

interface PluginContext {
  noteId: number;
  onOpen?: (url: string, title?: string) => void;
}

/** 独立行图片：所在行除图片语法外仅空白 → block 占整行 */
function isBlockImage(view: EditorView, ref: ImageRef): boolean {
  const line = view.state.doc.lineAt(ref.from);
  const before = line.text.slice(0, ref.from - line.from);
  const after = line.text.slice(ref.to - line.from);
  return before.trim() === "" && after.trim() === "";
}

function computeDecorations(view: EditorView, ctx: PluginContext): DecorationSet {
  const refs = scanImageRefs(view.state.doc.toString());
  // RangeSetBuilder 是带位置的唯一构造途径（Decoration.replace 只接受 spec）
  const builder = new RangeSetBuilder<Decoration>();
  for (const r of refs) {
    builder.add(r.from, r.to, Decoration.replace({
      widget: new NoteImageWidget(r, ctx),
      block: isBlockImage(view, r),
    }));
  }
  return builder.finish();
}

/** 工厂：注入笔记上下文（noteId/onOpen），返回可直接进 extensions 的插件 */
export function imageDecorationPlugin(ctx: PluginContext) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = computeDecorations(view, ctx);
      }
      update(update: ViewUpdate) {
        // 仅内容变化重算——selection/滚动变化不触发（spec §4.1）
        if (update.docChanged) {
          this.decorations = computeDecorations(update.view, ctx);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
