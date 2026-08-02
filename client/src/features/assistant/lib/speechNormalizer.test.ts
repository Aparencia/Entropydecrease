/**
 * speechNormalizer 单元测试
 *
 * @ai-context: 验证 TTS 朗读文本规范化管道——
 * 确保"回答与朗读一致"（保留正文）且"非必要内容不朗读"（剔除装饰）。
 */
import { describe, it, expect } from 'vitest';
import { normalizeForSpeech } from './speechNormalizer';

describe('normalizeForSpeech', () => {
  it('保留纯文本正文不变', () => {
    expect(normalizeForSpeech('你好，今天我们来学习递归。')).toBe('你好，今天我们来学习递归。');
  });

  it('剔除 emoji 与装饰符号', () => {
    const out = normalizeForSpeech('你好！🧠 专注模式已就绪 🎧 ✅');
    expect(out).not.toContain('🧠');
    expect(out).not.toContain('🎧');
    expect(out).not.toContain('✅');
    expect(out).toContain('你好');
    expect(out).toContain('专注模式已就绪');
  });

  it('剔除围栏代码块但保留前后正文', () => {
    const input = '先看一个例子：\n```js\nfunction foo() { return 1; }\n```\n这就是递归的基础。';
    const out = normalizeForSpeech(input);
    expect(out).not.toContain('function');
    expect(out).not.toContain('```');
    expect(out).toContain('先看一个例子');
    expect(out).toContain('这就是递归的基础');
  });

  it('链接保留文字、丢弃 URL', () => {
    const out = normalizeForSpeech('详情见[费曼学习法](https://example.com/feynman)这一章。');
    expect(out).not.toContain('https://');
    expect(out).toContain('费曼学习法');
  });

  it('剔除图片标记', () => {
    const out = normalizeForSpeech('如图所示 ![示意图](https://example.com/a.png) 所示。');
    expect(out).not.toContain('![');
    expect(out).not.toContain('example.com');
  });

  it('剔除标题与强调标记但保留文字', () => {
    const out = normalizeForSpeech('## 核心概念\n**递归**是*函数*调用自身。');
    expect(out).not.toContain('#');
    expect(out).not.toContain('**');
    expect(out).not.toContain('*');
    expect(out).toContain('核心概念');
    expect(out).toContain('递归');
    expect(out).toContain('函数');
  });

  it('行内代码保留内容、剔除反引号', () => {
    const out = normalizeForSpeech('请使用 `setTimeout` 这个函数。');
    expect(out).not.toContain('`');
    expect(out).toContain('setTimeout');
  });

  it('剔除列表标记并将换行转为逗号停顿', () => {
    const input = '步骤如下：\n1. 理解概念\n2. 动手实践\n3. 复述总结';
    const out = normalizeForSpeech(input);
    expect(out).not.toContain('1.');
    expect(out).not.toContain('2.');
    expect(out).toContain('理解概念');
    expect(out).toContain('动手实践');
    expect(out).toContain('复述总结');
    // 列表项之间应有逗号停顿
    expect(out).toContain('，');
  });

  it('剔除无序列表标记', () => {
    const out = normalizeForSpeech('- 苹果\n- 香蕉\n- 橘子');
    expect(out).not.toContain('- ');
    expect(out).toContain('苹果');
    expect(out).toContain('香蕉');
  });

  it('剔除引用标记', () => {
    const out = normalizeForSpeech('> 学习的关键在于输出。');
    expect(out).not.toContain('>');
    expect(out).toContain('学习的关键在于输出');
  });

  it('剔除水平分割线', () => {
    const out = normalizeForSpeech('第一部分。\n---\n第二部分。');
    expect(out).not.toContain('---');
    expect(out).toContain('第一部分');
    expect(out).toContain('第二部分');
  });

  it('解码 HTML 实体', () => {
    expect(normalizeForSpeech('A &amp; B')).toContain('A & B');
  });

  it('段落分隔转为句号停顿', () => {
    const out = normalizeForSpeech('第一段内容。\n\n第二段内容。');
    expect(out).toContain('。');
    expect(out).toContain('第一段内容');
    expect(out).toContain('第二段内容');
  });

  it('清洗后为空时返回空字符串', () => {
    expect(normalizeForSpeech('```js\ncode\n```')).toBe('');
    expect(normalizeForSpeech('🧠🎧✅')).toBe('');
    expect(normalizeForSpeech('')).toBe('');
  });

  it('不产生重复标点', () => {
    const out = normalizeForSpeech('好的。。\n\n明白。，');
    expect(out).not.toContain('。。');
    expect(out).not.toContain('。，');
  });

  it('综合场景：典型 AI 回复', () => {
    const input = [
      '你好！专注模式已就绪 🧠',
      '请发来你想朗读的**具体内容**，我将为你：',
      '✅ 优化节奏与停顿；',
      '✅ 标出关键词重音。',
      '你发，我即刻深耕——声音从理解开始 🎧',
    ].join('\n');
    const out = normalizeForSpeech(input);
    expect(out).not.toContain('🧠');
    expect(out).not.toContain('✅');
    expect(out).not.toContain('**');
    expect(out).toContain('你好');
    expect(out).toContain('具体内容');
    expect(out).toContain('优化节奏与停顿');
    expect(out).toContain('标出关键词重音');
  });
});
