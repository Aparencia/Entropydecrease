/**
 * clipboardImage — 剪贴板图片提取与导入（v0.15 编辑态粘贴图片）。
 *
 * @ai-context: 入口纪律——CM domEventHandlers.paste 与 textarea onPaste 共用同一
 *              提取逻辑（event.clipboardData 同步读取，WebView2 paste 手势下无
 *              权限弹窗）；提取到图片即同步 preventDefault（默认粘贴会丢弃图片），
 *              导入成功才插入引用——失败 status 提示不落脏内容（能力降级不失效）。
 */

export interface ClipboardImage {
  blob: Blob;
  mime: string;
}

/** 从粘贴事件提取首张图片（无图片返回 null——调用方走默认文本粘贴） */
export function extractClipboardImage(e: ClipboardEvent | React.ClipboardEvent): ClipboardImage | null {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return { blob, mime: item.type };
    }
  }
  return null;
}

/** 前端预检上限（与后端 IMAGE_MAX_BYTES 对齐——超限提前拦截省 IPC 传输） */
export const IMAGE_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
