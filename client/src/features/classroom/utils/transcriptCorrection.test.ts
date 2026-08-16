/**
 * extractCorrection 单元测试（P1-3 修正回写差异提取）
 *
 * @ai-context: 锁定差异提取契约：中段替换/词尾替换/删词；单字差异、
 * 完全相同、超长片段、空输入不入库（返回 null）。
 */
import { describe, it, expect } from 'vitest';
import { extractCorrection } from './transcriptCorrection';

describe('extractCorrection', () => {
  it('中段替换：错误词 → 正确词', () => {
    expect(extractCorrection('特征值限量', '特征向量')).toEqual({ term: '值限', target: '向' });
    expect(extractCorrection('梯度下减法', '梯度下降法')).toEqual({ term: '减', target: '降' });
  });

  it('词尾替换', () => {
    expect(extractCorrection('特征值向量', '特征值分解')).toEqual({ term: '向量', target: '分解' });
  });

  it('删词（target 更短）', () => {
    expect(extractCorrection('就是这样的一个', '就是这样')).toEqual({ term: '的一个', target: '' });
  });

  it('完全相同 → null', () => {
    expect(extractCorrection('今天讲矩阵', '今天讲矩阵')).toBeNull();
  });

  it('单字错字纠正可入库（用户主动修正即强信号）', () => {
    expect(extractCorrection('我们来看一下', '我们来看一看')).toEqual({ term: '下', target: '看' });
  });

  it('超长片段（>20 字）→ null（整句重写非词条修正）', () => {
    expect(extractCorrection('一二三四五六七八九十甲乙丙丁戊己庚辛壬癸子丑寅卯', '完全不同的一整句内容长度超过二十个字符的改写')).toBeNull();
  });

  it('空输入 → null', () => {
    expect(extractCorrection('', '内容')).toBeNull();
    expect(extractCorrection('内容', '')).toBeNull();
    expect(extractCorrection('', '')).toBeNull();
  });

  it('空白差异归一化（trim 后相同 → null）', () => {
    expect(extractCorrection(' 今天讲矩阵 ', '今天讲矩阵')).toBeNull();
  });
});
