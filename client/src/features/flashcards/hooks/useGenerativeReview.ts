/**
 * 生成式复习 hook
 * v0.9.0: 填空挖空规则引擎 + 先输入后揭示模式
 *
 * 使用 textDiff 进行答案差异对比，支持：
 * - 自动挖空（按比例或按关键词）
 * - 用户先输入答案再揭示正确内容
 * - 差异高亮展示
 *
 * @ai-context: flashcards 功能模块 Hook：useGenerativeReview。
 */

import { useState, useCallback, useMemo } from 'react';
import { textDiff, diffStats, type DiffLine } from '@/lib/utils/textDiff';

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 挖空模式 */
export type ClozeMode = 'ratio' | 'keyword';

/** 挖空配置 */
export interface ClozeConfig {
  /** 挖空模式：ratio（按比例）| keyword（按关键词） */
  mode: ClozeMode;
  /** ratio 模式：挖空比例 0-1，默认 0.3 */
  ratio?: number;
  /** keyword 模式：需要挖空的关键词列表 */
  keywords?: string[];
}

/** 单个挖空条目 */
export interface ClozeItem {
  /** 挖空位置（在原文中的字符偏移） */
  offset: number;
  /** 挖空长度 */
  length: number;
  /** 正确答案 */
  answer: string;
  /** 用户输入（揭示前） */
  userInput: string;
}

/** 生成式复习状态 */
export interface GenerativeReviewState {
  /** 原始完整文本 */
  originalText: string;
  /** 挖空后的文本（含占位符） */
  clozeText: string;
  /** 挖空条目列表 */
  clozeItems: ClozeItem[];
  /** 是否已揭示答案 */
  isRevealed: boolean;
  /** 差异对比结果（揭示后有效） */
  diffLines: DiffLine[];
  /** 差异统计 */
  stats: { added: number; removed: number; unchanged: number };
}

// ---------------------------------------------------------------------------
// 内部工具函数
// ---------------------------------------------------------------------------

/** 占位符格式：___[index]___ */
function makePlaceholder(index: number): string {
  return `___${index}___`;
}

/**
 * 按比例挖空：按词/句子随机挖空指定比例的内容
 * 返回挖空后的文本和挖空条目列表
 */
function generateRatioCloze(text: string, ratio: number): { clozeText: string; items: ClozeItem[] } {
  const words = text.split(/(\s+)/);
  const candidateIndices: number[] = [];

  for (let i = 0; i < words.length; i++) {
    // 跳过空白 token 和短词
    if (/^\s+$/.test(words[i]) || words[i].length < 2) continue;
    candidateIndices.push(i);
  }

  // 随机打乱候选索引
  const shuffled = [...candidateIndices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const clozeCount = Math.max(1, Math.round(candidateIndices.length * ratio));
  const selectedSet = new Set(shuffled.slice(0, clozeCount));

  const items: ClozeItem[] = [];
  const result: string[] = [];
  let offset = 0;

  for (let i = 0; i < words.length; i++) {
    if (selectedSet.has(i)) {
      const placeholder = makePlaceholder(items.length);
      items.push({
        offset,
        length: words[i].length,
        answer: words[i],
        userInput: '',
      });
      result.push(placeholder);
      offset += placeholder.length;
    } else {
      result.push(words[i]);
      offset += words[i].length;
    }
  }

  return { clozeText: result.join(''), items };
}

/**
 * 按关键词挖空：将文本中出现的关键词替换为占位符
 */
function generateKeywordCloze(text: string, keywords: string[]): { clozeText: string; items: ClozeItem[] } {
  const items: ClozeItem[] = [];
  let clozeText = text;

  // 按长度降序排列关键词（避免短关键词覆盖长关键词的部分）
  const sorted = [...keywords].sort((a, b) => b.length - a.length);

  for (const keyword of sorted) {
    const idx = clozeText.indexOf(keyword);
    if (idx === -1) continue;

    const placeholder = makePlaceholder(items.length);
    items.push({
      offset: idx,
      length: keyword.length,
      answer: keyword,
      userInput: '',
    });
    clozeText = clozeText.slice(0, idx) + placeholder + clozeText.slice(idx + keyword.length);
  }

  return { clozeText, items };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * 生成式复习 hook
 *
 * @example
 * ```tsx
 * const review = useGenerativeReview();
 * review.initFromText(noteContent, { mode: 'ratio', ratio: 0.3 });
 * // 用户填写答案
 * review.updateAnswer(0, '用户答案');
 * // 揭示并对比
 * review.reveal();
 * // 展示差异
 * review.diffLines // DiffLine[]
 * ```
 */
export function useGenerativeReview() {
  const [state, setState] = useState<GenerativeReviewState>({
    originalText: '',
    clozeText: '',
    clozeItems: [],
    isRevealed: false,
    diffLines: [],
    stats: { added: 0, removed: 0, unchanged: 0 },
  });

  /**
   * 从原始文本初始化挖空
   */
  const initFromText = useCallback((text: string, config: ClozeConfig = { mode: 'ratio' }) => {
    const { mode, ratio = 0.3, keywords = [] } = config;
    const { clozeText, items } = mode === 'keyword'
      ? generateKeywordCloze(text, keywords)
      : generateRatioCloze(text, ratio);

    setState({
      originalText: text,
      clozeText,
      clozeItems: items,
      isRevealed: false,
      diffLines: [],
      stats: { added: 0, removed: 0, unchanged: 0 },
    });
  }, []);

  /**
   * 更新指定挖空的用户输入
   */
  const updateAnswer = useCallback((index: number, userInput: string) => {
    setState((prev) => {
      if (prev.isRevealed) return prev; // 揭示后不允许修改
      const newItems = prev.clozeItems.map((item, i) =>
        i === index ? { ...item, userInput } : item,
      );
      return { ...prev, clozeItems: newItems };
    });
  }, []);

  /**
   * 揭示所有答案并生成差异对比
   * 将用户填写后的完整文本与原文进行 textDiff 对比
   */
  const reveal = useCallback(() => {
    setState((prev) => {
      // 构建用户填写后的完整文本
      let userText = prev.clozeText;
      for (let i = prev.clozeItems.length - 1; i >= 0; i--) {
        const item = prev.clozeItems[i];
        const placeholder = makePlaceholder(i);
        const displayText = item.userInput || `[${item.answer}]`;
        userText = userText.replace(placeholder, displayText);
      }

      // 同时构建正确答案文本
      let correctText = prev.clozeText;
      for (let i = prev.clozeItems.length - 1; i >= 0; i--) {
        const item = prev.clozeItems[i];
        const placeholder = makePlaceholder(i);
        correctText = correctText.replace(placeholder, item.answer);
      }

      const lines = textDiff(correctText, userText);
      const stats = diffStats(lines);

      return {
        ...prev,
        isRevealed: true,
        diffLines: lines,
        stats,
      };
    });
  }, []);

  /**
   * 重置（重新挖空，清空用户输入）
   */
  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      clozeItems: prev.clozeItems.map((item) => ({ ...item, userInput: '' })),
      isRevealed: false,
      diffLines: [],
      stats: { added: 0, removed: 0, unchanged: 0 },
    }));
  }, []);

  /**
   * 完全重置（清空所有内容）
   */
  const clearAll = useCallback(() => {
    setState({
      originalText: '',
      clozeText: '',
      clozeItems: [],
      isRevealed: false,
      diffLines: [],
      stats: { added: 0, removed: 0, unchanged: 0 },
    });
  }, []);

  /** 正确率（基于挖空条目） */
  const accuracy = useMemo(() => {
    if (!state.isRevealed || state.clozeItems.length === 0) return null;
    const correct = state.clozeItems.filter(
      (item) => item.userInput.trim().toLowerCase() === item.answer.trim().toLowerCase(),
    ).length;
    return correct / state.clozeItems.length;
  }, [state.isRevealed, state.clozeItems]);

  return {
    ...state,
    accuracy,
    initFromText,
    updateAnswer,
    reveal,
    reset,
    clearAll,
  };
}
