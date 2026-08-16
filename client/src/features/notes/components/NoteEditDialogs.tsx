/**
 * 笔记编辑页底部弹层集合（AI 摘要 / 内容分层 / 信息图 / 滚书背诵 / 声音锚点）
 * Note editor bottom dialog collection
 *
 * @ai-context: 从 NoteEditPage 拆出。纯展示组合层：接收页面持有的弹层开关、
 * ai 摘要状态（useNoteAI 返回值整体注入）、信息图数据与 healthText，渲染各
 * Modal 组件；自身无状态。开关状态与 AI 调用仍由页面编排（主文件保留状态编排）。
 * 信息图导出 SVG 的下载逻辑随 JSX 一并迁入。
 * @ai-context: Extracted from NoteEditPage. Pure presentational composition:
 * receives dialog toggles, the useNoteAI return object, infographic data and
 * healthText from the page and renders the Modal components; holds no state.
 * Dialog toggles and AI calls stay orchestrated by the page. The infographic
 * SVG-export download logic moved in with its JSX.
 */
import { AISummaryModal } from './AISummaryModal';
import { ContentTierModal } from './ContentTierModal';
import RollingRecallMode from './RollingRecallMode';
import { Modal } from '@/components/ui/Modal';
import InfographicRenderer from '@/components/InfographicRenderer';
import { SoundAnchorPicker } from '@/features/soundanchor/components/SoundAnchorPicker';
import { Download } from 'lucide-react';
import type { InfographicData } from '@/lib/ai/types';
import type { useNoteAI } from '../hooks/useNoteAI';

interface NoteEditDialogsProps {
  /** useNoteAI 返回对象（摘要浮层全部回调/状态整体注入，避免逐项透传） */
  ai: ReturnType<typeof useNoteAI>;
  noteId: string | null;
  noteTitle: string;
  healthText: string;
  tierOpen: boolean;
  onCloseTier: () => void;
  infographicOpen: boolean;
  onCloseInfographic: () => void;
  infographic: InfographicData | null;
  infographicLoading: boolean;
  infographicError: string | null;
  isFallback: boolean;
  recallOpen: boolean;
  onCloseRecall: () => void;
  soundAnchorOpen: boolean;
  onCloseSoundAnchor: () => void;
  onGoSettings: () => void;
}

export function NoteEditDialogs({
  ai,
  noteId,
  noteTitle,
  healthText,
  tierOpen,
  onCloseTier,
  infographicOpen,
  onCloseInfographic,
  infographic,
  infographicLoading,
  infographicError,
  isFallback,
  recallOpen,
  onCloseRecall,
  soundAnchorOpen,
  onCloseSoundAnchor,
  onGoSettings,
}: NoteEditDialogsProps) {
  return (
    <>
      {/* AI 摘要结果浮层 */}
      {ai.summaryModalOpen && (
        <AISummaryModal
          data={ai.aiData}
          loading={ai.aiLoading}
          error={ai.aiError}
          needsConfig={ai.aiNeedsConfig}
          isStreaming={ai.isStreaming}
          streamingText={ai.streamingText}
          flashcardLoading={ai.flashcardLoading}
          convertedKeys={ai.convertedKeys}
          onClose={() => ai.setSummaryModalOpen(false)}
          onGoSettings={onGoSettings}
          onCopySummary={ai.handleCopySummary}
          onGenerateFlashcard={ai.handleGenerateFlashcard}
          onGenerateAllFlashcards={ai.handleGenerateAllFlashcards}
          onInsertNote={ai.handleInsertNote}
          onRegenerate={ai.handleRegenerate}
          onExport={ai.handleExport}
          onCancelStream={ai.cancelStream}
        />
      )}
      {/* N5 内容分层弹窗（策略性遗忘标记） */}
      <ContentTierModal open={tierOpen} onClose={onCloseTier} noteText={healthText} noteId={noteId} />

      {/* 知识信息图弹窗：AI 生成中显示 spinner，失败时 hook 已回退默认图（降级提示见 toast） */}
      <Modal
        open={infographicOpen}
        onClose={onCloseInfographic}
        title="知识信息图"
        description={infographicError ?? 'AI 将笔记内容可视化为结构化信息图'}
        size="lg"
      >
        {infographicLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-2 text-text-tertiary">
              <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
              <span className="text-b2">AI 正在生成信息图…</span>
            </div>
          </div>
        ) : infographic ? (
          <div className="max-h-[60vh] overflow-y-auto">
            <InfographicRenderer data={infographic} />
            {isFallback && (
              <p className="mt-3 text-c1 text-text-tertiary">AI 信息图服务暂不可用，已展示默认信息图。</p>
            )}
            <div className="flex justify-end mt-3">
              <button
                onClick={() => {
                  const svg = document.querySelector('.infographic-renderer svg');
                  if (!svg) return;
                  const svgData = new XMLSerializer().serializeToString(svg);
                  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `infographic-${Date.now()}.svg`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-kb-md text-c1 font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/40 transition-colors"
              >
                <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                导出 SVG
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 滚书背诵弹窗：4 轮渐进式回忆 */}
      <Modal
        open={recallOpen}
        onClose={onCloseRecall}
        title="滚书背诵"
        description="4 轮渐进式回忆：通读标记 → 精读理解 → 闭卷回忆 → 默写输出"
        size="lg"
      >
        <RollingRecallMode
          noteContent={healthText}
          noteTitle={noteTitle}
          onClose={onCloseRecall}
          className="max-h-[60vh]"
        />
      </Modal>

      {/* 3.11 声音记忆锚点选择器：绑定当前笔记概念 */}
      <SoundAnchorPicker
        open={soundAnchorOpen}
        conceptId={noteId ?? 'note'}
        conceptTitle={noteTitle || '未命名笔记'}
        onClose={onCloseSoundAnchor}
      />
    </>
  );
}
