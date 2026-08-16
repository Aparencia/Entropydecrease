// @vitest-environment node
/**
 * 窗口双向评分规则测试
 * @ai-context: 覆盖学习意图正信号/娱乐负分对冲、标题叠加、系统黑名单、置信度分级。
 */
import { describe, it, expect } from 'vitest';
import { scoreWindow, HIGH_CONFIDENCE_MIN, MEDIUM_CONFIDENCE_MIN } from './windowRules.js';

describe('scoreWindow — 系统黑名单', () => {
  it('标题黑名单直接过滤（含旧品牌课伴）', () => {
    const r = scoreWindow({ title: 'Program Manager' });
    expect(r.filtered).toBe(true);
    expect(r.score).toBe(0);
  });
  it('宽泛词 Settings/设置 不再过滤（移除误伤）', () => {
    const r = scoreWindow({ title: '我的设置中心' });
    expect(r.filtered).toBe(false);
  });
  it('进程黑名单过滤系统窗口', () => {
    const r = scoreWindow({ title: '任务栏', processName: 'explorer.exe' });
    expect(r.filtered).toBe(true);
  });
});

describe('scoreWindow — 双向计分', () => {
  it('学习意图正信号 +60（攻略类标题）', () => {
    const r = scoreWindow({ title: '原神萌新攻略：开荒机制解析' });
    expect(r.reasons).toContain('学习意图');
    expect(r.score).toBeGreaterThanOrEqual(60);
  });
  it('娱乐负分对冲：影视剧形态 -40', () => {
    const r = scoreWindow({ title: '琅琊榜 第12集', processName: 'chrome.exe' });
    expect(r.score).toBeLessThanOrEqual(20);
  });
  it('影视客户端进程 -30 + 标题 -40 → 沉底（设计文档 §3.2 示例）', () => {
    const r = scoreWindow({ title: '琅琊榜 第12集', processName: 'iqiyi.exe' });
    expect(r.score).toBeLessThanOrEqual(-50);
    expect(r.filtered).toBe(false);
  });
  it('攻略正信号强过娱乐负分：游戏攻略可进推荐', () => {
    const r = scoreWindow({ title: '只狼全 Boss 打法教学', processName: 'steam.exe' });
    expect(r.score).toBeGreaterThanOrEqual(30); // +60 -30
    expect(r.filtered).toBe(false);
  });
  it('标题关键词叠加计分（多词命中累加）', () => {
    const r = scoreWindow({ title: '腾讯会议 - 网课课堂' });
    expect(r.score).toBeGreaterThanOrEqual(80); // 40x2
  });
});

describe('scoreWindow — 系统信号', () => {
  it('进程白名单加权（浏览器 +25）', () => {
    const r = scoreWindow({ title: '随便看看', processName: 'chrome.exe' });
    expect(r.score).toBeGreaterThanOrEqual(25);
  });
  it('几何信号：16:9 宽高比 +30', () => {
    const r = scoreWindow({ title: '随便看看', aspectRatio: 16 / 9 });
    expect(r.score).toBeGreaterThanOrEqual(30);
  });
  it('前台窗口 +80（最强意图先验）', () => {
    const r = scoreWindow({ title: '随便看看', isForeground: true });
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
});

describe('scoreWindow — 置信度分级', () => {
  it('score>=130 为 high，>=70 为 medium，否则 low', () => {
    expect(scoreWindow({ title: '腾讯会议 - 网课课堂', processName: 'wemeet.exe', isForeground: true }).confidence).toBe('high');
    expect(scoreWindow({ title: '随便看看', processName: 'chrome.exe' }).confidence).toBe('low');
    expect(scoreWindow({ title: '随便看看' }).confidence).toBe('low');
    // 边界常量存在且顺序正确
    expect(HIGH_CONFIDENCE_MIN).toBeGreaterThan(MEDIUM_CONFIDENCE_MIN);
  });
  it('空标题返回 low 且不崩溃', () => {
    const r = scoreWindow({ title: '' });
    expect(r.score).toBe(0);
    expect(r.confidence).toBe('low');
  });
});