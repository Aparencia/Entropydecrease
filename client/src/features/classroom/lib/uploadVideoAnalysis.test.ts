/**
 * 视频上传分析工具纯函数测试（PWA 视频转笔记，M4 Task12 补测）
 *
 * @ai-context: 覆盖 isDouyinUrl 抖音链接检测（短链/长链/非抖音/非法 URL）。
 * analyzeVideoFile 依赖真实 fetch + supabase，jsdom 覆盖收益低，留真机验证。
 * @ai-context EN: unit tests for isDouyinUrl detection. analyzeVideoFile needs
 * real fetch + supabase, left for device verification.
 */
import { describe, it, expect } from 'vitest';
import { isDouyinUrl } from './uploadVideoAnalysis';

describe('isDouyinUrl 抖音链接检测', () => {
  it('识别 v.douyin.com 短链', () => {
    expect(isDouyinUrl('https://v.douyin.com/AbCdEf/')).toBe(true);
  });

  it('识别 www.douyin.com 长链', () => {
    expect(isDouyinUrl('https://www.douyin.com/video/123456789')).toBe(true);
  });

  it('无协议前缀返回 false（URL 解析失败不抛错）', () => {
    expect(isDouyinUrl('v.douyin.com/xyz')).toBe(false);
  });

  it('拒绝非抖音域名', () => {
    expect(isDouyinUrl('https://www.bilibili.com/video/123')).toBe(false);
    expect(isDouyinUrl('https://douyin.evil.com/')).toBe(false);
  });

  it('拒绝非法 URL（不抛错）', () => {
    expect(isDouyinUrl('')).toBe(false);
    expect(isDouyinUrl('not a url')).toBe(false);
  });
});
