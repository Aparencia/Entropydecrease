/**
 * 课后分析结果预览面板
 * 展示 AI 多模态分析的 Markdown 笔记结果，支持一键插入 TipTap 编辑器
 *
 * @ai-context: 通用组件：AnalysisPreview。
 */

import { useMemo } from 'react';
import {
  Loader2,
  Sparkles,
  FilePlus,
  X,
  AlertCircle,
  RotateCcw,
  Layers,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import type { AnalyzeResult } from '@/lib/ai/sessionAnalyzer';

// ================================================================
// Props
// ================================================================

interface AnalysisPreviewProps {
  result: AnalyzeResult | null;
  isAnalyzing: boolean;
  /** 分析失败时透传的错误信息 */
  error?: string | null;
  onInsert: (content: string) => void;
  onDismiss: () => void;
  onRetry?: () => void;
  /** 可选：从笔记生成闪卡 */
  onGenerateCards?: (content: string) => void;
}

// ================================================================
// 简易 Markdown → HTML 转换（仅处理常用语法，不做完整解析）
// ================================================================

function renderMarkdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inCodeBlock = false;
  let inList = false;

  for (const line of lines) {
    // 代码块开关
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push('</code></pre>');
        inCodeBlock = false;
      } else {
        if (inList) { htmlLines.push('</ul>'); inList = false; }
        htmlLines.push('<pre><code>');
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      // 代码块内直接追加，保留原始空白
      htmlLines.push(escapeHtml(line));
      continue;
    }

    // 列表项
    if (/^\s*[-*]\s/.test(line)) {
      if (!inList) { htmlLines.push('<ul>'); inList = true; }
      htmlLines.push(`<li>${inlineFormat(line.replace(/^\s*[-*]\s/, ''))}</li>`);
      continue;
    }

    if (inList) { htmlLines.push('</ul>'); inList = false; }

    // 标题
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) { htmlLines.push(`<h3>${inlineFormat(h3Match[1])}</h3>`); continue; }
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) { htmlLines.push(`<h2>${inlineFormat(h2Match[1])}</h2>`); continue; }
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) { htmlLines.push(`<h1>${inlineFormat(h1Match[1])}</h1>`); continue; }

    // 分隔线
    if (/^---+$/.test(line.trim())) {
      htmlLines.push('<hr/>');
      continue;
    }

    // 空行
    if (!line.trim()) {
      htmlLines.push('<br/>');
      continue;
    }

    // 普通段落
    htmlLines.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inList) htmlLines.push('</ul>');
  if (inCodeBlock) htmlLines.push('</code></pre>');

  return htmlLines.join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 处理行内格式：**粗体**、*斜体*、`code` */
function inlineFormat(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-bg-tertiary text-brand-600 px-1 rounded text-[11px]">$1</code>');
}

// ================================================================
// 主组件
// ================================================================

export function AnalysisPreview({
  result,
  isAnalyzing,
  error,
  onInsert,
  onDismiss,
  onRetry,
  onGenerateCards,
}: AnalysisPreviewProps) {
  const sanitizedHtml = useMemo(() => {
    if (!result?.content) return '';
    return DOMPurify.sanitize(renderMarkdownToHtml(result.content));
  }, [result?.content]);

  // ----------------------------------------------------------------
  // 分析中状态
  // ----------------------------------------------------------------
  if (isAnalyzing) {
    return (
      <div
        className={cn(
          'mx-3 my-2 p-4 rounded-kb-lg',
          'bg-brand-50/5 backdrop-blur-xl border border-brand-200/20 shadow-kb-md',
        )}
      >
        <div className="flex items-center gap-2 mb-3">
          <Loader2 className="w-4 h-4 text-brand-500 animate-spin" strokeWidth={1.5} />
          <span className="text-b2 font-medium text-text-primary">正在分析课堂内容...</span>
        </div>
        {/* 进度条：CSS 动画模拟不确定进度 */}
        <div className="h-1.5 rounded-kb-full bg-bg-tertiary overflow-hidden">
          <div className="h-full w-1/3 bg-brand-500 rounded-kb-full animate-shimmer" />
        </div>
        <p className="text-b3 text-text-tertiary mt-2">
          AI 正在整合关键帧与语音信息，预计需要 1~2 分钟
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // 分析失败状态
  // ----------------------------------------------------------------
  if (error && !result) {
    return (
      <div
        className={cn(
          'mx-3 my-2 p-4 rounded-kb-lg',
          'bg-semantic-error/5 backdrop-blur-xl border border-semantic-error/15 shadow-kb-md',
        )}
      >
        <div className="flex items-start gap-2 mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-semantic-error" strokeWidth={1.5} />
          <div className="flex-1 min-w-0">
            <p className="text-b2 font-medium text-semantic-error">分析失败</p>
            <p className="text-b3 text-text-tertiary mt-1 leading-relaxed">{error}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
                'bg-brand-50 text-brand-600 hover:bg-brand-100 active:scale-95 transition-all duration-kb-fast',
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
              重试
            </button>
          )}
          <button
            onClick={onDismiss}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
              'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary active:scale-95 transition-all duration-kb-fast',
            )}
          >
            关闭
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------
  // 分析完成
  // ----------------------------------------------------------------
  if (!result) return null;

  return (
    <div
      className={cn(
        'mx-3 my-2 rounded-kb-lg overflow-hidden',
        'bg-bg-elevated/80 backdrop-blur-xl border border-border/30 shadow-kb-md',
      )}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/20">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-500" strokeWidth={1.5} />
          <span className="text-b2 font-semibold text-text-primary">AI 笔记预览</span>
          <span className="text-[10px] text-text-tertiary">
            {result.keyframesAnalyzed} 帧 · {result.modelUsed}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-text-tertiary hover:text-text-secondary transition-colors"
          title="关闭预览"
        >
          <X className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>

      {/* Markdown 内容区 */}
      <div
        className={cn(
          'px-4 py-3 max-h-64 overflow-y-auto',
          'text-b3 text-text-secondary leading-relaxed space-y-1',
          '[&_h1]:text-b1 [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mb-1',
          '[&_h2]:text-b2 [&_h2]:font-semibold [&_h2]:text-text-primary [&_h2]:mt-2 [&_h2]:mb-1',
          '[&_h3]:text-b3 [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-1.5',
          '[&_p]:mb-1',
          '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-1',
          '[&_li]:mb-0.5',
          '[&_pre]:bg-bg-tertiary [&_pre]:rounded-kb-sm [&_pre]:p-2 [&_pre]:my-1 [&_pre]:overflow-x-auto',
          '[&_code]:text-[11px]',
          '[&_hr]:border-border/30 [&_hr]:my-2',
          '[&_strong]:text-text-primary [&_strong]:font-semibold',
        )}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />

      {/* 底部操作栏 */}
      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border/20 bg-bg-secondary/50">
        {onGenerateCards && (
          <button
            onClick={() => onGenerateCards(result.content)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium mr-auto',
              'bg-flashcard-50 text-flashcard-600 hover:bg-flashcard-100 active:scale-95 transition-all duration-kb-fast',
            )}
          >
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
            生成闪卡
          </button>
        )}
        <button
          onClick={onDismiss}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
            'bg-bg-secondary text-text-secondary border border-border/40',
            'hover:bg-bg-tertiary active:scale-95 transition-all duration-kb-fast',
          )}
        >
          放弃
        </button>
        <button
          onClick={() => onInsert(result.content)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-kb-md text-b3 font-medium',
            'bg-brand-600 text-white hover:bg-brand-700 active:scale-95 transition-all duration-kb-fast',
          )}
        >
          <FilePlus className="w-3.5 h-3.5" strokeWidth={1.5} />
          插入笔记
        </button>
      </div>
    </div>
  );
}

export default AnalysisPreview;
