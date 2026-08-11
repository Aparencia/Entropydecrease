/**
 * 编辑器深度状态检测 hook
 * Editor depth state detection hook
 *
 * @ai-context: 基于编辑频率、撤销栈深度、内容增长率检测当前编辑深度，
 * 驱动 UI 在浅层记录/沉浸写作/复习整理三种模式间自适应切换。
 * @ai-context: Detects editing depth based on edit frequency, undo stack
 * depth, and content growth rate. Drives adaptive UI mode switching
 * between quick-capture, deep-writing, and review modes.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Editor } from '@tiptap/react';

export type EditorDepth = 'shallow' | 'immersive' | 'review';

interface UseEditorDepthOptions {
  /** 编辑器实例 */
  editor: Editor | null;
  /** 是否处于合书测试模式 */
  isClosedBook?: boolean;
  /** 是否处于阅读模式 */
  isReadingMode?: boolean;
}

interface UseEditorDepthReturn {
  /** 当前深度状态 */
  depth: EditorDepth;
  /** 手动切换深度 */
  setDepth: (d: EditorDepth) => void;
  /** 连续编辑时长（秒） */
  continuousEditSeconds: number;
  /** 内容增长率（最近 1 分钟新增字符数） */
  contentGrowthRate: number;
  /** 撤销栈深度 */
  undoDepth: number;
}

const SHALLOW_THRESHOLD_SEC = 30;    // 30 秒连续编辑进入沉浸
const REVIEW_IDLE_THRESHOLD_SEC = 120; // 120 秒无编辑进入复习
const GROWTH_RATE_SAMPLE_MS = 60_000; // 采样窗口 60 秒

export function useEditorDepth({
  editor,
  isClosedBook = false,
  isReadingMode = false,
}: UseEditorDepthOptions): UseEditorDepthReturn {
  const [depth, setDepth] = useState<EditorDepth>('shallow');
  const [continuousEditSeconds, setContinuousEditSeconds] = useState(0);
  const [contentGrowthRate, setContentGrowthRate] = useState(0);
  const [undoDepth, setUndoDepth] = useState(0);

  const lastEditRef = useRef(Date.now());
  const editStartRef = useRef(Date.now());
  const prevLengthRef = useRef(0);
  const growthAccumulatorRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 外部模式覆盖
  useEffect(() => {
    if (isClosedBook) setDepth('review');
    else if (isReadingMode) setDepth('review');
  }, [isClosedBook, isReadingMode]);

  const updateDepth = useCallback((text: string, historySize: number) => {
    const now = Date.now();
    const timeSinceLastEdit = now - lastEditRef.current;
    let elapsed = 0;

    // 更新连续编辑时长
    if (timeSinceLastEdit < 5000) {
      // 5 秒内有编辑 → 连续编辑
      elapsed = Math.floor((now - editStartRef.current) / 1000);
      setContinuousEditSeconds(elapsed);
    } else {
      // 超过 5 秒无编辑 → 重置计时
      editStartRef.current = now;
      setContinuousEditSeconds(0);
    }

    // 更新内容增长率
    const currentLen = text.length;
    const diff = currentLen - prevLengthRef.current;
    if (diff > 0) growthAccumulatorRef.current += diff;
    prevLengthRef.current = currentLen;

    // 更新撤销栈深度
    setUndoDepth(historySize);

    // 深度状态切换逻辑
    const idleTime = Math.floor((now - lastEditRef.current) / 1000);
    if (idleTime >= REVIEW_IDLE_THRESHOLD_SEC) {
      setDepth('review');
    } else if (elapsed >= SHALLOW_THRESHOLD_SEC) {
      setDepth('immersive');
    } else {
      setDepth('shallow');
    }

    lastEditRef.current = now;
  }, []);

  // 编辑器事件监听
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const onUpdate = () => {
      const text = editor.getText();
      // history 为 history plugin 的 state（EditorState 类型未声明，运行时可能为 undefined → 0）
      const historySize = (editor.state as unknown as { history?: { prev?: unknown[] } }).history?.prev?.length ?? 0;
      updateDepth(text, historySize);
    };
    const onSelectionUpdate = () => {
      // 选中文本也算活跃
      lastEditRef.current = Date.now();
    };

    editor.on('update', onUpdate);
    editor.on('selectionUpdate', onSelectionUpdate);

    // 每秒更新增长率
    intervalRef.current = setInterval(() => {
      setContentGrowthRate(growthAccumulatorRef.current);
      growthAccumulatorRef.current = 0;
    }, GROWTH_RATE_SAMPLE_MS);

    return () => {
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', onSelectionUpdate);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [editor, updateDepth]);

  return {
    depth,
    setDepth,
    continuousEditSeconds,
    contentGrowthRate,
    undoDepth,
  };
}

export default useEditorDepth;