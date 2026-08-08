/**
 * 渐进式卡壳救援面板
 * Progressive rescue panel
 *
 * @ai-context: 封装 RescuePanel 添加三级渐进式提示（关联概念→类比→部分答案），
 * 每级 30 秒无操作自动升级。记录卡壳统计到 stuckStatsStore 供健康度指示器展示。
 * @ai-context: Wraps RescuePanel with 3-level progressive hints
 * (related concepts → analogy → partial answer), auto-escalating every 30s.
 * Records stuck stats for health indicator display.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { RescuePanel } from '@/components/RescuePanel';
import { useStuckStatsStore } from '../lib/stuckStatsStore';

interface ProgressiveRescuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: {
    topic: string;
    relatedContent?: string;
    mode?: string;
  };
  onSuggestion?: (action: string) => void;
}

type ProgressiveLevel = 'association' | 'analogy' | 'answer';

const LEVEL_LABELS: Record<ProgressiveLevel, string> = {
  association: '关联概念提示',
  analogy: '类比解释',
  answer: '部分答案揭示',
};

const LEVEL_DESCRIPTIONS: Record<ProgressiveLevel, string> = {
  association: '回顾相关概念，激活已有知识连接',
  analogy: '用熟悉的事物类比，建立新的理解路径',
  answer: '提供部分答案线索，引导自主发现',
};

const AUTO_ESCALATE_MS = 30_000; // 30 秒无操作自动升级

export function ProgressiveRescuePanel({
  isOpen,
  onClose,
  context,
  onSuggestion,
}: ProgressiveRescuePanelProps) {
  const [level, setLevel] = useState<ProgressiveLevel>('association');
  const escalateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStuck = useStuckStatsStore((s) => s.recordStuck);

  // 记录卡壳事件
  const stuckStartRef = useRef<number | null>(null);
  useEffect(() => {
    if (isOpen) {
      stuckStartRef.current = Date.now();
      // 记录卡壳
      recordStuck(context.topic, context.topic, 0);
    }
    return () => {
      if (stuckStartRef.current && isOpen) {
        const duration = Math.floor((Date.now() - stuckStartRef.current) / 1000);
        recordStuck(context.topic, context.topic, duration);
      }
      stuckStartRef.current = null;
    };
  }, [isOpen, context.topic, recordStuck]);

  // 自动升级：每级 30 秒无操作自动升级到下一级
  const resetEscalateTimer = useCallback(() => {
    if (escalateTimerRef.current) clearTimeout(escalateTimerRef.current);
    escalateTimerRef.current = setTimeout(() => {
      setLevel((prev) => {
        if (prev === 'association') return 'analogy';
        if (prev === 'analogy') return 'answer';
        return prev;
      });
    }, AUTO_ESCALATE_MS);
  }, []);

  useEffect(() => {
    if (isOpen) resetEscalateTimer();
    return () => {
      if (escalateTimerRef.current) clearTimeout(escalateTimerRef.current);
    };
  }, [isOpen, level, resetEscalateTimer]);

  // 用户手动切换级别时重置计时器
  const handleLevelChange = (newLevel: ProgressiveLevel) => {
    setLevel(newLevel);
    resetEscalateTimer();
  };

  const levelIndicator = (
    <div className="px-4 py-2 border-b border-border/40 bg-bg-elevated/50">
      <div className="flex items-center gap-2 mb-1">
        {(Object.entries(LEVEL_LABELS) as [ProgressiveLevel, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleLevelChange(key)}
            className={`px-2.5 py-1 rounded-kb-full text-c1 font-medium transition-colors ${
              level === key
                ? 'bg-brand-50 text-brand-700'
                : 'text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-c1 text-text-tertiary/60 px-1">
        {LEVEL_DESCRIPTIONS[level]}
        <span className="ml-2 text-c1 text-text-tertiary/40">
          (30 秒后自动升级)
        </span>
      </p>
    </div>
  );

  return (
    <div className="relative">
      {/* 将级别指示器作为 RescuePanel 的扩展 */}
      {isOpen && levelIndicator}
      <RescuePanel
        isOpen={isOpen}
        onClose={onClose}
        context={context}
        onSuggestion={onSuggestion}
      />
    </div>
  );
}

export default ProgressiveRescuePanel;