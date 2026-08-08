/**
 * SettlingPage — 知识入籍（阶段 A 入口问题）
 * Knowledge settling · the entry gate
 *
 * @ai-context: 四步闭环：来源（粘贴文本/PDF 拖拽或选择/URL）→ 解析
 * （import:parse-pdf / import:fetch-url）→ AI 概念化预览（可编辑概念卡，
 * ai_import_concept；离线/失败静默降级为手动建卡）→ 安放入世界
 * （useSettleConcepts：批量笔记+概念卡 → imports 溯源 → settling 签名时刻）。
 * 零负向语言：解析失败文案均为「可手动粘贴」的可执行引导。
 *
 * @ai-context: Four-step settling flow. AI failure degrades to manual cards.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { chunkText } from '../lib/textChunker';
import { sanitizeExtractedText } from '../lib/contentSanitizer';
import { useSettleConcepts } from '../hooks/useSettleConcepts';
import type { ConceptCandidate, ImportSource } from '../types';

type Step = 'source' | 'parsing' | 'preview' | 'settling' | 'done';
type SourceTab = 'text' | 'pdf' | 'url';

/** 已解析输入（三来源统一载体） / Parsed input in unified shape */
interface ParsedInput {
  title: string;
  rawName: string;
  source: ImportSource;
  text: string;
  note?: string;
}

/** IPC 解析结果（Result 模式） / Parse IPC result */
interface ParseResult { success: boolean; content?: ParsedInput; error?: string }
/** AI 概念化结果 / AI conceptualization result */
interface AiConceptsResult { concepts?: ConceptCandidate[]; error?: string }

/** 空概念槽位（AI 失败后提供手动添加入口） / Empty concept slot */
const emptyConcept = (): ConceptCandidate => ({ name: '', summary: '', cardFront: '', cardBack: '' });

const SOURCE_TABS: Array<{ id: SourceTab; label: string }> = [
  { id: 'text', label: '粘贴文本' }, { id: 'pdf', label: 'PDF 文件' }, { id: 'url', label: '网页链接' },
];

export default function SettlingPage() {
  const navigate = useNavigate();
  const { isSettling, settleConcepts } = useSettleConcepts();
  const [step, setStep] = useState<Step>('source');
  const [tab, setTab] = useState<SourceTab>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedInput | null>(null);
  const [concepts, setConcepts] = useState<ConceptCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isConceptualizing, setIsConceptualizing] = useState(false);
  /** 实际安放的概念数（过滤空名称后，done 页展示用） / Actually settled count */
  const [settledCount, setSettledCount] = useState(0);

  /** 进入预览：统一过内容清理（断行合并/页眉丢弃），提升 AI 概念化输入质量 */
  const enterPreview = (input: ParsedInput) => {
    setParsed({ ...input, text: sanitizeExtractedText(input.text) });
    setError(null); setStep('preview');
  };
  const parsePdf = async (payload?: { filePath: string }) => {
    setStep('parsing'); setError(null);
    const res = await window.electronAPI?.invoke('import:parse-pdf', payload) as ParseResult;
    if (res?.success && res.content) enterPreview(res.content);
    else { setError(res?.error ?? 'PDF 解析失败，可手动粘贴内容'); setStep('source'); }
  };

  const handlePickPdf = async () => { await parsePdf(); };
  const handleDropPdf = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const filePath = window.electronAPI?.getPathForFile(file);
    if (!filePath) { setError('无法读取拖拽文件，可点击按钮选择'); return; }
    await parsePdf({ filePath });
  };

  const handleFetchUrl = async () => {
    if (!url.trim()) { setError('请先输入网页链接'); return; }
    setStep('parsing'); setError(null);
    const res = await window.electronAPI?.invoke('import:fetch-url', { url: url.trim() }) as ParseResult;
    if (res?.success && res.content) enterPreview(res.content);
    else { setError(res?.error ?? '网页抓取失败，可手动粘贴内容'); setStep('source'); }
  };

  const handleTextContinue = () => {
    if (!text.trim()) { setError('请先粘贴要入籍的内容'); return; }
    enterPreview({ title: title.trim() || '未命名入籍', rawName: title.trim() || '未命名入籍', source: 'text', text });
  };

  const handleConceptualize = async () => {
    if (!parsed) return;
    setIsConceptualizing(true); setError(null);
    try {
      const chunks = chunkText(parsed.text);
      if (chunks.length === 0) { setError('没有可概念化的文本，可手动添加概念'); return; }
      const res = await window.electronAPI?.invoke('ai_import_concept', { title: parsed.title, textChunks: chunks }) as AiConceptsResult;
      if (res?.concepts && res.concepts.length > 0) setConcepts(res.concepts.map((c) => ({ ...c, cardFront: c.cardFront || c.name })));
      else {
        // 降级为手动建卡：注入一个空概念槽位，保证「＋ 添加概念」入口可见
        setConcepts([emptyConcept()]);
        setError('AI 未提炼出概念，可手动编辑或添加后安放');
      }
    } catch {
      setConcepts([emptyConcept()]);
      setError('概念化服务暂不可用，可手动编辑后安放');
    }
    finally { setIsConceptualizing(false); }
  };

  const handleSettle = async () => {
    if (!parsed || concepts.length === 0) return;
    // 安放前过滤空名称概念（防止空标题笔记/空正面卡片落库）
    const valid = concepts.filter((c) => c.name.trim());
    if (valid.length === 0) { setError('请至少填写一个概念名称'); return; }
    setStep('settling'); setError(null);
    const res = await settleConcepts({ title: parsed.title, source: parsed.source, rawName: parsed.rawName, concepts: valid });
    if (res.ok) {
      setSettledCount(valid.length);
      setStep('done');
    } else {
      // 部分失败：从概念列表移除已成功安放项，重试不会重复创建笔记/卡片
      // （settleConcepts 按序安放，noteIds 即前 N 个概念的成功结果）
      const remaining = valid.slice(res.noteIds.length);
      setConcepts(remaining.length > 0 ? remaining : [emptyConcept()]);
      setError(res.error ?? '安放失败，可稍后重试');
      setStep('preview');
    }
  };

  const resetAll = () => { setStep('source'); setParsed(null); setConcepts([]); setText(''); setUrl(''); setTitle(''); setError(null); setSettledCount(0); };
  const updateConcept = (i: number, patch: Partial<ConceptCandidate>) =>
    setConcepts((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const cardInput = 'w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyber/60';
  const primaryBtn = 'rounded-md bg-cyber/20 px-5 py-2 text-sm text-cyber hover:bg-cyber/30';
  const ghostBtn = 'rounded-md px-4 py-2 text-sm text-slate-400 hover:text-slate-200';

  /** 概念卡编辑（AI 候选可改可删可增） / Editable concept cards */
  const renderConceptEditor = () => (
    <div className="flex flex-col gap-4">
      {concepts.map((c, i) => (
        <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">概念 {i + 1}</span>
            <button onClick={() => setConcepts((cs) => cs.filter((_, j) => j !== i))}
              className="text-xs text-slate-500 hover:text-rose-300">移除</button>
          </div>
          <div className="flex flex-col gap-2">
            <input className={cardInput} value={c.name} placeholder="概念名称"
              onChange={(e) => updateConcept(i, { name: e.target.value })} />
            <textarea className={`${cardInput} resize-none`} rows={2} value={c.summary} placeholder="一句话摘要"
              onChange={(e) => updateConcept(i, { summary: e.target.value })} />
            <input className={cardInput} value={c.cardFront} placeholder="复习提问（正面）"
              onChange={(e) => updateConcept(i, { cardFront: e.target.value })} />
            <textarea className={`${cardInput} resize-none`} rows={2} value={c.cardBack} placeholder="答案要点（背面）"
              onChange={(e) => updateConcept(i, { cardBack: e.target.value })} />
          </div>
        </div>
      ))}
      <button onClick={() => setConcepts((cs) => [...cs, emptyConcept()])}
        className="rounded-md border border-dashed border-white/15 py-2 text-sm text-slate-400 hover:border-cyber/50 hover:text-cyber">
        ＋ 添加概念
      </button>
    </div>
  );

  const renderSource = () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {SOURCE_TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setError(null); }}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${tab === t.id ? 'bg-cyber/20 text-cyber' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'text' && (
        <div className="flex flex-col gap-3">
          <input className={cardInput} value={title} placeholder="标题（可选，用于溯源）"
            onChange={(e) => setTitle(e.target.value)} />
          <textarea className={`${cardInput} resize-none min-h-40`} value={text} placeholder="粘贴要入籍的知识内容…"
            onChange={(e) => setText(e.target.value)} />
          <button onClick={handleTextContinue} className={`${primaryBtn} self-end`}>继续</button>
        </div>
      )}
      {tab === 'pdf' && (
        <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)} onDrop={handleDropPdf}
          className={`flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center transition-colors ${isDragging ? 'border-cyber/70 bg-cyber/10' : 'border-white/15 bg-white/[0.02]'}`}>
          <p className="text-sm text-slate-300">拖拽 PDF 到此处，或</p>
          <button onClick={handlePickPdf} className={primaryBtn}>选择 PDF 文件</button>
          <p className="text-xs text-slate-500">仅提取文本层；图片型扫描件可手动粘贴内容</p>
        </div>
      )}
      {tab === 'url' && (
        <div className="flex flex-col gap-3">
          <input className={cardInput} value={url} placeholder="https://…（仅 HTTP(S) 链接）"
            onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleFetchUrl(); }} />
          <button onClick={handleFetchUrl} className={`${primaryBtn} self-end`}>抓取网页</button>
        </div>
      )}
    </div>
  );

  const renderPreview = () => (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-200">{parsed?.title}</div>
          <div className="mt-1 text-xs text-slate-500">
            {parsed?.note ?? `已解析文本 ${parsed?.text.length ?? 0} 字，可以开始提炼概念`}
          </div>
        </div>
        <button onClick={() => { setStep('source'); setParsed(null); setConcepts([]); }}
          className="text-xs text-slate-500 hover:text-slate-300">更换来源</button>
      </div>
      {!isConceptualizing && concepts.length === 0 && (
        <button onClick={handleConceptualize} className={primaryBtn}>✨ AI 提炼概念</button>
      )}
      {isConceptualizing && <div className="animate-pulse text-sm text-slate-400">正在提炼概念…</div>}
      {concepts.length > 0 && renderConceptEditor()}
      <div className="mt-2 flex justify-end gap-3">
        <button onClick={() => setStep('source')} className={ghostBtn}>返回</button>
        <button onClick={handleSettle} disabled={concepts.length === 0 || isSettling}
          className="rounded-md bg-cyber/25 px-6 py-2 text-sm text-cyber hover:bg-cyber/40 disabled:cursor-not-allowed disabled:opacity-40">
          {isSettling ? '正在安放…' : '安放入世界'}
        </button>
      </div>
    </div>
  );

  const renderDone = () => (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="text-4xl">🌌</div>
      <div className="text-lg font-medium text-slate-200">已安放 {settledCount} 个概念</div>
      <p className="text-sm text-slate-400">它们已在你的世界里亮起，呈雾中轮廓 · 可以从容地慢慢复习</p>
      <div className="mt-4 flex gap-3">
        <button onClick={() => navigate('/')} className={primaryBtn}>回到世界</button>
        <button onClick={resetAll} className={ghostBtn}>继续入籍</button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6">
        <ModuleRitualHeader
          title="知识入籍"
          note="让外部知识在你的世界里安家 · 提炼概念 → 安放 → 从容复习"
          sealChar="籍"
          sealColor="#F59E0B"
        />
      </div>
      {error && (
        <div className="mb-4 rounded-md border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">{error}</div>
      )}
      {step === 'source' && renderSource()}
      {step === 'parsing' && <div className="animate-pulse py-16 text-center text-sm text-slate-400">正在解析…</div>}
      {step === 'preview' && renderPreview()}
      {step === 'settling' && <div className="animate-pulse py-16 text-center text-sm text-slate-400">正在安放入世界…</div>}
      {step === 'done' && renderDone()}
    </div>
  );
}
