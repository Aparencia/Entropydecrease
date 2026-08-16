/**
 * 内容类型分类器测试（P1-6 规则版 + P1-7 指令句检测）
 *
 * @ai-context: 锁定分类契约：标题关键词优先（软件/手法/讲座/课程）、转写
 * 证据兜底（命中数显著领先才判定）、无信号 unknown；指令句检测覆盖操作
 * 动词与参数类词汇。
 */
import { describe, it, expect } from 'vitest';
import {
  classifyByTitle,
  classifyByTranscript,
  classifyContent,
  hasCommandCue,
  SKILL_SAMPLER_CONFIG,
  COURSE_SAMPLER_CONFIG,
} from './contentClassifier';

describe('classifyByTitle — 窗口标题规则', () => {
  it('软件工具名 → software_skill', () => {
    expect(classifyByTitle('Photoshop 2026 从入门到精通')).toBe('software_skill');
    expect(classifyByTitle('剪映专业版教程')).toBe('software_skill');
    expect(classifyByTitle('Python 数据分析实战')).toBe('software_skill');
  });

  it('手法技巧类 → craft_skill', () => {
    expect(classifyByTitle('新手化妆教程：日常通勤妆')).toBe('craft_skill');
    expect(classifyByTitle('手机拍照技巧 10 分钟速成')).toBe('craft_skill');
    expect(classifyByTitle('瑜伽入门教学')).toBe('craft_skill');
  });

  it('讲座/会议类 → lecture', () => {
    expect(classifyByTitle('2026 AI 开发者大会主题演讲')).toBe('lecture');
    expect(classifyByTitle('深度访谈：物理学家的世界观')).toBe('lecture');
  });

  it('通用教程标题 → course', () => {
    expect(classifyByTitle('高等数学全程课程')).toBe('course');
  });

  it('无信号标题 → unknown', () => {
    expect(classifyByTitle('')).toBe('unknown');
    expect(classifyByTitle('随便看看')).toBe('unknown');
  });
});

describe('classifyByTranscript — 转写证据投票', () => {
  it('软件操作指令词显著 → software_skill', () => {
    expect(classifyByTranscript('我们点击图层面板，把这个参数调整一下，快捷键是 Ctrl+J')).toBe('software_skill');
  });

  it('手法类词汇显著 → craft_skill', () => {
    expect(classifyByTranscript('注意手腕的力度和角度，光线从侧面打过来，构图要留白')).toBe('craft_skill');
  });

  it('授课类词汇显著 → course', () => {
    expect(classifyByTranscript('这个定理的证明过程我们推导一遍，记住这个公式，考试会考')).toBe('course');
  });

  it('证据不足/无信号 → unknown', () => {
    expect(classifyByTranscript('')).toBe('unknown');
    expect(classifyByTranscript('大家好，今天我们继续上次的内容')).toBe('unknown');
  });
});

describe('classifyContent — 综合分类', () => {
  it('标题信号优先于转写证据', () => {
    const r = classifyContent('PS 教程', '这个定理的证明我们推导一遍');
    expect(r.kind).toBe('software_skill');
    expect(r.source).toBe('title');
  });

  it('标题无信号时用转写证据', () => {
    const r = classifyContent('未命名窗口', '点击图层把参数调到百分之五十');
    expect(r.kind).toBe('software_skill');
    expect(r.source).toBe('transcript');
  });

  it('双无信号 → unknown/none', () => {
    const r = classifyContent('', '');
    expect(r.kind).toBe('unknown');
    expect(r.source).toBe('none');
  });
});

describe('采样参数（分类驱动）', () => {
  it('技能类参数收紧（阈值 0.05 / 间隔 5s）', () => {
    expect(SKILL_SAMPLER_CONFIG.changeThreshold).toBe(0.05);
    expect(SKILL_SAMPLER_CONFIG.periodicIntervalMs).toBe(5000);
  });

  it('授课类参数维持默认（阈值 0.12 / 间隔 15s）', () => {
    expect(COURSE_SAMPLER_CONFIG.changeThreshold).toBe(0.12);
    expect(COURSE_SAMPLER_CONFIG.periodicIntervalMs).toBe(15000);
  });
});

describe('hasCommandCue — 指令句检测（P1-7）', () => {
  it('操作动词命中', () => {
    expect(hasCommandCue('我们点击这个按钮')).toBe(true);
    expect(hasCommandCue('把图层拖到面板里')).toBe(true);
    expect(hasCommandCue('选择套索工具')).toBe(true);
  });

  it('参数类词汇命中', () => {
    expect(hasCommandCue('把不透明度设置为百分之五十')).toBe(true);
    expect(hasCommandCue('这个参数调到三十')).toBe(true);
  });

  it('普通讲解不命中', () => {
    expect(hasCommandCue('这个定理的证明思路是这样的')).toBe(false);
    expect(hasCommandCue('')).toBe(false);
  });
});
