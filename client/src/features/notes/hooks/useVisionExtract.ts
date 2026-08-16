/**
 * P4 截图/图片 AI 视觉提取 hook
 * AI vision extraction hook (P4)
 *
 * @ai-context: 从 NoteEditPage 拆出。独立文件入口（不干扰原生图片插入流程）：
 * 选择图片 → 剥离 data URI 前缀得裸 base64 → aiPluginLoader.extractScreenContent
 * → 文本/要点/公式拼接插入编辑器光标处。错误经 toast 提示，成功播放
 * ai_analysis_done 音效。visionInputRef 供页面隐藏 input 绑定。
 * @ai-context: Extracted from NoteEditPage. Standalone entry (does not disturb
 * the native image-insert flow): pick image → strip data-URI prefix for raw
 * base64 → extractScreenContent → insert text/key-points/formulas at the
 * cursor. Errors surface via toast; success plays ai_analysis_done. The
 * visionInputRef is bound to the page's hidden file input.
 */
import { useCallback, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';

/**
 * 截图/图片 AI 视觉提取：返回隐藏 input ref、提取中标记与变更处理器。
 * Vision extraction: hidden-input ref, extracting flag and change handler.
 *
 * @param editor - TipTap 编辑器实例（null 时处理器直接返回）
 */
export function useVisionExtract(editor: Editor | null) {
  // P4 截图视觉提取：独立文件入口（不干扰原生图片插入流程）
  const visionInputRef = useRef<HTMLInputElement>(null);
  const [visionExtracting, setVisionExtracting] = useState(false);
  const { toast } = useToast();

  /** P4 AI 提取图片文字/公式：base64 → extractScreenContent → 插入编辑器 */
  const handleVisionExtract = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    setVisionExtracting(true);
    toast({ type: 'info', message: 'AI 正在提取图片内容…', duration: 1500 });
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // 剥离 data:image/...;base64, 前缀（插件契约要求裸 base64）
          resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
        };
        reader.onerror = () => reject(new Error('图片读取失败'));
        reader.readAsDataURL(file);
      });
      const result = await aiPluginLoader.extractScreenContent(base64, 'zh');
      const parts = [result.text];
      if (result.keyPoints.length > 0) parts.push('', '**要点**', ...result.keyPoints.map((k) => `- ${k}`));
      if (result.formulas.length > 0) parts.push('', '**公式**', ...result.formulas);
      const insertText = parts.filter(Boolean).join('\n');
      editor.chain().focus().insertContent(insertText).run();
      soundPlayer.play('ai_analysis_done');
      toast({ type: 'success', message: `已提取图片内容（${insertText.length} 字符）`, silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      toast({ type: 'error', message: `AI 提取失败：${msg}` });
    } finally {
      setVisionExtracting(false);
    }
  }, [editor, toast]);

  return { visionInputRef, visionExtracting, handleVisionExtract };
}
