/**
 * 苏格拉底式学习会话页面 — FEAT-022
 * 三段式流程：Brainstorm → Socratic Dialogue → Deepening
 *
 * UI 渲染层，业务逻辑见 useSocraticFlow hook
 *
 * @ai-context: feynman 功能模块页面：SocraticSessionPage。
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Sparkles, Brain, MessageCircle, Layers, CheckCircle2 } from 'lucide-react';
import { AIThinkingIndicator } from '@/components/ui/AIThinkingIndicator';
import ModuleRitualHeader from '@/components/ui/ModuleRitualHeader';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import BrainstormPanel from '../components/BrainstormPanel';
import SocraticDialogue from '../components/SocraticDialogue';
import DeepeningZone from '../components/DeepeningZone';
import { useSocraticFlow, type Phase } from '../hooks/useSocraticFlow';

const PHASE_STEPS: { key: Phase; label: string; icon: React.ReactNode }[] = [
  { key: 'brainstorm', label: '发散', icon: <Brain className="w-icon-sm h-icon-sm" strokeWidth={1.5} /> },
  { key: 'dialogue', label: '收敛', icon: <MessageCircle className="w-icon-sm h-icon-sm" strokeWidth={1.5} /> },
  { key: 'deepening', label: '深化', icon: <Layers className="w-icon-sm h-icon-sm" strokeWidth={1.5} /> },
];

export default function SocraticSessionPage() {
  const navigate = useNavigate();
  const {
    phase, topic, setTopic, ideas, selected, rounds, currentRound,
    dialogueCompleted, savingNote, exiting,
    deepeningAngles, deepeningFallbackMsg, deepeningLoading,
    brainstormLoading, brainstormError, questionLoading,
    handleStartBrainstorm, handleSelectIdea, handleToDialogue,
    handleSubmitAnswer, handleToDeepening, handleDeepeningSubmit, handleGoBack,
    maxRounds,
  } = useSocraticFlow();

  const phaseIndex = PHASE_STEPS.findIndex(s => s.key === phase);

  return (
    <motion.div
      className="flex flex-col h-full relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* 环境光 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, var(--kb-brand-400) 0%, transparent 70%)' }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* 顶栏 */}
      <div className="flex items-center gap-kb-sm px-kb-md py-3 border-b border-border/50 flex-shrink-0 relative z-10">
        <button
          onClick={() => navigate('/feynman')}
          className="p-1.5 rounded-kb-full text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary transition-all duration-kb-fast"
        >
          <ArrowLeft className="w-icon-md h-icon-md" strokeWidth={1.5} />
        </button>
        <ModuleRitualHeader sealChar="浮" sealColor="#C4956A" compact />
        <h1 className="text-b1 font-semibold text-text-primary flex-1 truncate">
          苏格拉底式学习
        </h1>

        {/* 阶段指示器 */}
        <div className="flex items-center gap-1">
          {PHASE_STEPS.map((step, i) => (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-kb-full text-c1 font-medium transition-all duration-kb-fast',
                i === phaseIndex
                  ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                  : i < phaseIndex
                    ? 'text-emerald-500'
                    : 'text-text-tertiary',
              )}
            >
              {i < phaseIndex ? (
                <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2} />
              ) : step.icon}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 overflow-y-auto px-kb-md py-kb-md relative z-10">
        <div className="max-w-4xl mx-auto">
          <AnimatePresence mode="wait">
            {/* Phase 1: 头脑风暴 */}
            {phase === 'brainstorm' && (
              <motion.div
                key="brainstorm"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: exiting ? 0 : 1, x: exiting ? -20 : 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col gap-kb-lg"
              >
                {/* 主题输入 */}
                <div>
                  <h2 className="text-h2 font-semibold text-text-primary mb-1">
                    输入你要探索的概念
                  </h2>
                  <p className="text-b2 text-text-tertiary mb-3">
                    AI 会从多个角度为你发散思路，然后逐步深入追问
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={topic}
                      onChange={e => setTopic(e.target.value)}
                      placeholder="例如：量子纠缠、机会成本、光合作用..."
                      className={cn(
                        'flex-1 px-4 py-2.5 rounded-kb-md',
                        'bg-bg-elevated border border-border/50',
                        'text-b1 text-text-primary placeholder:text-text-tertiary/60',
                        'outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all duration-kb-fast',
                      )}
                      onKeyDown={e => e.key === 'Enter' && handleStartBrainstorm()}
                    />
                    <button
                      onClick={handleStartBrainstorm}
                      disabled={!topic.trim() || brainstormLoading}
                      className={cn(
                        'px-4 py-2.5 rounded-kb-md text-b2 font-medium flex items-center gap-2 transition-all duration-kb-fast',
                        topic.trim() && !brainstormLoading
                          ? 'bg-brand-500 text-white hover:bg-brand-600 active:scale-[0.97] shadow-[var(--kb-shadow-brand)]'
                          : 'bg-bg-tertiary text-text-tertiary cursor-not-allowed',
                      )}
                    >
                      {brainstormLoading ? (
                        <AIThinkingIndicator size={4} gap={3} />
                      ) : (
                        <Sparkles className="w-4 h-4" strokeWidth={1.5} />
                      )}
                      开始发散
                    </button>
                  </div>
                </div>

                {/* 头脑风暴卡片 */}
                {ideas.length > 0 && (
                  <>
                    <BrainstormPanel ideas={ideas} onSelect={handleSelectIdea} selected={selected} />
                    {brainstormError && (
                      <p className="text-c1 text-amber-500">{brainstormError}</p>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* Phase 2: 追问对话 */}
            {phase === 'dialogue' && (
              <motion.div
                key="dialogue"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: exiting ? 0 : 1, x: exiting ? -20 : 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-h2 font-semibold text-text-primary mb-1">
                  深度追问：「{topic}」
                </h2>
                <p className="text-b2 text-text-tertiary mb-kb-md">
                  AI 会根据你的回答持续追问，帮你发现理解中的盲区
                </p>
                <SocraticDialogue
                  rounds={rounds}
                  currentRound={currentRound}
                  maxRounds={maxRounds}
                  onSubmitAnswer={handleSubmitAnswer}
                  loading={questionLoading}
                  completed={dialogueCompleted}
                />
              </motion.div>
            )}

            {/* Phase 3: 深化区 */}
            {phase === 'deepening' && (
              <motion.div
                key="deepening"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: exiting ? 0 : 1, x: exiting ? -20 : 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-h2 font-semibold text-text-primary mb-1">
                  从 5 个角度深化「{topic}」
                </h2>
                <p className="text-b2 text-text-tertiary mb-kb-md">
                  选择你感兴趣的角度，写下更深层的思考
                </p>

                {/* 降级提示 */}
                {deepeningFallbackMsg && (
                  <div className="mb-3 px-3 py-2 rounded-kb-md bg-amber-500/10 border border-amber-500/20 text-c1 text-amber-600 dark:text-amber-400">
                    {deepeningFallbackMsg}
                  </div>
                )}

                {/* 加载中骨架屏 */}
                {deepeningLoading && (
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 rounded-kb-lg bg-bg-elevated/80 animate-pulse" />
                    ))}
                  </div>
                )}

                {/* 深化角度卡片 */}
                {!deepeningLoading && deepeningAngles.length > 0 && (
                  <DeepeningZone
                    customAngles={deepeningAngles}
                    onSubmit={handleDeepeningSubmit}
                    loading={savingNote}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 底部导航 */}
      <div className={cn(
        'flex items-center justify-between px-kb-md py-3',
        'border-t border-border/50 bg-bg-elevated/90 backdrop-blur-sm flex-shrink-0 relative z-10',
      )}>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowLeft className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
          onClick={handleGoBack}
          disabled={exiting}
        >
          {phase === 'brainstorm' ? '返回' : '上一步'}
        </Button>

        {phase === 'brainstorm' && (
          <Button
            size="sm"
            icon={<ArrowRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={handleToDialogue}
            disabled={selected.length === 0 || exiting}
          >
            继续追问 ({selected.length} 个方向)
          </Button>
        )}

        {phase === 'dialogue' && dialogueCompleted && (
          <Button
            size="sm"
            icon={deepeningLoading ? <AIThinkingIndicator size={4} gap={3} /> : <ArrowRight className="w-icon-sm h-icon-sm" strokeWidth={1.5} />}
            onClick={handleToDeepening}
            disabled={exiting || deepeningLoading}
          >
            {deepeningLoading ? '正在生成深化角度...' : '进入深化'}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
