// @vitest-environment node
/**
 * vitest electron 目录冒烟测试
 * @ai-context: 验证 include 扩展后 electron/ 下测试可执行；Task 2 创建正式测试后删除。
 */
import { describe, it, expect } from 'vitest';

describe('electron vitest smoke', () => {
  it('runs in node environment', () => {
    expect(typeof process).toBe('object');
    expect(process.platform).toBeTruthy();
  });
});