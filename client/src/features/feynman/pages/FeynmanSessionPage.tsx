/**
 * 费曼学习会话页（组合入口）
 *
 * @ai-context: 业务逻辑拆分为 useFeynmanSession（笔记/步骤/薄弱点/闪卡转化）
 * 与 useFeynmanAI（AI 评估/反问/救援/右键菜单）；UI 拆分为 FeynmanChrome/
 * FeynmanSteps/StepSummary/WeakPointPanel/ConvertModals/ExplanationHighlights。
 * 本文件仅负责布局组合与步骤切换动画，无业务逻辑。
 */
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ContextMenu } from '@/components/ui';
import { StepIndicator } from '../components/StepIndicator';
import { RescuePanel } from '@/components/RescuePanel';
import { AIEvaluationResult } from '../components/AIEvaluationResult';
import { AIQuestionPanel } from '../components/AIQuestionPanel';
import { WeakPointPanel } from '../components/WeakPointPanel';
import { ConvertDeckModal, ConvertConfirmModal } from '../components/ConvertModals';
import { StepConcept, StepExplain, StepWeakPoints } from '../components/FeynmanSteps';
import { StepSummary } from '../components/StepSummary';
import { AmbientLight, FeynmanTopBar, FeynmanLoadingSkeleton, FeynmanNotFound, FeynmanBottomNav } from '../components/FeynmanChrome';
import { ExplanationHighlights } from '../components/ExplanationHighlights';
import { createStepVariants } from '../components/feynmanAnimations';
import { ConceptInternalized } from '../components/ConceptInternalized';
import { ConceptPrecheckCard } from '../components/ConceptPrecheckCard';
import { useFeynmanSession } from '../hooks/useFeynmanSession';
import { useFeynmanAI } from '../hooks/useFeynmanAI';
import { useFeynmanStore } from '../store/useFeynmanStore';

export default function FeynmanSessionPage() {
  const navigate = useNavigate();
  const prefersReduced = useReducedMotion();
  const [searchParams] = useSearchParams();
  const createNote = useFeynmanStore((s) => s.createNote);

  const {
    noteId, isLoading, note, noteWeakPoints,
    currentStep, completedSteps, stepDirection, isCompleted,
    localExplanation, setLocalExplanation,
    localSummary, setLocalSummary,
    weakPanelOpen, setWeakPanelOpen,
    selectionPopup, setSelectionPopup,
    rating, hoverRating, setHoverRating,
    showDeckModal, setShowDeckModal, selectedDeckId, setSelectedDeckId,
    isConverting, showConvertConfirm, setShowConvertConfirm,
    flashcardDecks, explanationRef,
    handleStep2Blur, handleSummaryBlur, handleNext, handlePrev, handleComplete,
    handleRating, handleConvertAndComplete, handleOpenDeckModal,
    handleConvertToFlashcards, handleTextSelect, handleAddWeakPoint,
    removeWeakPoint, toggleWeakPointMastered,
  } = useFeynmanSession();

  const {
    rescueOpen, setRescueOpen, stuckTimer,
    showAIEval, setShowAIEval,
    aiEvalLoading, aiEvalData, aiEvalError, aiEvalNeedsConfig, handleAIEval,
    showQuestionPanel, setShowQuestionPanel,
    localAnswers, setLocalAnswers,
    aiQuestionLoading, aiQuestionData, aiQuestionError, aiQuestionNeedsConfig,
    handleGenerateQuestions,
    aiAnswerEvalLoading, aiAnswerEvalData, aiAnswerEvalError, aiAnswerEvalNeedsConfig,
    handleSubmitAnswers,
    resetAIResults,
    menuOpen, menuPosition, menuContext, closeMenu,
    aiMenuGroups, handleMenuSelect, handleNoteContextMenu,
  } = useFeynmanAI(note);

  const stepVariants = createStepVariants(!!prefersReduced);

  // N4 笔记→费曼引导：/feynman/new?concept=xxx 进入时自动创建费曼笔记并跳转。
  // createdRef 防重复创建（React StrictMode 双调用/重渲染竞态）
  const createdRef = useRef(false);
  useEffect(() => {
    const concept = searchParams.get('concept');
    if (noteId || !concept || createdRef.current) return;
    createdRef.current = true;
    createNote(concept)
      .then((id) => { if (id) navigate(`/feynman/${id}`, { replace: true }); })
      .catch(() => { /* 创建失败停留原页，不打扰 */ });
  }, [noteId, searchParams, createNote, navigate]);

  // v0.29: 费曼完成庆祝状态
  const [showCelebration, setShowCelebration] = useState(false);
  const prevCompletedRef = useRef(isCompleted);
  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      setShowCelebration(true);
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted]);

  const masteredCount = noteWeakPoints.filter((wp) => wp.mastered).length;
  // v0.36 修复：原实现与 masteredCount 同谓词恒等（复制粘贴 bug），
  // 已转换薄弱点按 converted 字段统计（见 types/feynman.ts FeynmanWeakPoint.converted）
  const convertedCount = noteWeakPoints.filter((wp) => wp.converted).length;

  if (isLoading) {
    return <FeynmanLoadingSkeleton />;
  }

  if (!note && noteId) {
    return <FeynmanNotFound onBack={() => navigate('/feynman')} />;
  }

  return (
    <motion.div
      className="flex flex-col h-full relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <AmbientLight />
      <FeynmanTopBar
        concept={note?.concept}
        hasExplanation={!!note?.explanation}
        isCompleted={isCompleted}
        aiEvalLoading={aiEvalLoading}
        onBack={() => navigate('/feynman')}
        onRescue={() => { setRescueOpen(true); stuckTimer.start(); }}
        onAIEval={handleAIEval}
      />

      {/* StepIndicator */}
      <motion.div
        className="px-kb-md py-kb-md flex-shrink-0 relative z-10"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <StepIndicator currentStep={currentStep} completedSteps={completedSteps} />
      </motion.div>

      {/* 主体区域 */}
      <div className="flex-1 overflow-hidden flex relative z-10">
        {/* 专注遮罩 - 聚焦中心内容区 */}
        <motion.div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            background: 'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, transparent 50%, rgba(0,0,0,0.15) 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: prefersReduced ? 0 : 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        />
        {/* 主内容 */}
        <div className="flex-1 overflow-y-auto px-kb-md pb-kb-md">
          <AnimatePresence mode="wait" custom={stepDirection}>
          <motion.div
            key={currentStep}
            custom={stepDirection}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
            className="max-w-2xl mx-auto"
          >
            {/* 步骤 1: 选择概念（E1 概念预检卡可选先行） */}
            {currentStep === 1 && (
              <>
                {noteId && <ConceptPrecheckCard concept={note?.concept ?? ''} noteId={noteId} />}
                <StepConcept
                  concept={note?.concept}
                  explanation={localExplanation}
                  onExplanationChange={setLocalExplanation}
                  noteId={noteId}
                />
              </>
            )}

            {/* 步骤 2: 讲解概念 */}
            {currentStep === 2 && (
              <StepExplain
                concept={note?.concept}
                explanation={localExplanation}
                onExplanationChange={setLocalExplanation}
                onBlur={handleStep2Blur}
                onContextMenu={(e) => handleNoteContextMenu(e, localExplanation)}
              />
            )}

            {/* 步骤 3: 标注薄弱 */}
            {currentStep === 3 && (
              <StepWeakPoints
                weakPointsCount={noteWeakPoints.length}
                weakPanelOpen={weakPanelOpen}
                onToggleWeakPanel={() => setWeakPanelOpen(!weakPanelOpen)}
                explanationRef={explanationRef}
                onTextSelect={handleTextSelect}
                onContextMenu={(e) => handleNoteContextMenu(e, note?.explanation ?? '')}
                renderExplanation={() => (
                  <ExplanationHighlights text={note?.explanation ?? ''} weakPoints={noteWeakPoints} />
                )}
                selectionPopup={selectionPopup}
                onAddWeakPoint={handleAddWeakPoint}
                onClearSelection={() => setSelectionPopup(null)}
              />
            )}

            {/* 步骤 4: 简化重述 */}
            {currentStep === 4 && (
              <>
                <StepSummary
                  summary={localSummary}
                  onSummaryChange={setLocalSummary}
                  onBlur={handleSummaryBlur}
                  onContextMenu={(e) => handleNoteContextMenu(e, localSummary)}
                  isCompleted={isCompleted}
                  rating={rating}
                  hoverRating={hoverRating}
                  onRating={handleRating}
                  onHoverRating={setHoverRating}
                />

                {/* AI 评估结果 */}
                {showAIEval && (
                  <AIEvaluationResult
                    loading={aiEvalLoading}
                    error={aiEvalError}
                    needsConfig={aiEvalNeedsConfig}
                    data={aiEvalData}
                    onClose={() => setShowAIEval(false)}
                    onGoSettings={() => navigate('/settings')}
                    onReset={resetAIResults}
                    onRetry={handleAIEval}
                  />
                )}

                {/* AI 反问区域 */}
                {isCompleted && (
                  <AIQuestionPanel
                    show={showQuestionPanel}
                    onShowChange={setShowQuestionPanel}
                    questionLoading={aiQuestionLoading}
                    questionError={aiQuestionError}
                    questionNeedsConfig={aiQuestionNeedsConfig}
                    questionData={aiQuestionData}
                    onGenerate={handleGenerateQuestions}
                    answers={localAnswers}
                    onAnswersChange={setLocalAnswers}
                    answerEvalLoading={aiAnswerEvalLoading}
                    answerEvalError={aiAnswerEvalError}
                    answerEvalNeedsConfig={aiAnswerEvalNeedsConfig}
                    answerEvalData={aiAnswerEvalData}
                    onSubmit={handleSubmitAnswers}
                    onGoSettings={() => navigate('/settings')}
                  />
                )}
              </>
            )}
          </motion.div>
          </AnimatePresence>
        </div>

        {/* 右侧薄弱点面板（步骤 3 抽屉） */}
        {currentStep === 3 && weakPanelOpen && (
          <WeakPointPanel
            weakPoints={noteWeakPoints}
            onToggleMastered={(id) => noteId && toggleWeakPointMastered(noteId, id)}
            onRemove={(id) => noteId && removeWeakPoint(noteId, id)}
            onOpenDeckModal={handleOpenDeckModal}
            onClose={() => setWeakPanelOpen(false)}
          />
        )}
      </div>

      {/* 底部导航 */}
      <FeynmanBottomNav
        currentStep={currentStep}
        isCompleted={isCompleted}
        onPrev={handlePrev}
        onNext={handleNext}
        onComplete={handleComplete}
        onBack={() => navigate('/feynman')}
      />

      {/* 右键菜单 */}
      {menuOpen && menuContext && (
        <ContextMenu<string>
          groups={aiMenuGroups}
          position={menuPosition}
          context={menuContext}
          onSelect={handleMenuSelect}
          onClose={closeMenu}
        />
      )}

      {/* 卡壳救援面板 */}
      <RescuePanel
        isOpen={rescueOpen}
        onClose={() => {
          setRescueOpen(false);
          stuckTimer.stop();
        }}
        context={{
          topic: note?.concept || '浮出水面',
          relatedContent: note?.explanation?.slice(0, 500),
          mode: 'feynman',
        }}
        onSuggestion={(action) => {
          if (action === 'pomodoro') navigate('/pomodoro');
          else if (action === 'flashcard') navigate('/flashcards');
        }}
      />

      {/* 牌组选择弹窗 */}
      <ConvertDeckModal
        open={showDeckModal}
        onClose={() => setShowDeckModal(false)}
        decks={flashcardDecks}
        selectedDeckId={selectedDeckId}
        onSelectDeck={setSelectedDeckId}
        isConverting={isConverting}
        onConfirm={handleConvertToFlashcards}
      />

      {/* 完成笔记前：询问是否转化薄弱点 */}
      <ConvertConfirmModal
        open={showConvertConfirm}
        onClose={() => setShowConvertConfirm(false)}
        unmasteredPoints={noteWeakPoints.filter((wp) => !wp.mastered)}
        onDirectComplete={() => handleConvertAndComplete(false)}
        onConvertAndComplete={() => handleConvertAndComplete(true)}
      />

      {/* v0.29: 费曼完成庆祝 */}
      <ConceptInternalized
        visible={showCelebration}
        concept={note?.concept ?? ''}
        selfRating={rating}
        weakPointsTotal={noteWeakPoints.length}
        weakPointsMastered={masteredCount}
        convertedCount={convertedCount}
        onClose={() => setShowCelebration(false)}
        onViewFlashcards={() => { setShowCelebration(false); navigate('/flashcards'); }}
        onBackToList={() => { setShowCelebration(false); navigate('/feynman'); }}
      />
    </motion.div>
  );
}
