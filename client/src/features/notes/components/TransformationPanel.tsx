/**
 * AI 知识蒸馏面板——笔记 → 多种输出格式转换
 * AI knowledge distillation panel — note to multiple output formats
 *
 * @ai-context: 将笔记内容转换为多种学习格式：播客脚本、教学大纲、速查表、
 * 记忆口诀等。每种格式有独立 AI prompt 模板，结果在侧边栏预览。
 * @ai-context: Transforms note content into various learning formats:
 * podcast script, syllabus, cheat sheet, mnemonics, etc.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, FileText, GraduationCap, BookOpen, Zap, PenTool, Sparkles, Copy, Download,
} from 'lucide-react';
import { aiPluginLoader } from '@/lib/ai/AIPluginLoader';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';

type TransformFormat = 'podcast' | 'syllabus' | 'cheatsheet' | 'mnemonic' | 'story' | 'outline';

interface FormatConfig {
  key: TransformFormat;
  label: string;
  description: string;
  icon: React.FC<React.SVGProps<SVGSVGElement> & { strokeWidth?: number | string }>;
  promptTemplate: (title: string, content: string) => string;
}

const FORMATS: FormatConfig[] = [
  {
    key: 'podcast',
    label: '播客脚本',
    description: '双人对话式播客讲解',
    icon: FileText,
    promptTemplate: (title, content) =>
      `将以下笔记内容转换为双人对话式播客脚本（主持人和嘉宾），自然流畅地讲解核心概念。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
  {
    key: 'syllabus',
    label: '教学大纲',
    description: '课程大纲与学习目标',
    icon: GraduationCap,
    promptTemplate: (title, content) =>
      `将以下笔记内容整理为课程教学大纲格式，包含：学习目标、章节结构、关键概念、评估建议。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
  {
    key: 'cheatsheet',
    label: '速查表',
    description: '一页纸关键公式/定义',
    icon: Zap,
    promptTemplate: (title, content) =>
      `将以下笔记内容浓缩为一页速查表，只保留最关键的定义、公式、流程。使用简洁的要点格式。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
  {
    key: 'mnemonic',
    label: '记忆口诀',
    description: '押韵助记符',
    icon: PenTool,
    promptTemplate: (title, content) =>
      `从以下笔记内容中提取关键知识点，编成押韵的记忆口诀/助记符，方便记忆。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
  {
    key: 'story',
    label: '睡前故事',
    description: '故事化知识重述',
    icon: BookOpen,
    promptTemplate: (title, content) =>
      `将以下笔记内容用故事化的方式重新讲述，帮助理解和记忆。使用生动的比喻和叙事。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
  {
    key: 'outline',
    label: '大纲视图',
    description: '结构化大纲',
    icon: FileText,
    promptTemplate: (title, content) =>
      `将以下笔记内容整理为结构化大纲，使用层级编号。\n\n笔记标题：${title}\n笔记内容：${content.slice(0, 2000)}`,
  },
];

interface TransformationPanelProps {
  noteTitle: string;
  noteContent: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TransformationPanel({
  noteTitle,
  noteContent,
  isOpen,
  onClose,
}: TransformationPanelProps) {
  const [activeFormat, setActiveFormat] = useState<TransformFormat | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const { toast } = useToast();

  const handleTransform = useCallback(async (fmt: FormatConfig) => {
    setActiveFormat(fmt.key);
    setLoading(true);
    setResult(null);

    try {
      const text = noteContent.startsWith('{')
        ? (await import('../lib/extractNoteText')).extractNoteText(noteContent)
        : noteContent;
      const prompt = fmt.promptTemplate(noteTitle, text);
      const res = await aiPluginLoader.summarizeNote(prompt, { style: 'bullet' });
      setResult(res?.summary || '生成失败');
      toast({ type: 'success', message: `${fmt.label}生成完成`, silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setResult(`生成失败：${msg}`);
      toast({ type: 'error', message: `生成失败：${msg}` });
    } finally {
      setLoading(false);
    }
  }, [noteTitle, noteContent, toast]);

  const handleCopy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(result).then(
      () => toast({ type: 'success', message: '已复制到剪贴板' }),
      () => toast({ type: 'error', message: '复制失败' }),
    );
  }, [result, toast]);

  const handleExport = useCallback(() => {
    if (!result) return;
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${noteTitle || '笔记'}-${activeFormat}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, noteTitle, activeFormat]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed right-0 top-0 h-full w-96 z-50 backdrop-blur-xl bg-bg-elevated/90 border-l border-border/40 shadow-kb-lg flex flex-col"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {/* 头部 */}
          <div className="flex items-center gap-2 px-4 py-4 border-b border-border/40 flex-shrink-0">
            <div className="w-8 h-8 rounded-kb-full bg-brand-50 flex items-center justify-center">
              <Sparkles className="w-icon-sm h-icon-sm text-brand-500" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-b1 font-semibold text-text-primary">知识蒸馏</h2>
              <p className="text-c1 text-text-tertiary truncate">笔记 → 多种学习格式</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
            >
              <X className="w-icon-sm h-icon-sm" strokeWidth={1.5} />
            </button>
          </div>

          {/* 格式选择 */}
          <div className="p-4 border-b border-border/30">
            <p className="text-b3 font-medium text-text-secondary mb-3">选择输出格式</p>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((fmt) => {
                const Icon = fmt.icon;
                const isActive = activeFormat === fmt.key;
                return (
                  <button
                    key={fmt.key}
                    onClick={() => handleTransform(fmt)}
                    disabled={loading}
                    className={cn(
                      'flex flex-col items-center gap-1 p-3 rounded-kb-md border transition-all text-center',
                      isActive
                        ? 'border-brand-400 bg-brand-500/10 text-brand-700'
                        : 'border-border/40 bg-bg-secondary hover:bg-bg-tertiary text-text-secondary',
                      loading && 'opacity-60 cursor-not-allowed',
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
                    <span className="text-c1 font-medium">{fmt.label}</span>
                    <span className="text-[10px] text-text-tertiary">{fmt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 结果展示 */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-2 text-text-tertiary">
                  <div className="w-4 h-4 border-2 border-brand-400/30 border-t-brand-400 rounded-full animate-spin" />
                  <span className="text-b2">AI 正在生成{FORMATS.find((f) => f.key === activeFormat)?.label}...</span>
                </div>
              </div>
            )}

            {!loading && result && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-b3 font-medium text-text-primary">
                    {FORMATS.find((f) => f.key === activeFormat)?.label} 结果
                  </p>
                  <div className="flex gap-1">
                    <button
                      onClick={handleCopy}
                      className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title="复制"
                    >
                      <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={handleExport}
                      className="p-1.5 rounded-kb-sm text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-colors"
                      title="导出"
                    >
                      <Download className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                <div className="p-3 rounded-kb-md bg-bg-secondary border border-border/30">
                  <pre className="text-b2 text-text-secondary leading-relaxed whitespace-pre-wrap font-sans">
                    {result}
                  </pre>
                </div>
              </div>
            )}

            {!loading && !result && (
              <p className="text-b2 text-text-tertiary text-center py-12">
                选择一个输出格式开始转换
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default TransformationPanel;