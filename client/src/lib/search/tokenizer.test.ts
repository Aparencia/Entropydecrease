/**
 * tokenizer 纯函数单元测试
 */
import { describe, it, expect } from 'vitest';
import { tokenize, removeStopWords, analyze, STOP_WORDS } from './tokenizer';

describe('tokenize', () => {
  it('空字符串返回空数组', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
  });

  it('纯英文文本提取单词并转小写', () => {
    const tokens = tokenize('Hello World TypeScript');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('typescript');
  });

  it('纯中文文本提取整体 token 和 bigram', () => {
    const tokens = tokenize('学习算法');
    // 完整 token
    expect(tokens).toContain('学习算法');
    // bigram 拆分
    expect(tokens).toContain('学习');
    expect(tokens).toContain('习算');
    expect(tokens).toContain('算法');
  });

  it('两字中文词只保留完整 token（无多余 bigram）', () => {
    const tokens = tokenize('学习');
    expect(tokens).toEqual(['学习']);
  });

  it('中英文混合文本', () => {
    const tokens = tokenize('今天学习 TypeScript 笔记');
    expect(tokens).toContain('今天学习');
    expect(tokens).toContain('typescript');
    expect(tokens).toContain('笔记');
  });

  it('提取数字序列', () => {
    const tokens = tokenize('第3章 算法101');
    expect(tokens).toContain('3');
    expect(tokens).toContain('101');
  });

  it('自动去重', () => {
    const tokens = tokenize('学习 学习');
    const learningTokens = tokens.filter((t) => t === '学习');
    expect(learningTokens.length).toBe(1);
  });

  it('过滤标点符号和特殊字符', () => {
    const tokens = tokenize('Hello, world! @#$ test.');
    expect(tokens).toEqual(['hello', 'world', 'test']);
  });
});

describe('removeStopWords', () => {
  it('移除中文停用词', () => {
    const tokens = ['的', '学习', '了', '算法', '在', '笔记'];
    const filtered = removeStopWords(tokens);
    expect(filtered).toEqual(['学习', '算法', '笔记']);
  });

  it('移除英文停用词', () => {
    const tokens = ['the', 'quick', 'brown', 'fox', 'is', 'fast'];
    const filtered = removeStopWords(tokens);
    expect(filtered).toEqual(['quick', 'brown', 'fox', 'fast']);
  });

  it('空数组返回空数组', () => {
    expect(removeStopWords([])).toEqual([]);
  });

  it('全部是停用词时返回空数组', () => {
    expect(removeStopWords(['的', '了', '在'])).toEqual([]);
    expect(removeStopWords(['the', 'a', 'is'])).toEqual([]);
  });
});

describe('analyze（tokenize + removeStopWords 一站式）', () => {
  it('完整流程：分词并过滤停用词', () => {
    const tokens = analyze('今天的学习是重要的');
    // "今天" 不是停用词
    expect(tokens).toContain('今天');
    // "学习" 不是停用词
    expect(tokens).toContain('学习');
    // "重要" 不是停用词
    expect(tokens).toContain('重要');
    // "的"/"是" 是停用词，应被过滤
    expect(tokens).not.toContain('的');
    expect(tokens).not.toContain('是');
  });

  it('英文句子过滤停用词', () => {
    const tokens = analyze('the algorithm is very efficient');
    expect(tokens).toContain('algorithm');
    expect(tokens).toContain('efficient');
    // "the", "is", "very" 是停用词
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).not.toContain('very');
  });
});

describe('STOP_WORDS 常量', () => {
  it('包含常见中文停用词', () => {
    expect(STOP_WORDS.has('的')).toBe(true);
    expect(STOP_WORDS.has('了')).toBe(true);
    expect(STOP_WORDS.has('在')).toBe(true);
  });

  it('包含常见英文停用词', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('is')).toBe(true);
    expect(STOP_WORDS.has('and')).toBe(true);
  });

  it('不包含有意义的词汇', () => {
    expect(STOP_WORDS.has('学习')).toBe(false);
    expect(STOP_WORDS.has('algorithm')).toBe(false);
    expect(STOP_WORDS.has('笔记')).toBe(false);
  });
});
