/**
 * 微学习卡片页面 — /microcards
 * Micro learning cards page
 *
 * @ai-context: 装配层：主题输入 → AI 微卡生成 → 滑动处理（左已会/右不会/
 * 上深入）→ 队列回顾。网关不可达时降级为本地示例卡并显示"离线模式"横幅，
 * 不弹错误。生成/滑动均为本地状态，离线流程完整。
 * @ai-context: Assembly page: topic → AI micro-cards → swipe (left know /
 * right don't know / up deep) → queue review. Falls back to local sample
 * cards with an offline banner when the gateway is unreachable.
 */
import { useState } from 'react';
import { CreditCard, Loader2, WifiOff } from 'lucide-react';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { Card, CardContent, Button, Input } from '@/components/ui';
import { useAIMicroCards } from '../hooks/useAIMicroCards';
import MicroCardSwipe from '../components/MicroCardSwipe';
import MicroCardQueue from '../components/MicroCardQueue';

export default function MicroCardsPage() {
  const { cards, loading, isFallback, topic, setTopic, generate, swipe } = useAIMicroCards();
  const [draft, setDraft] = useState('');

  const pendingCount = cards.filter((c) => c.status === 'pending').length;
  const doneCount = cards.length - pendingCount;

  const handleGenerate = () => {
    const trimmed = draft.trim();
    if (!trimmed || loading) return;
    setTopic(trimmed);
    void generate(trimmed);
  };

  return (
    <div className="mx-auto max-w-3xl px-kb-md py-kb-lg flex flex-col gap-kb-md">
      <ModuleRitualHeader
        title="微学习卡片"
        note="把大知识切成小卡片 —— 左滑已会，右滑不会，上滑深入"
        sealChar="卡"
        sealColor="#43C58B"
        actions={<CreditCard className="w-5 h-5 text-flashcard" strokeWidth={1.5} />}
      />

      {/* 主题输入 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <div className="flex gap-kb-sm">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="想生成哪个主题的微卡？如：递归、光合作用…"
              maxLength={60}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
              aria-label="微卡主题"
            />
            <Button
              onClick={handleGenerate}
              disabled={!draft.trim() || loading}
              loading={loading}
              className="flex-shrink-0"
            >
              生成
            </Button>
          </div>

          {isFallback && (
            <div className="flex items-center gap-2 rounded-kb-md border border-border/40 bg-bg-elevated/40 px-kb-sm py-2 text-c1 text-text-tertiary">
              <WifiOff className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
              离线模式：AI 服务暂不可达，已使用本地示例卡。联网后可重新生成。
            </div>
          )}

          {topic && !loading && (
            <p className="text-c2 text-text-tertiary/70">
              主题「{topic}」· 剩余 {pendingCount} 张待处理 · 已完成 {doneCount} 张
            </p>
          )}
        </CardContent>
      </Card>

      {/* 滑动卡片堆栈 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary">滑动处理</h2>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-text-tertiary">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              AI 正在切分知识…（首次约需数秒）
            </div>
          ) : (
            <MicroCardSwipe cards={cards} onSwipe={swipe} />
          )}
          {cards.length > 0 && !loading && (
            <p className="text-c2 text-text-tertiary/70 text-center">
              左滑 <span className="text-emerald-500">已会</span> · 右滑{' '}
              <span className="text-red-500">不会</span> · 上滑{' '}
              <span className="text-amber-500">深入</span> · 点击卡片翻面
            </p>
          )}
        </CardContent>
      </Card>

      {/* 微卡队列 */}
      <Card>
        <CardContent className="flex flex-col gap-kb-sm">
          <h2 className="text-b1 font-medium text-text-primary">微卡队列</h2>
          <MicroCardQueue cards={cards} />
        </CardContent>
      </Card>
    </div>
  );
}
