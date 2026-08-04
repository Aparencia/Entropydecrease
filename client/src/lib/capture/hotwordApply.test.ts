/**
 * hotwordApply 单元测试
 *
 * @ai-context: 覆盖替换词条应用的保真边界：命中替换 / 嵌套不误伤
 * （"机器学习" vs "机器"，按长度降序应用）/ 空表 / 重复命中 /
 * 英文单词内部子串不误伤 / 中英混合 / 空 target 删除 / 不可变性。
 * 英文匹配刻意不做大小写宽容（保真优先，见 HotwordDialog 录入提示）。
 * @ai-context: EN: unit tests for replace-term application covering
 * longest-first matching, nested-term safety, word-boundary guards for
 * English terms, CJK mixing, empty-target deletion and input immutability.
 */
import { describe, it, expect } from 'vitest';
import { applyReplaceTerms, type ReplaceRule } from './hotwordApply';

describe('applyReplaceTerms', () => {
  it('空规则表原样返回', () => {
    expect(applyReplaceTerms('今天讲机器学习', [])).toBe('今天讲机器学习');
  });

  it('空文本原样返回', () => {
    expect(applyReplaceTerms('', [{ term: '机器', target: '设备' }])).toBe('');
  });

  it('命中替换：基础替换生效', () => {
    const rules: ReplaceRule[] = [{ term: '机气', target: '机器' }];
    expect(applyReplaceTerms('这台机气很好', rules)).toBe('这台机器很好');
  });

  it('边界不误伤：长词"机器学习"存在时不被短词"机器"误伤', () => {
    // 词条乱序传入，验证内部按长度降序应用
    const rules: ReplaceRule[] = [
      { term: '机器', target: '设备' },
      { term: '机器学习', target: 'ML' },
    ];
    expect(applyReplaceTerms('机器学习与机器', rules)).toBe('ML与设备');
  });

  it('重复命中：同一词条多处全部替换', () => {
    const rules: ReplaceRule[] = [{ term: '机气', target: '机器' }];
    expect(applyReplaceTerms('机气学机器用', rules)).toBe('机器学机器用');
  });

  it('英文单词内部子串不误伤', () => {
    const rules: ReplaceRule[] = [{ term: 'cat', target: '猫' }];
    // education 内的 "cat" 子串跳过；独立单词 cat 正常替换
    expect(applyReplaceTerms('education and cat', rules)).toBe('education and 猫');
  });

  it('英文 term 嵌在更长英文词中（尾部相邻字母）不误伤', () => {
    const rules: ReplaceRule[] = [{ term: 'GPT', target: '大模型' }];
    expect(applyReplaceTerms('ChatGPT很强', rules)).toBe('ChatGPT很强');
    expect(applyReplaceTerms('GPT很强', rules)).toBe('大模型很强');
  });

  it('中英混合：中文 term 紧邻英文字母属合法混合，正常替换', () => {
    const rules: ReplaceRule[] = [{ term: '学习', target: '复习' }];
    expect(applyReplaceTerms('machine学习方法', rules)).toBe('machine复习方法');
  });

  it('空 target 表示删除误词', () => {
    const rules: ReplaceRule[] = [{ term: '嗯嗯嗯', target: '' }];
    expect(applyReplaceTerms('嗯嗯嗯好的', rules)).toBe('好的');
  });

  it('空 term 词条被忽略不抛错', () => {
    const rules: ReplaceRule[] = [{ term: '', target: 'x' }];
    expect(applyReplaceTerms('任意文本', rules)).toBe('任意文本');
  });

  it('不修改传入的 rules 数组', () => {
    const rules: ReplaceRule[] = [
      { term: '机器', target: '设备' },
      { term: '机器学习', target: 'ML' },
    ];
    applyReplaceTerms('机器学习', rules);
    expect(rules[0].term).toBe('机器');
    expect(rules[1].term).toBe('机器学习');
  });
});
