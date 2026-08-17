/**
 * 图片插入工具：压缩后插入 TipTap 编辑器（桌面文件输入 / Capacitor 相机相册共用）
 *
 * @ai-context: 移动端 Capacitor 取图后落盘应用私有目录，经 readDataFile 还原为
 * File，再走与桌面一致的压缩 → setImage 链路，保证图片质量策略一致。
 * @ai-context EN: shared image insertion for desktop file input and the
 * Capacitor camera/gallery path — compress then insert via TipTap setImage.
 */
import type { Editor } from '@tiptap/react';
import { compressImageForNote } from './imageCompress';

export async function insertImageFile(editor: Editor, file: File): Promise<void> {
  const src = await compressImageForNote(file);
  editor.chain().focus().setImage({ src }).run();
}
