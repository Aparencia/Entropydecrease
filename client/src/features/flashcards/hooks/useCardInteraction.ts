/**
 * 学习会话 — 卡片交互 hook（翻转门控/退出动画/拖拽评分）
 *
 * @ai-context: 从 StudySessionPage 拆出。三重时序控制：①entering 300ms
 * 入场动画；②flipDone 门控——只有翻转动画结束才允许评分；③exiting 400ms
 * 退出动画期间用 exitingRef 拦截重复评分（ref 而非 state，避免闭包过期）。
 * 拖拽评分：左滑>100px = Again，右滑>100px = Good；prefersReduced 时禁用拖拽。
 * 首次学会（repetitions===0 且非 Again）计入 sessionMastered 并触发 +1 动效。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { soundPlayer } from '@/lib/audio/SoundPlayer';
import { Rating } from '@/lib/sm2';
import type { Flashcard, Confidence } from '@/types/models';
import type { FlipCardGlow } from '../components/FlipCard';

const ENTER_ANIMATION_DURATION_MS = 300;
const PLUS_ONE_ANIMATION_DURATION_MS = 800;
const EXIT_ANIMATION_DURATION_MS = 400;
/** 拖拽触发评分的水平位移阈值（px） */
const DRAG_RATE_THRESHOLD = 100;

interface UseCardInteractionOptions {
  current: Flashcard | undefined;
  currentIndex: number;
  isFlipped: boolean;
  prefersReduced: boolean;
  rateCard: (rating: Rating, confidence: Confidence) => void;
  relearn: () => void;
}

export function useCardInteraction({
  current, currentIndex, isFlipped, prefersReduced, rateCard, relearn,
}: UseCardInteractionOptions) {
  const [flipDone, setFlipDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [exitDir, setExitDir] = useState<'left' | 'right' | null>(null);
  const [cardGlow, setCardGlow] = useState<FlipCardGlow>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [entering, setEntering] = useState(true);
  const [sessionMastered, setSessionMastered] = useState(0);
  const [showPlusOne, setShowPlusOne] = useState(false);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const prevIndexRef = useRef(currentIndex);
  const exitingRef = useRef(false);
  // 定时器 ref：卸载时清理，避免卸载后 setState（P1-9 性能修复）
  const plusOneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 拖拽手势
  const dragX = useMotionValue(0);
  const [dragActive, setDragActive] = useState(false);
  const [dragLabel, setDragLabel] = useState<'forgot' | 'remembered' | null>(null);
  const dragOverlayRed = useTransform(dragX, [-200, -50, 0], [0.55, 0, 0]);
  const dragOverlayGreen = useTransform(dragX, [0, 50, 200], [0, 0, 0.55]);

  useEffect(() => {
    if (!isFlipped) setFlipDone(false);
  }, [isFlipped]);

  // 切卡时重置全部动画状态
  useEffect(() => {
    if (prevIndexRef.current !== currentIndex) {
      setEntering(true);
      setFlipDone(false);
      setExiting(false);
      setExitDir(null);
      setCardGlow(null);
      exitingRef.current = false;
      prevIndexRef.current = currentIndex;
      const timer = setTimeout(() => setEntering(false), ENTER_ANIMATION_DURATION_MS);
      return () => clearTimeout(timer);
    }
  }, [currentIndex]);

  useEffect(() => {
    exitingRef.current = exiting;
  }, [exiting]);

  // 卸载时清理定时器，避免卸载后 setState / 会话结束后误触发 rateCard
  useEffect(() => {
    return () => {
      if (plusOneTimerRef.current) clearTimeout(plusOneTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  const handleRate = useCallback((rating: Rating) => {
    if (exitingRef.current) return;
    // v0.9.0: default to 'medium' if no confidence selected
    const effectiveConfidence = confidence ?? 'medium';
    if (current && current.repetitions === 0 && rating !== Rating.Again) {
      setSessionMastered((n) => n + 1);
      setShowPlusOne(true);
      plusOneTimerRef.current = setTimeout(() => setShowPlusOne(false), PLUS_ONE_ANIMATION_DURATION_MS);
    }
    setCardGlow(rating === Rating.Again ? 'wrong' : 'correct');
    setExitDir(rating === Rating.Again ? 'left' : 'right');
    setExiting(true);
    exitingRef.current = true;
    exitTimerRef.current = setTimeout(() => {
      setExiting(false);
      exitingRef.current = false;
      setFlipDone(false);
      setExitDir(null);
      setCardGlow(null);
      rateCard(rating, effectiveConfidence);
      setConfidence(null);
    }, EXIT_ANIMATION_DURATION_MS);
  }, [confidence, current, rateCard]);

  const handleRelearn = useCallback(() => {
    if (exitingRef.current || !current) return;
    relearn();
    setFlipDone(false);
    setExiting(false);
    exitingRef.current = false;
  }, [current, relearn]);

  const handleDragStart = useCallback(() => {
    if (isFlipped && !prefersReduced && !exitingRef.current) {
      soundPlayer.play('ui_drag_start');
      setDragActive(true);
    }
  }, [isFlipped, prefersReduced]);

  const handleDrag = useCallback((_e: unknown, info: { offset: { x: number } }) => {
    if (!isFlipped || prefersReduced) return;
    if (info.offset.x < -50) setDragLabel('forgot');
    else if (info.offset.x > 50) setDragLabel('remembered');
    else setDragLabel(null);
  }, [isFlipped, prefersReduced]);

  const handleDragEnd = useCallback((_e: unknown, info: PanInfo) => {
    setDragActive(false);
    setDragLabel(null);
    if (!isFlipped || prefersReduced || exitingRef.current) return;
    soundPlayer.play('ui_drop');
    if (info.offset.x < -DRAG_RATE_THRESHOLD) {
      handleRate(Rating.Again);
    } else if (info.offset.x > DRAG_RATE_THRESHOLD) {
      handleRate(Rating.Good);
    }
  }, [isFlipped, prefersReduced, handleRate]);

  return {
    flipDone, setFlipDone,
    exiting, exitDir, cardGlow, entering,
    hoveredRating, setHoveredRating,
    sessionMastered, showPlusOne,
    confidence, setConfidence,
    dragX, dragActive, dragLabel, dragOverlayRed, dragOverlayGreen,
    handleRate, handleRelearn, handleDragStart, handleDrag, handleDragEnd,
  };
}
