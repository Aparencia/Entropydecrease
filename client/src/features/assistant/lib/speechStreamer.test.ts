/**
 * speechStreamer 单元测试
 *
 * @ai-context: 验证流式分句——句子边界识别、代码围栏感知、增量消费稳定性。
 */
import { describe, it, expect } from 'vitest';
import { scanSentences, SpeechSentenceStreamer } from './speechStreamer';

describe('scanSentences', () => {
  it('按中文句号切分句子', () => {
    const { sentences } = scanSentences('第一句。第二句。第三句。');
    expect(sentences).toEqual(['第一句。', '第二句。', '第三句。']);
  });

  it('识别多种结束符（！？；）且未完成尾部不返回', () => {
    const { sentences } = scanSentences('真的吗？是的！注意；\n换行也是边界');
    // ？！；各产生一句；；后紧跟的换行为空片段不产生句子；
    // “换行也是边界”无结束符属未完成尾部，不作为句子返回
    expect(sentences).toEqual(['真的吗？', '是的！', '注意；']);
  });

  it('未遇到结束符的尾部不作为句子返回', () => {
    const { sentences, consumed } = scanSentences('完整句。半句还没完');
    expect(sentences).toEqual(['完整句。']);
    expect(consumed).toBe('完整句。'.length);
  });

  it('代码围栏内的句号不作为句子边界', () => {
    const raw = '看代码：\n```js\nconsole.log("a"); console.log("b");\n```\n代码结束。';
    const { sentences } = scanSentences(raw);
    // 代码内的分号/句号不应产生句子
    expect(sentences.some(s => s.includes('console'))).toBe(false);
    // 围栏前的散文和围栏后的句子应被提取
    expect(sentences.some(s => s.includes('看代码'))).toBe(true);
    expect(sentences.some(s => s.includes('代码结束'))).toBe(true);
  });

  it('未闭合围栏后的内容不消费', () => {
    const raw = '前面一句。\n```js\n还在写代码。没写完';
    const { sentences, inFence } = scanSentences(raw);
    expect(inFence).toBe(true);
    expect(sentences).toEqual(['前面一句。']);
  });

  it('空文本返回空结果', () => {
    const { sentences, consumed, inFence } = scanSentences('');
    expect(sentences).toEqual([]);
    expect(consumed).toBe(0);
    expect(inFence).toBe(false);
  });
});

describe('SpeechSentenceStreamer', () => {
  it('增量喂入块，逐句返回（不重复、不遗漏）', () => {
    const streamer = new SpeechSentenceStreamer();
    const collected: string[] = [];
    // 模拟流式分块
    for (const chunk of ['你好，', '我们来学', '习递归。', '第二句来了', '！']) {
      collected.push(...streamer.push(chunk));
    }
    collected.push(...streamer.flush());
    const joined = collected.join('');
    expect(joined).toContain('你好');
    expect(joined).toContain('习递归。');
    expect(joined).toContain('第二句来了！');
  });

  it('已返回的句子在后续 push 后保持不变（稳定性）', () => {
    const streamer = new SpeechSentenceStreamer();
    const first = streamer.push('第一句。');
    expect(first).toEqual(['第一句。']);
    const second = streamer.push('第二句。');
    // 第二次只返回新句子，不重复返回第一句
    expect(second).toEqual(['第二句。']);
  });

  it('流式中遇到代码块，跳过代码并在闭合后继续', () => {
    const streamer = new SpeechSentenceStreamer();
    const collected: string[] = [];
    collected.push(...streamer.push('讲解：'));
    collected.push(...streamer.push('\n```js\nfoo();'));
    collected.push(...streamer.push(' bar();\n```\n'));
    collected.push(...streamer.push('总结完毕。'));
    collected.push(...streamer.flush());
    const joined = collected.join('');
    expect(joined).not.toContain('foo()');
    expect(joined).not.toContain('bar()');
    expect(joined).toContain('讲解');
    expect(joined).toContain('总结完毕。');
  });

  it('flush 丢弃未闭合代码块内的尾部', () => {
    const streamer = new SpeechSentenceStreamer();
    streamer.push('一句散文。\n```js\n未闭合的代码。');
    const tail = streamer.flush();
    expect(tail.some(s => s.includes('未闭合的代码'))).toBe(false);
  });

  it('flush 返回末尾无结束符的残余散文', () => {
    const streamer = new SpeechSentenceStreamer();
    streamer.push('这是没有句号的结尾');
    expect(streamer.flush()).toEqual(['这是没有句号的结尾']);
  });
});
