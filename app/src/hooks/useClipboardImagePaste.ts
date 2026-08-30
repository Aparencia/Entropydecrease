/**
 * useClipboardImagePaste — 编辑态剪贴板图片导入（v0.15）。
 *
 * @ai-context: 提取（同步）→ 拦截默认粘贴 → base64 上送 import_note_image_b64
 *              （落盘 notes-images/{nid}/）→ onInsert 回调把相对引用写进编辑器
 *              （CM transaction / textarea 受控插入；CM decoration 自动重算 →
 *              图片即时内联显示）。同步返回 handled：true=已拦截（调用方不得再走
 *              默认粘贴）；false=无图片（默认文本粘贴）——DOM 事件同步契约。
 */
import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { blobToBase64 } from "../utils/blobToBase64";
import { extractClipboardImage, IMAGE_IMPORT_MAX_BYTES } from "../utils/clipboardImage";

interface Options {
  noteId: number;
  /** 导入成功 → 插入 `![图片](相对引用)`（调用方把引用写进编辑器） */
  onInsert: (rel: string) => void;
  /** 失败提示（status 区承接） */
  onError?: (msg: string) => void;
}

export function useClipboardImagePaste({ noteId, onInsert, onError }: Options) {
  const noteIdRef = useRef(noteId);
  const onInsertRef = useRef(onInsert);
  const onErrorRef = useRef(onError);
  useEffect(() => { noteIdRef.current = noteId; }, [noteId]);
  useEffect(() => { onInsertRef.current = onInsert; }, [onInsert]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const handleImagePaste = useCallback((e: ClipboardEvent | React.ClipboardEvent): boolean => {
    const img = extractClipboardImage(e);
    if (!img) return false;
    // 同步拦截：异步流程期间剪贴板事件已结束——preventDefault 必须在手势内
    e.preventDefault();
    void (async () => {
      if (img.blob.size > IMAGE_IMPORT_MAX_BYTES) {
        throw new Error("图片超过大小上限（10MB）");
      }
      const b64 = await blobToBase64(img.blob);
      const rel = await invoke<string>("import_note_image_b64", { noteId: noteIdRef.current, imageB64: b64 });
      onInsertRef.current(rel);
    })().catch((err) => onErrorRef.current?.(`剪贴板图片导入失败: ${err}`));
    return true;
  }, []);

  return handleImagePaste;
}
