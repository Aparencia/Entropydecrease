/**
 * NoteImageWidget — CM Decoration widget：React 挂载 NoteImage（v0.14 子项目 A）。
 *
 * @ai-context: widget.toDOM() 建容器 → createRoot 挂载 <NoteImage>，保留点击放大
 *              （onOpen 弹 ImagePreviewOverlay）；destroy() 必须 root.unmount()——
 *              CM 滚动/重绘会反复创建/销毁 widget，不卸载则 React root 泄漏
 *              （spec §4.1）。ignoreEvent 返回 true：点击不进入编辑；删除 =
 *              选中 widget 按 Delete（CM 原生支持）。eq 复用同位置同 url 的
 *              widget 避免无谓重挂载。
 */
import { WidgetType } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import NoteImage from "./NoteImage";
import type { ImageRef } from "./imageDecoration";

interface WidgetContext {
  noteId: number;
  /** 点击放大回调（透传最终可渲染 URL 到父层 ImagePreviewOverlay） */
  onOpen?: (url: string, title?: string) => void;
}

export class NoteImageWidget extends WidgetType {
  private root: Root | null = null;

  constructor(
    private readonly ref: ImageRef,
    private readonly ctx: WidgetContext,
  ) {
    super();
  }

  override toDOM(): HTMLElement {
    const container = document.createElement("span");
    container.className = "cm-note-image";
    container.style.display = "inline-block";
    // 同位置重建时复用旧容器会残留子节点——直接挂载即可（root 接管容器）
    this.root = createRoot(container);
    this.root.render(
      <NoteImage src={this.ref.url} alt={this.ref.alt} noteId={this.ctx.noteId} onOpen={this.ctx.onOpen} />,
    );
    return container;
  }

  override eq(other: NoteImageWidget): boolean {
    return other.ref.from === this.ref.from && other.ref.url === this.ref.url;
  }

  override destroy(): void {
    // 防 React root 泄漏：CM 重建/销毁 widget 时卸载已挂载的 root
    this.root?.unmount();
    this.root = null;
  }

  override ignoreEvent(): boolean {
    // 图片区域不进入编辑（点击触发放大/拖选），删除走选中 + Delete
    return true;
  }
}
