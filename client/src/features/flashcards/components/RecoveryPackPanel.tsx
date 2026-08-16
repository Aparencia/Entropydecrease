/**
 * F5 中断恢复包面板
 *
 * @ai-context: 多日未复习后在闪卡页顶部展示"快速回温包"：精选核心卡片预览 +
 * 记忆回响小问（可选 AI 增强，失败静默隐藏）+ CTA 跳转到到期卡最多的牌组。
 * 设计原则：奖赏回来——"欢迎回来"而非"你中断了"；可逆——一键收起不再打扰。
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, X, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { loadRecoveryPack, type RecoveryPack } from '../lib/recoveryPack';
import { fetchRecallQuestion } from '@/features/dashboard/lib/ritualRecallService';
import { extractNoteText } from '@/features/notes/lib/extractNoteText';
import { noteStore } from '@/lib/storage';

/** 收起后本次应用会话内不再展示 */
const DISMISS_KEY = 'kb-recovery-pack-dismissed';

export default function RecoveryPackPanel() {
  const navigate = useNavigate();
  const [pack, setPack] = useState<RecoveryPack | null>(null);
  const [echoQuestion, setEchoQuestion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === '1',
  );

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    loadRecoveryPack()
      .then((p) => { if (!cancelled) setPack(p); })
      .catch((err) => {
        console.debug('[RecoveryPackPanel] load recovery pack failed', err);
      });
    return () => { cancelled = true; };
  }, [dismissed]);

  // 记忆回响：取最近一篇笔记生成回顾小问（AI 不可用时静默跳过）
  useEffect(() => {
    if (!pack || dismissed) return;
    let cancelled = false;
    (async () => {
      try {
        const notes = await noteStore.getAll();
        if (notes.length === 0) return;
        const latest = [...notes].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )[0];
        // content 为 TipTap JSON 字符串，需递归提取 text 节点（HTML 正则无效）
        const plain = extractNoteText(latest.content).slice(0, 1500);
        const q = await fetchRecallQuestion(latest.id, latest.title, plain);
        if (!cancelled && q) setEchoQuestion(q.question);
      } catch {
        // 可选增强：静默降级
      }
    })();
    return () => { cancelled = true; };
  }, [pack, dismissed]);

  if (dismissed || !pack) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-kb-lg p-kb-md rounded-kb-lg bg-brand-600/5 border border-brand-500/20"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-icon-sm h-icon-sm text-brand-500 flex-shrink-0" strokeWidth={1.5} />
          <h3 className="text-b1 font-semibold text-text-primary">
            欢迎回来！为你准备了一个回温包
          </h3>
        </div>
        <button
          onClick={handleDismiss}
          className="text-text-tertiary hover:text-text-primary transition-colors"
          aria-label="收起恢复包"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="text-b2 text-text-secondary mt-1">
        离开 {pack.gapDays} 天没关系，花 10 分钟轻松回温，记忆会很快回来。
        共 {pack.totalDue} 张卡片到了复习时间，这里精选了 {pack.cards.length} 张核心卡。
      </p>

      {/* 精选卡片预览（仅正面，避免直接暴露答案） */}
      <ul className="mt-kb-sm space-y-1">
        {pack.cards.slice(0, 3).map((c) => (
          <li key={c.id} className="text-b3 text-text-tertiary truncate">
            · {c.front.replace(/<[^>]+>/g, '').slice(0, 60)}
          </li>
        ))}
        {pack.cards.length > 3 && (
          <li className="text-b3 text-text-tertiary">… 还有 {pack.cards.length - 3} 张</li>
        )}
      </ul>

      {/* 记忆回响小问（AI 可选增强，无则隐藏） */}
      {echoQuestion && (
        <p className="mt-kb-sm text-b3 text-text-secondary italic">
          还记得吗：{echoQuestion}
        </p>
      )}

      {pack.topDeckId && (
        <Button
          variant="secondary"
          size="sm"
          icon={<PlayCircle className="w-4 h-4" />}
          className="mt-kb-sm"
          onClick={() => navigate(`/flashcards/${pack.topDeckId}`)}
        >
          开始回温
        </Button>
      )}
    </motion.div>
  );
}
