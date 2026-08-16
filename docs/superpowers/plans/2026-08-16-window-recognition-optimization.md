# 课堂助手视频窗口识别优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将课堂助手目标窗口识别从「标题一票制关键词」升级为「双向评分（学习意图正信号 ↔ 娱乐负分）+ 系统信号（进程/几何/前台）+ 历史记忆自动选中」的全链条方案。

**Architecture:** 三层拆分——信号层 `windowSignals.ts`（HWND 解析/进程名/几何/前台，注入式纯函数）、规则层 `windowRules.ts`（双向打分纯函数）、记忆层 `windowHistory.ts`（SQLite + 纯函数）；`windowScorer.ts` 降为组合入口保持导出兼容。渲染层 `useWindowWatcher` 实现自动选中三规则与课程名回填联动。

**Tech Stack:** Electron 主进程 TS、React 渲染进程（Vite + Tailwind）、Node-API 原生 addon（C++/Napi）、better-sqlite3（仅运行时，测试避开 ABI）、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-16-window-recognition-optimization-design.md`

**关键约束：**
- vitest include 目前仅 `src/**`；electron 测试需先扩展配置（Task 1）。
- better-sqlite3 被 `electron-rebuild` 成 Electron ABI，**vitest 中不可实例化**——`windowHistory` 的 SQLite 读写只做薄封装不写测试，纯函数层全覆盖。
- `windowSignals.ts` **不得 import `processAudioNative`**（其 import electron `app`，vitest 无法加载）；原生窗口数据由 handlers 层注入。
- 单文件 ≤300 行、`@ai-context` 中英双语注释（项目规范）。

---

## Task 1: vitest 测试基建扩展（electron 目录纳入）

**Files:**
- Modify: `client/vitest.config.ts`
- Test: `client/electron/windowRules.smoke.test.ts`（临时冒烟，Task 2 中替换为正式测试）

- [ ] **Step 1: 修改 vitest include 覆盖 electron 目录**

`client/vitest.config.ts` 中：

```ts
include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts'],
```

- [ ] **Step 2: 创建冒烟测试验证 electron 目录可跑**

Create `client/electron/windowRules.smoke.test.ts`：

```ts
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
```

- [ ] **Step 3: 运行冒烟测试验证通过**

Run: `cd client && npx vitest run electron/windowRules.smoke.test.ts`
Expected: PASS（1 passed）

- [ ] **Step 4: 运行既有测试确认无回归**

Run: `cd client && npm run test`
Expected: 全部 PASS（include 扩展不影响既有用例）

- [ ] **Step 5: Commit**

```bash
git add client/vitest.config.ts client/electron/windowRules.smoke.test.ts
git commit -m "test: vitest 纳入 electron 目录（node 环境冒烟验证）"
```

---

## Task 2: windowRules.ts 双向评分规则（核心纯函数）+ 测试

**Files:**
- Create: `client/electron/windowRules.ts`
- Test: `client/electron/windowRules.test.ts`（替换冒烟文件，删除 smoke）

- [ ] **Step 1: 写失败测试**

Create `client/electron/windowRules.test.ts`（删除 smoke 文件）：

```ts
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
    expect(scoreWindow({ title: '随便看看', processName: 'chrome.exe' }).confidence).toBe('medium');
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run electron/windowRules.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 windowRules.ts**

Create `client/electron/windowRules.ts`：

```ts
/**
 * 窗口双向评分规则（纯函数）
 *
 * 双向打分模型：学习意图正信号（标题关键词/攻略词/进程白名单/几何/前台/记忆）
 * 对冲娱乐负分（游戏/影视/直播进程与标题形态），总分决定推荐排序与置信度。
 * 系统窗口经黑名单硬过滤；宽泛标题词（Settings/设置）已移除，避免误伤。
 *
 * @ai-context: 双向评分——负向排除（娱乐特征负分沉底但不误杀）优于单一维度
 * 硬排除（游戏攻略/影视纪录片是合法学习内容）；意图先验：用户打开课堂助手
 * 即声明"采集正在看的学习内容"，前台窗口 +80 是最高置信信号。
 * @ai-context EN: Bidirectional window scoring. Negative entertainment
 * penalties (never hard-filter, so game guides / documentaries survive)
 * offset positive learning-intent signals. Foreground window (+80) is the
 * strongest intent prior.
 */

// ================================================================
// 类型定义
// ================================================================

export type Confidence = 'low' | 'medium' | 'high';

export interface WindowSignalInput {
  title: string;
  /** 进程可执行文件名（小写，如 chrome.exe）；native 不可用时缺失 */
  processName?: string;
  /** 窗口宽高比（width/height） */
  aspectRatio?: number;
  /** 窗口面积占显示器面积比例（0~1） */
  areaRatio?: number;
  alwaysOnTop?: boolean;
  /** 是否为前台窗口（native GetForegroundWindow 命中） */
  isForeground?: boolean;
}

export interface WindowScoreResult {
  score: number;
  confidence: Confidence;
  /** 命中理由（前端展示用），如 '学习意图' / '进程: wemeet.exe' */
  reasons: string[];
  /** true = 命中系统黑名单，应被过滤 */
  filtered: boolean;
  /** 娱乐负分合计（供"未被娱乐负分主导"判定，learningScore = score - entertainmentPenalty） */
  entertainmentPenalty: number;
}

// ================================================================
// 规则常量
// ================================================================

/** 置信度分级阈值 */
export const HIGH_CONFIDENCE_MIN = 130;
export const MEDIUM_CONFIDENCE_MIN = 70;

/** 标题高优先级词（原 windowScorer 迁移，+40/词可叠加） */
const HIGH_PRIORITY_WORDS = [
  '网课', '直播', '课程', '课堂', '学习', '讲座', '培训',
  '腾讯会议', '钉钉', 'zoom', 'teams', 'meet', 'webex',
  'mooc', '学堂在线', '智慧树', '学习通', '雨课堂',
  'bilibili', '哔哩哔哩', 'youtube', '网易公开课',
  'coursera', 'edx', 'udemy',
];

/** 标题中优先级词（原 windowScorer 迁移，+20/词可叠加） */
const MEDIUM_PRIORITY_WORDS = [
  'chrome', 'edge', 'firefox', 'brave', 'opera',
  'potplayer', 'vlc', 'mpv', 'windows media',
  'ev录屏', 'obs', 'mpc-hc',
];

/** 学习意图正信号词（攻略/教程类，跨场景最强，+60） */
const LEARNING_INTENT_RE =
  /攻略|教程|指南|教学|讲解|解析|入门|进阶|技巧|打法|开荒|机制|评测|实测|心得/;

/** 娱乐标题形态负分词（-40） */
const ENTERTAINMENT_TITLE_RE = /第\s*\d+\s*集|剧场版|预告片|\bmv\b|演唱会|番剧/;

/** 进程白名单（+50：会议/视频站客户端） */
const PROCESS_HIGH_WHITELIST = new Set([
  'wemeet.exe', 'dingtalk.exe', 'zoom.exe', 'teams.exe', 'webex.exe',
  'bilibili.exe', 'bililive.exe',
]);

/** 进程白名单（+25：浏览器/播放器） */
const PROCESS_MEDIUM_WHITELIST = new Set([
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe', 'opera.exe',
  'potplayermini64.exe', 'vlc.exe', 'mpv.exe',
]);

/** 娱乐进程负分（-30：游戏/影视客户端/直播平台） */
const PROCESS_ENTERTAINMENT = new Set([
  'steam.exe', 'wegame.exe', 'leagueclient.exe', 'league of legends.exe',
  'gta5.exe', 'dota2.exe', 'csgo.exe', 'valorant.exe', 'genshinimpact.exe',
  'douyu.exe', 'huya.exe', 'netflix.exe', 'mangotv.exe',
  'youku.exe', 'iqiyi.exe',
]);

/** 系统窗口进程黑名单（硬过滤） */
const PROCESS_BLACKLIST = new Set([
  'explorer.exe', 'searchhost.exe', 'startmenuexperiencehost.exe',
  'shellexperiencehost.exe', 'systemsettings.exe',
]);

/** 标题黑名单（硬过滤；保留旧品牌'课伴'防旧版本窗口被采集） */
const TITLE_BLACKLIST = [
  'program manager', 'taskbar', 'windows input experience',
  'msctfime', 'default ime', 'electron', 'entropy decrease', '课伴', '熵减',
];

// ================================================================
// 评分实现
// ================================================================

function countWords(title: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
    if (title.includes(w)) count += 1;
  }
  return count;
}

/**
 * 对单个窗口的标题+系统信号双向打分。
 * @returns 总分、置信度、命中理由、过滤标记、娱乐负分
 */
export function scoreWindow(input: WindowSignalInput): WindowScoreResult {
  const title = (input.title ?? '').trim().toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  let entertainmentPenalty = 0;

  // 黑名单检测（标题 + 进程）
  if (!title || TITLE_BLACKLIST.some((w) => title.includes(w))) {
    return { score: 0, confidence: 'low', reasons: [], filtered: true, entertainmentPenalty: 0 };
  }
  if (input.processName && PROCESS_BLACKLIST.has(input.processName)) {
    return { score: 0, confidence: 'low', reasons: [], filtered: true, entertainmentPenalty: 0 };
  }

  // 正向：标题关键词叠加
  const highHits = countWords(title, HIGH_PRIORITY_WORDS);
  const mediumHits = countWords(title, MEDIUM_PRIORITY_WORDS);
  score += highHits * 40 + mediumHits * 20;
  if (highHits > 0) reasons.push(`标题×${highHits}`);
  if (mediumHits > 0) reasons.push(`播放器/浏览器×${mediumHits}`);

  // 正向：学习意图正信号（+60）
  if (LEARNING_INTENT_RE.test(title)) {
    score += 60;
    reasons.push('学习意图');
  }

  // 负向：娱乐标题形态（-40）
  if (ENTERTAINMENT_TITLE_RE.test(title)) {
    entertainmentPenalty += 40;
    score -= 40;
    reasons.push('娱乐形态');
  }

  // 进程信号
  if (input.processName) {
    if (PROCESS_HIGH_WHITELIST.has(input.processName)) {
      score += 50;
      reasons.push(`进程: ${input.processName}`);
    } else if (PROCESS_MEDIUM_WHITELIST.has(input.processName)) {
      score += 25;
      reasons.push(`进程: ${input.processName}`);
    } else if (PROCESS_ENTERTAINMENT.has(input.processName)) {
      entertainmentPenalty += 30;
      score -= 30;
      reasons.push('娱乐进程');
    }
  }

  // 几何信号：视频/PPT 宽高比（1.2~2.4）+30
  if (input.aspectRatio !== undefined && input.aspectRatio > 1.2 && input.aspectRatio < 2.4) {
    score += 30;
    reasons.push('宽高比');
  }
  // 面积占比 ≥30% +20
  if (input.areaRatio !== undefined && input.areaRatio >= 0.3) {
    score += 20;
    reasons.push('大窗口');
  }
  // 置顶 +10 / 全屏 +15（isFullscreen 语义并入 areaRatio≈1，此处仅置顶）
  if (input.alwaysOnTop) {
    score += 10;
  }
  // 前台窗口 +80（意图先验）
  if (input.isForeground) {
    score += 80;
    reasons.push('前台窗口');
  }

  const confidence: Confidence =
    score >= HIGH_CONFIDENCE_MIN ? 'high' : score >= MEDIUM_CONFIDENCE_MIN ? 'medium' : 'low';

  return { score, confidence, reasons, filtered: false, entertainmentPenalty };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run electron/windowRules.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 删除冒烟测试**

Delete `client/electron/windowRules.smoke.test.ts`。

- [ ] **Step 6: Commit**

```bash
git add client/electron/windowRules.ts client/electron/windowRules.test.ts
git commit -m "feat(window-recognition): 窗口双向评分规则纯函数（学习意图正信号↔娱乐负分）"
```

---

## Task 3: windowSignals.ts 信号层（注入式纯函数）+ 测试

**Files:**
- Create: `client/electron/windowSignals.ts`
- Test: `client/electron/windowSignals.test.ts`

- [ ] **Step 1: 写失败测试**

Create `client/electron/windowSignals.test.ts`：

```ts
// @vitest-environment node
/**
 * 窗口信号层测试（注入式：native 数据由调用方传入，本模块不依赖 electron）
 * @ai-context: 覆盖 HWND 解析、native 索引构建、几何信号计算、信号缺失降级。
 */
import { describe, it, expect } from 'vitest';
import { parseHwndFromSourceId, buildNativeIndex, resolveGeometrySignals } from './windowSignals.js';

describe('parseHwndFromSourceId', () => {
  it('解析标准 desktopCapturer id', () => {
    expect(parseHwndFromSourceId('window:123456:0')).toBe('123456');
  });
  it('非 window 前缀返回 null', () => {
    expect(parseHwndFromSourceId('screen:0:0')).toBeNull();
    expect(parseHwndFromSourceId('')).toBeNull();
    expect(parseHwndFromSourceId(null as unknown as string)).toBeNull();
  });
  it('畸形 id 返回 null', () => {
    expect(parseHwndFromSourceId('window:')).toBeNull();
    expect(parseHwndFromSourceId('window:abc:0')).toBe('abc'); // 非数字仍透传（匹配 native 字符串 hwnd）
  });
});

describe('buildNativeIndex', () => {
  it('按 hwnd 字符串建索引', () => {
    const idx = buildNativeIndex([
      { hwnd: '111', processName: 'chrome.exe', width: 1280, height: 720, alwaysOnTop: false },
    ]);
    expect(idx.get('111')?.processName).toBe('chrome.exe');
    expect(idx.size).toBe(1);
  });
  it('空输入返回空 Map', () => {
    expect(buildNativeIndex([]).size).toBe(0);
  });
});

describe('resolveGeometrySignals', () => {
  it('计算宽高比与面积占比', () => {
    const s = resolveGeometrySignals(
      { hwnd: '1', processName: 'chrome.exe', width: 1280, height: 720, alwaysOnTop: true },
      1920 * 1080,
    );
    expect(s.aspectRatio).toBeCloseTo(16 / 9, 5);
    expect(s.areaRatio).toBeCloseTo(1280 * 720 / (1920 * 1080), 5);
    expect(s.alwaysOnTop).toBe(true);
  });
  it('native 缺失（undefined）时返回空信号（降级）', () => {
    expect(resolveGeometrySignals(undefined, 1920 * 1080)).toEqual({});
  });
  it('显示器面积为 0 时避免除零', () => {
    const s = resolveGeometrySignals(
      { hwnd: '1', processName: 'x.exe', width: 100, height: 100, alwaysOnTop: false },
      0,
    );
    expect(s.areaRatio).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run electron/windowSignals.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 windowSignals.ts**

Create `client/electron/windowSignals.ts`：

```ts
/**
 * 窗口信号采集（注入式纯函数层）
 *
 * 将 desktopCapturer source id 与 native 窗口枚举（listAudioWindows）对齐，
 * 产出评分所需的进程名/几何信号。native 数据由调用方（screenCaptureHandlers）
 * 经 loadProcessAudioNative 获取后注入——本模块不依赖 electron，可单测。
 *
 * @ai-context: source id 形如 "window:<HWND>:0"，HWND 用字符串传递（可能超
 * 2^32，见 addon.cc）。native 缺失时降级为空信号（纯标题评分路径，与现状一致）。
 * @ai-context EN: Pure signal-resolution layer. Callers inject native window
 * enumeration results; missing native degrades to title-only scoring.
 */

// ================================================================
// 类型定义
// ================================================================

/** native 枚举窗口的最小信号子集（对齐 processAudioNative.NativeWindowInfo 扩展后字段） */
export interface NativeWindowSignal {
  hwnd: string;
  processName: string;
  width: number;
  height: number;
  alwaysOnTop: boolean;
}

/** 评分所需几何信号（全部可选，缺失即不参与） */
export interface GeometrySignals {
  aspectRatio?: number;
  areaRatio?: number;
  alwaysOnTop?: boolean;
}

// ================================================================
// 信号解析
// ================================================================

/**
 * 从 desktopCapturer source id 解析 HWND。
 * @param sourceId 形如 "window:<HWND>:0"；非 window 前缀或结构缺失返回 null
 */
export function parseHwndFromSourceId(sourceId: string | null): string | null {
  if (!sourceId || !sourceId.startsWith('window:')) return null;
  const parts = sourceId.split(':');
  if (parts.length < 2 || !parts[1]) return null;
  return parts[1];
}

/**
 * 按 hwnd 字符串建索引，供 source id → native 窗口 O(1) 匹配。
 */
export function buildNativeIndex(
  nativeWindows: NativeWindowSignal[],
): Map<string, NativeWindowSignal> {
  const index = new Map<string, NativeWindowSignal>();
  for (const w of nativeWindows) {
    index.set(w.hwnd, w);
  }
  return index;
}

/**
 * 由 native 窗口 + 显示器面积计算几何信号。
 * @param native 匹配到的 native 窗口；undefined 表示未匹配/信号源缺失
 * @param displayArea 显示器面积（px²，screen 模块计算）；0 时面积占比置空避免除零
 */
export function resolveGeometrySignals(
  native: NativeWindowSignal | undefined,
  displayArea: number,
): GeometrySignals {
  if (!native) return {};
  const signals: GeometrySignals = {
    alwaysOnTop: native.alwaysOnTop,
  };
  if (native.width > 0 && native.height > 0) {
    signals.aspectRatio = native.width / native.height;
  }
  if (displayArea > 0 && native.width > 0 && native.height > 0) {
    signals.areaRatio = (native.width * native.height) / displayArea;
  }
  return signals;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run electron/windowSignals.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/electron/windowSignals.ts client/electron/windowSignals.test.ts
git commit -m "feat(window-recognition): 窗口信号层（HWND解析/几何计算，注入式可测）"
```

---

## Task 4: windowScorer.ts 组合入口改造（导出兼容）+ 测试

**Files:**
- Modify: `client/electron/windowScorer.ts`（整体重写为组合入口）
- Test: `client/electron/windowScorer.test.ts`

- [ ] **Step 1: 写失败测试**

Create `client/electron/windowScorer.test.ts`：

```ts
// @vitest-environment node
/**
 * 窗口评分组合入口测试
 * @ai-context: 兼容路径（无信号=纯标题，与改造前行为一致）；信号注入路径；
 * 记忆查找注入（courseName 携带 + boost 计入总分）。
 */
import { describe, it, expect } from 'vitest';
import { scoreAndFilterWindows } from './windowScorer.js';

const WIN = (id: string, title: string) => ({ id, title, thumbnail: '' });

describe('scoreAndFilterWindows — 兼容路径（无信号）', () => {
  it('空标题与黑名单窗口被过滤', () => {
    const out = scoreAndFilterWindows([WIN('1', ''), WIN('2', 'Program Manager'), WIN('3', '腾讯会议')]);
    expect(out.map((w) => w.id)).toEqual(['3']);
  });
  it('无信号时评分与旧逻辑等价（关键词排序）', () => {
    const out = scoreAndFilterWindows([WIN('1', '随便看看'), WIN('2', '腾讯会议 - 网课')]);
    expect(out[0].id).toBe('2');
    expect(out[0].score).toBeGreaterThanOrEqual(80); // 40x2 叠加
    expect(out[1].score).toBe(0);
  });
  it('matched 兼容：填充最高权重理由', () => {
    const out = scoreAndFilterWindows([WIN('1', '腾讯会议 - 网课')]);
    expect(out[0].matched).toBeTruthy();
  });
});

describe('scoreAndFilterWindows — 信号注入路径', () => {
  it('按 source id 注入信号参与评分', () => {
    const out = scoreAndFilterWindows(
      [WIN('window:111:0', '原神萌新攻略')],
      {
        signalsBySourceId: new Map([['window:111:0', { title: '原神萌新攻略', processName: 'steam.exe' }]]),
      },
    );
    expect(out[0].processName).toBe('steam.exe');
    expect(out[0].confidence).toBeDefined();
    expect(out[0].reasons?.length).toBeGreaterThan(0);
  });
  it('记忆查找注入：携带 courseName 并计入 boost', () => {
    const out = scoreAndFilterWindows(
      [WIN('window:111:0', '高等数学 - bilibili.com')],
      {
        signalsBySourceId: new Map([['window:111:0', { title: '高等数学 - bilibili.com' }]]),
        memoryLookup: () => ({ courseName: '高等数学', boost: 40 }),
      },
    );
    expect(out[0].memoryCourseName).toBe('高等数学');
    expect(out[0].score).toBeGreaterThanOrEqual(40);
  });
  it('排序：总分降序，同分按 id 稳定', () => {
    const out = scoreAndFilterWindows(
      [WIN('a', '随便看看'), WIN('b', '腾讯会议 - 网课'), WIN('c', '随便看看')],
      {
        signalsBySourceId: new Map([
          ['a', { title: '随便看看' }],
          ['b', { title: '腾讯会议 - 网课' }],
          ['c', { title: '随便看看' }],
        ]),
      },
    );
    expect(out.map((w) => w.id)).toEqual(['b', 'a', 'c']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run electron/windowScorer.test.ts`
Expected: FAIL（`signalsBySourceId` 选项不存在）

- [ ] **Step 3: 重写 windowScorer.ts 为组合入口**

Overwrite `client/electron/windowScorer.ts`（旧实现的关键词规则已迁移至 windowRules.ts）：

```ts
/**
 * 窗口智能评分与过滤模块（组合入口）
 *
 * 编排信号层（windowSignals）与规则层（windowRules）：对 desktopCapturer
 * 返回的窗口列表附加系统信号（进程/几何/前台）与记忆 boost 后双向打分排序，
 * 过滤系统/不可见窗口，将最可能是网课/直播/会议的窗口排在前面。
 * 无信号注入时退化为纯标题评分（与旧版行为一致）。
 *
 * @ai-context: 采集窗口智能评分过滤：排除自身窗口（含旧品牌'课伴'关键词——
 * 防旧版本窗口被采集，为兼容保留勿删）与系统窗口。信号源全部可选：native
 * 缺失时仅标题关键词评分，保证行为不回归。
 * @ai-context EN: Composition entry for window scoring. All signal sources
 * are optional; without them the output matches legacy title-only behavior.
 */
import { scoreWindow, type Confidence, type WindowSignalInput } from './windowRules.js';

// ================================================================
// 类型定义
// ================================================================

export interface ScoredWindow {
  id: string;
  title: string;
  thumbnail: string;
  score: number;
  matched?: string; // 命中的首个理由（兼容旧 UI 展示）
  processName?: string;
  confidence?: Confidence;
  reasons?: string[];
  /** 未被娱乐负分主导的学习分（learningScore = score - entertainmentPenalty） */
  learningScore?: number;
  /** 记忆命中的课程名（供渲染层回填课程） */
  memoryCourseName?: string;
  /** 是否前台窗口（渲染层自动选中规则②使用） */
  isForeground?: boolean;
}

export interface ScoreAndFilterOptions {
  /** 按 source id 注入的信号（screenCaptureHandlers 构建） */
  signalsBySourceId?: Map<string, WindowSignalInput>;
  /** 记忆查找注入（windowHistory 包装），返回课程名与 boost 分；null 表示无记忆 */
  memoryLookup?: (processName: string, title: string) => { courseName?: string; boost: number } | null;
}

// ================================================================
// 组合入口
// ================================================================

/**
 * 对窗口列表进行评分、过滤和排序（降序；同分按 id 稳定）
 */
export function scoreAndFilterWindows(
  windows: { id: string; title: string; thumbnail: string }[],
  options?: ScoreAndFilterOptions,
): ScoredWindow[] {
  const scored: ScoredWindow[] = [];

  for (const win of windows) {
    if (!win.title || win.title.trim() === '') continue;

    // 信号装配：注入信号优先，缺失时退化为纯标题
    const signal: WindowSignalInput = {
      title: win.title,
      ...(options?.signalsBySourceId?.get(win.id) ?? {}),
    };

    const result = scoreWindow(signal);
    if (result.filtered) continue;

    const out: ScoredWindow = {
      id: win.id,
      title: win.title,
      thumbnail: win.thumbnail,
      score: result.score,
      matched: result.reasons[0],
      reasons: result.reasons,
      confidence: result.confidence,
      learningScore: result.score - result.entertainmentPenalty,
    };

    if (signal.processName) out.processName = signal.processName;
    if (signal.isForeground) out.isForeground = true;

    // 记忆 boost（注入式，避免本模块依赖 SQLite）
    if (options?.memoryLookup && signal.processName) {
      const mem = options.memoryLookup(signal.processName, win.title);
      if (mem) {
        out.score += mem.boost;
        out.memoryCourseName = mem.courseName;
      }
    }

    scored.push(out);
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return scored;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run electron/windowScorer.test.ts && npx vitest run electron/windowRules.test.ts`
Expected: PASS（两组全过，无回归）

- [ ] **Step 5: 类型检查确认主进程编译通过**

Run: `cd client && npm run typecheck:electron`
Expected: PASS（screenCaptureHandlers 仍按旧签名调用，options 可选故不破坏）

- [ ] **Step 6: Commit**

```bash
git add client/electron/windowScorer.ts client/electron/windowScorer.test.ts
git commit -m "feat(window-recognition): windowScorer 组合入口（信号注入+记忆查找，导出兼容）"
```

---

## Task 5: 阶段一接入 screenCaptureHandlers（行为兼容）

**Files:**
- Modify: `client/electron/screenCaptureHandlers.ts`（两处：`screen_list_windows` 与 watch 推送）

- [ ] **Step 1: 改造 screen_list_windows 与 watch 推送调用评分入口**

在 `client/electron/screenCaptureHandlers.ts` 的 `screen_list_windows` handler（约 L180）中：

```ts
// 智能评分、过滤与排序（阶段一：无信号注入，退化为纯标题评分；阶段二起注入系统信号）
return scoreAndFilterWindows(rawWindows, {
  signalsBySourceId: buildSignalMap(sources),
});
```

在 watch 推送处（约 L233）同样替换为：

```ts
const scored = scoreAndFilterWindows(rawWindows, {
  signalsBySourceId: buildSignalMap(sources),
});
```

- [ ] **Step 2: 新增 buildSignalMap 占位函数（阶段二填充）**

在 `screenCaptureHandlers.ts` 模块级函数区（`applyRateScale` 附近）新增：

```ts
/**
 * 构建 source id → 评分信号的映射。
 * @ai-context: 阶段一为空映射（纯标题评分）；阶段二接入 native 窗口枚举后填充
 * 进程名/几何/前台信号。信号源缺失时返回空 Map，评分自动降级。
 */
function buildSignalMap(sources: Electron.DesktopCapturerSource[]): Map<string, WindowSignalInput> {
  // 阶段二：native 枚举注入
  void sources;
  return new Map();
}
```

并在文件头部 import 处补充类型导入：

```ts
import type { WindowSignalInput } from './windowRules.js';
```

- [ ] **Step 3: 编译与测试验证**

Run: `cd client && npm run typecheck:electron && npx vitest run electron/`
Expected: PASS（编译通过；electron 目录测试全绿）

- [ ] **Step 4: Commit**

```bash
git add client/electron/screenCaptureHandlers.ts
git commit -m "refactor(window-recognition): 阶段一接入评分组合入口（行为兼容）"
```

---

## Task 6: 原生扩展——窗口几何/置顶/前台 HWND（C++ + 加载器）

**Files:**
- Modify: `client/native/process-audio/src/window_finder.h`
- Modify: `client/native/process-audio/src/window_finder.cc`
- Modify: `client/native/process-audio/src/addon.cc`
- Modify: `client/electron/audio/processAudioNative.ts`

- [ ] **Step 1: 扩展 window_finder.h 结构体**

`client/native/process-audio/src/window_finder.h` 的 `WindowInfo` 增加字段：

```cpp
  /** 窗口矩形（像素，GetWindowRect） */
  int32_t left = 0;
  int32_t top = 0;
  int32_t width = 0;
  int32_t height = 0;
  /** 置顶窗口（WS_EX_TOPMOST） */
  bool always_on_top = false;
```

并在声明区追加前台窗口查询：

```cpp
/** 取当前前台窗口 HWND；无前台窗口时返回 0 */
uint64_t GetForegroundWindowHwnd();
```

- [ ] **Step 2: 扩展 window_finder.cc 枚举实现**

`EnumProc` 中 `WindowInfo info;` 之后补充：

```cpp
  RECT rect = {0, 0, 0, 0};
  if (GetWindowRect(hwnd, &rect) != 0) {
    info.left = rect.left;
    info.top = rect.top;
    info.width = rect.right - rect.left;
    info.height = rect.bottom - rect.top;
  }
  info.always_on_top = (GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOPMOST) != 0;
```

文件底部 `ResolveRootPidForPid` 之后新增实现：

```cpp
uint64_t GetForegroundWindowHwnd() {
  HWND hwnd = ::GetForegroundWindow();
  if (hwnd == nullptr) return 0;
  return reinterpret_cast<uint64_t>(hwnd);
}
```

- [ ] **Step 3: 扩展 addon.cc 序列化与导出**

`ListAudioWindows` 的 `obj.Set(...)` 区（`rootProcessName` 之后）补充：

```cpp
    obj.Set("left", Napi::Number::New(env, w.left));
    obj.Set("top", Napi::Number::New(env, w.top));
    obj.Set("width", Napi::Number::New(env, w.width));
    obj.Set("height", Napi::Number::New(env, w.height));
    obj.Set("alwaysOnTop", Napi::Boolean::New(env, w.always_on_top));
```

新增前台查询函数（`IsSupported` 附近）：

```cpp
/** getForegroundHwnd(): 返回当前前台窗口 hwnd 字符串；无则返回空串 */
Napi::Value GetForegroundHwnd(const Napi::CallbackInfo& info) {
  const uint64_t hwnd = process_audio::GetForegroundWindowHwnd();
  if (hwnd == 0) return Napi::String::New(info.Env(), "");
  return Napi::String::New(info.Env(), std::to_string(hwnd));
}
```

`Init` 导出表（`listAudioWindows` 之后）追加：

```cpp
  exports.Set("getForegroundHwnd", Napi::Function::New(env, GetForegroundHwnd));
```

- [ ] **Step 4: 扩展 processAudioNative.ts 类型与导出**

`client/electron/audio/processAudioNative.ts`：

`NativeWindowInfo` 增加：

```ts
  /** 窗口矩形（像素，native 扩展字段） */
  left: number;
  top: number;
  width: number;
  height: number;
  /** 置顶窗口 */
  alwaysOnTop: boolean;
```

`ProcessAudioNative` 接口增加：

```ts
  /** 当前前台窗口 hwnd 字符串；无前台窗口返回空串 */
  getForegroundHwnd(): string;
```

- [ ] **Step 5: 编译原生模块验证**

Run: `cd client && npm run native:build`
Expected: 编译成功（build/Release/process_audio.node 更新）

- [ ] **Step 6: Commit**

```bash
git add client/native/process-audio/src client/electron/audio/processAudioNative.ts
git commit -m "feat(window-recognition): native 扩展窗口几何/置顶/前台HWND枚举"
```

---

## Task 7: 完整信号接入 screenCaptureHandlers（native 注入）

**Files:**
- Modify: `client/electron/screenCaptureHandlers.ts`

- [ ] **Step 1: 实现 buildSignalMap（native 枚举 + 前台窗口 + 显示器面积）**

替换 Task 5 的占位实现：

```ts
import { screen } from 'electron';
import { loadProcessAudioNative } from './audio/processAudioNative.js';
import { parseHwndFromSourceId, buildNativeIndex, resolveGeometrySignals } from './windowSignals.js';

/**
 * 构建 source id → 评分信号的映射。
 * @ai-context: native 缺失时返回空 Map，评分自动降级为纯标题（与旧版行为一致）。
 * 前台窗口判定：native.getForegroundHwnd() 命中当前 source 的 HWND。
 */
function buildSignalMap(sources: Electron.DesktopCapturerSource[]): Map<string, WindowSignalInput> {
  const signals = new Map<string, WindowSignalInput>();
  const native = loadProcessAudioNative();
  if (!native) return signals;

  let nativeWindows: NativeWindowSignal[];
  try {
    nativeWindows = native.listAudioWindows().map((w) => ({
      hwnd: String(w.hwnd),
      processName: w.processName,
      width: w.width,
      height: w.height,
      alwaysOnTop: w.alwaysOnTop,
    }));
  } catch (err) {
    logger.warn('[IPC] native listAudioWindows 失败，降级纯标题评分:', err);
    return signals;
  }

  const index = buildNativeIndex(nativeWindows);

  // 显示器总面积（像素²；无显示器时置 0，面积占比信号自动跳过）
  let displayArea = 0;
  try {
    const bounds = screen.getPrimaryDisplay().bounds;
    displayArea = bounds.width * bounds.height;
  } catch {
    displayArea = 0;
  }

  // 前台窗口 hwnd（失败时为空串 → 无窗口命中前台）
  let foregroundHwnd = '';
  try {
    foregroundHwnd = native.getForegroundHwnd();
  } catch {
    foregroundHwnd = '';
  }

  for (const src of sources) {
    const hwnd = parseHwndFromSourceId(src.id);
    if (!hwnd) continue;
    const nativeWin = index.get(hwnd);
    if (!nativeWin) continue;
    const geo = resolveGeometrySignals(nativeWin, displayArea);
    signals.set(src.id, {
      title: src.name,
      processName: nativeWin.processName,
      aspectRatio: geo.aspectRatio,
      areaRatio: geo.areaRatio,
      alwaysOnTop: geo.alwaysOnTop,
      isForeground: hwnd === foregroundHwnd,
    });
  }
  return signals;
}
```

头部 import 调整：`windowSignals.js` 需导出 `NativeWindowSignal` 类型（Task 3 已定义），补充 import：

```ts
import type { NativeWindowSignal } from './windowSignals.js';
```

- [ ] **Step 2: 编译验证**

Run: `cd client && npm run typecheck:electron`
Expected: PASS（若 `NativeWindowSignal` 与 native 扩展字段类型不一致会在此暴露——nativeWin.width 等字段来自 `NativeWindowInfo`，需确认其已含 width/height/alwaysOnTop）

- [ ] **Step 3: 运行全量测试**

Run: `cd client && npx vitest run electron/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/electron/screenCaptureHandlers.ts
git commit -m "feat(window-recognition): 完整信号注入（进程/几何/前台窗口，native缺失降级）"
```

---

## Task 8: windowHistory.ts 记忆层（纯函数 + SQLite 薄封装）+ 测试

**Files:**
- Create: `client/electron/windowHistory.ts`
- Test: `client/electron/windowHistory.test.ts`

- [ ] **Step 1: 写失败测试（只覆盖纯函数——better-sqlite3 为 Electron ABI，vitest 不可实例化）**

Create `client/electron/windowHistory.test.ts`：

```ts
// @vitest-environment node
/**
 * 窗口记忆纯函数测试
 * @ai-context: better-sqlite3 经 electron-rebuild 为 Electron ABI，vitest 无法
 * 实例化——仅覆盖纯函数层（模板归一化/hash/boost/LRU 淘汰），SQLite 读写为薄封装不测。
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeTitleTemplate,
  hashTitleTemplate,
  computeMemoryBoost,
  pickLruEviction,
} from './windowHistory.js';

describe('normalizeTitleTemplate', () => {
  it('归一化数字（会议号/章节/未读数）', () => {
    expect(normalizeTitleTemplate('腾讯会议 123456789')).toBe('腾讯会议 {n}');
    expect(normalizeTitleTemplate('琅琊榜 第12集')).toBe('琅琊榜 第{n}集');
  });
  it('稳定视频站标题模板', () => {
    expect(normalizeTitleTemplate('新手化妆教程 - bilibili.com')).toBe('新手化妆教程 - bilibili.com');
  });
});

describe('hashTitleTemplate', () => {
  it('同模板同 hash，不同模板不同 hash', () => {
    const t = '腾讯会议 {n}';
    expect(hashTitleTemplate(t)).toBe(hashTitleTemplate(t));
    expect(hashTitleTemplate(t)).not.toBe(hashTitleTemplate('腾讯会议 其他'));
  });
});

describe('computeMemoryBoost', () => {
  it('useCount 封顶 30（min(count,5)*6），recency 7 天内 +10', () => {
    const now = Date.now();
    expect(computeMemoryBoost({ useCount: 3, lastUsedAt: now }, now)).toBe(18 + 10);
    expect(computeMemoryBoost({ useCount: 99, lastUsedAt: now }, now)).toBe(30 + 10);
  });
  it('30 天内 +5，超过 30 天仅 count 分', () => {
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    expect(computeMemoryBoost({ useCount: 1, lastUsedAt: now - 10 * DAY }, now)).toBe(6 + 5);
    expect(computeMemoryBoost({ useCount: 1, lastUsedAt: now - 40 * DAY }, now)).toBe(6);
  });
  it('null 记忆返回 0', () => {
    expect(computeMemoryBoost(null, Date.now())).toBe(0);
  });
});

describe('pickLruEviction', () => {
  it('返回最久未使用条目', () => {
    const entries = [
      { titleHash: 'a', lastUsedAt: 100 },
      { titleHash: 'b', lastUsedAt: 50 },
      { titleHash: 'c', lastUsedAt: 200 },
    ];
    expect(pickLruEviction(entries as never)).toBe('b');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run electron/windowHistory.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 windowHistory.ts**

Create `client/electron/windowHistory.ts`：

```ts
/**
 * 窗口选择历史记忆（纯函数 + SQLite 薄封装）
 *
 * 按「进程名 + 标题模板」维度记忆用户选择：模板归一化（会议号/章节数字 →
 * 占位符）使同一窗口的反复选择命中同一记忆条目。boost 分 = min(useCount,5)×6
 * + recency（7 天内 +10 / 30 天内 +5，封顶 +40）。
 *
 * @ai-context: 标题模板化是记忆可靠性的关键——"腾讯会议 123456789"与
 * "腾讯会议 987654321"必须命中同一条记忆，否则每次会议号变化都失忆。
 * @ai-context EN: Choice memory keyed by process + normalized title template.
 * SQLite writes are a thin layer over sqliteService; pure functions are
 * unit-testable without the Electron-ABI better-sqlite3.
 */
import { getConnection } from './db/sqliteService.js';

// ================================================================
// 类型定义
// ================================================================

export interface WindowMemoryEntry {
  processName: string;
  titleHash: string;
  titleTemplate: string;
  courseName?: string;
  useCount: number;
  lastUsedAt: number;
}

/** 记忆上限（LRU 淘汰） */
export const MEMORY_MAX_ENTRIES = 100;

// ================================================================
// 纯函数
// ================================================================

/** 数字（含千分位/标点包裹的编号）→ 占位符；保留标题其余结构 */
export function normalizeTitleTemplate(title: string): string {
  return (title ?? '')
    .replace(/\d[\d,，.．\-—_]*/g, '{n}')
    .replace(/\{n\}[^-\w]*\{n\}/g, '{n}');
}

/** djb2 字符串 hash → hex（稳定、碰撞概率可接受） */
export function hashTitleTemplate(template: string): string {
  let h = 5381;
  for (let i = 0; i < template.length; i += 1) {
    h = ((h << 5) + h + template.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

/**
 * 计算记忆 boost 分（封顶 +40）。
 * @param now 当前时间戳（注入便于测试）
 */
export function computeMemoryBoost(entry: WindowMemoryEntry | null, now: number): number {
  if (!entry) return 0;
  const DAY = 24 * 3600 * 1000;
  let boost = Math.min(entry.useCount, 5) * 6;
  const age = now - entry.lastUsedAt;
  if (age >= 0 && age <= 7 * DAY) boost += 10;
  else if (age > 7 * DAY && age <= 30 * DAY) boost += 5;
  return Math.min(boost, 40);
}

/** LRU 淘汰：返回最久未使用的 titleHash（entries 为空返回 null） */
export function pickLruEviction(
  entries: Array<Pick<WindowMemoryEntry, 'titleHash' | 'lastUsedAt'>>,
): string | null {
  let oldest: string | null = null;
  let oldestAt = Infinity;
  for (const e of entries) {
    if (e.lastUsedAt < oldestAt) {
      oldestAt = e.lastUsedAt;
      oldest = e.titleHash;
    }
  }
  return oldest;
}

// ================================================================
// SQLite 薄封装（运行时路径，异常由调用方降级）
// ================================================================

/** 建表（幂等） */
function ensureTable(): void {
  getConnection()
    .prepare(
      `CREATE TABLE IF NOT EXISTS window_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_name TEXT NOT NULL,
        title_hash TEXT NOT NULL,
        title_template TEXT NOT NULL,
        course_name TEXT,
        use_count INTEGER NOT NULL DEFAULT 1,
        last_used_at INTEGER NOT NULL,
        UNIQUE(process_name, title_hash)
      )`,
    )
    .run();
}

/** 记录一次选择（upsert：use_count+1、更新 last_used_at 与 course_name） */
export function recordChoice(
  processName: string,
  title: string,
  courseName?: string,
): void {
  try {
    ensureTable();
    const template = normalizeTitleTemplate(title);
    const titleHash = hashTitleTemplate(template);
    const now = Date.now();
    const db = getConnection();
    db.prepare(
      `INSERT INTO window_memory (process_name, title_hash, title_template, course_name, use_count, last_used_at)
       VALUES (?, ?, ?, ?, 1, ?)
       ON CONFLICT(process_name, title_hash) DO UPDATE SET
         use_count = use_count + 1,
         last_used_at = excluded.last_used_at,
         course_name = COALESCE(excluded.course_name, window_memory.course_name)`,
    ).run(processName.toLowerCase(), titleHash, template, courseName ?? null, now);

    // LRU 淘汰：超过上限删除最久未使用条目
    const row = db
      .prepare('SELECT COUNT(*) AS c FROM window_memory')
      .get() as { c: number };
    if (row.c > MEMORY_MAX_ENTRIES) {
      const victims = db
        .prepare('SELECT title_hash, last_used_at FROM window_memory ORDER BY last_used_at ASC LIMIT ?')
        .all(row.c - MEMORY_MAX_ENTRIES) as Array<{ title_hash: string; last_used_at: number }>;
      const evict = pickLruEviction(victims);
      if (evict) {
        db.prepare('DELETE FROM window_memory WHERE title_hash = ?').run(evict);
      }
    }
  } catch (err) {
    // 记忆读写失败静默降级（不影响评分链路）
    console.warn('[windowHistory] recordChoice failed:', err);
  }
}

/** 查询记忆条目（进程名 + 标题模板）；无命中返回 null */
export function lookupMemory(
  processName: string,
  title: string,
): WindowMemoryEntry | null {
  try {
    ensureTable();
    const template = normalizeTitleTemplate(title);
    const row = getConnection()
      .prepare(
        `SELECT process_name AS processName, title_hash AS titleHash, title_template AS titleTemplate,
                course_name AS courseName, use_count AS useCount, last_used_at AS lastUsedAt
         FROM window_memory WHERE process_name = ? AND title_hash = ?`,
      )
      .get(processName.toLowerCase(), hashTitleTemplate(template)) as
      | WindowMemoryEntry
      | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

/** 清空全部记忆（设置页入口） */
export function clearMemory(): void {
  try {
    ensureTable();
    getConnection().prepare('DELETE FROM window_memory').run();
  } catch {
    // 静默降级
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run electron/windowHistory.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查**

Run: `cd client && npm run typecheck:electron`
Expected: PASS（`sqliteService.js` 相对导入路径与 electron/tsconfig 匹配）

- [ ] **Step 6: Commit**

```bash
git add client/electron/windowHistory.ts client/electron/windowHistory.test.ts
git commit -m "feat(window-recognition): 窗口选择记忆层（标题模板hash+boost+LRU）"
```

---

## Task 9: 记忆 IPC（通道登记 + handler）+ 评分接入记忆 boost

**Files:**
- Modify: `client/electron/ipc/channels.ts`
- Modify: `client/electron/preload.ts`
- Modify: `client/electron/screenCaptureHandlers.ts`

- [ ] **Step 1: channels.ts 登记新通道**

`client/electron/ipc/channels.ts` 的「采集相关」区（`SCREEN_WINDOWS_CHANGED` 之后）新增：

```ts
  // 窗口选择记忆
  WINDOW_MEMORY_RECORD: 'window_memory_record',
  WINDOW_MEMORY_CLEAR: 'window_memory_clear',
```

- [ ] **Step 2: preload.ts 白名单登记**

`client/electron/preload.ts` 的 `'screen_watch_windows_stop'` 之后新增：

```ts
  'window_memory_record',
  'window_memory_clear',
```

- [ ] **Step 3: screenCaptureHandlers 注册两个 handler**

`registerScreenCaptureHandlers()` 中 `screen_watch_windows_stop` 之后新增（保持既有 `safeHandle` 模式）：

```ts
  safeHandle('window_memory_record', async (_event, payload: { processName?: string; title?: string; courseName?: string }) => {
    const processName = typeof payload?.processName === 'string' ? payload.processName : '';
    const title = typeof payload?.title === 'string' ? payload.title : '';
    if (!processName || !title) {
      return { success: false }; // 入参校验：进程名与标题必填
    }
    const courseName = typeof payload?.courseName === 'string' ? payload.courseName : undefined;
    recordChoice(processName, title, courseName);
    return { success: true };
  });

  safeHandle('window_memory_clear', async () => {
    clearMemory();
    return { success: true };
  });
```

文件头部 import 补充：

```ts
import { recordChoice, clearMemory, lookupMemory } from './windowHistory.js';
```

- [ ] **Step 4: 评分接入记忆 boost**

`screenCaptureHandlers.ts` 中两处 `scoreAndFilterWindows` 调用（screen_list_windows 与 watch 推送）统一改为：

```ts
const scored = scoreAndFilterWindows(rawWindows, {
  signalsBySourceId: buildSignalMap(sources),
  memoryLookup: (processName, title) => {
    const entry = lookupMemory(processName, title);
    if (!entry) return null;
    return {
      courseName: entry.courseName,
      boost: computeMemoryBoost(entry, Date.now()),
    };
  },
});
```

import 补充：

```ts
import { computeMemoryBoost } from './windowHistory.js';
```

- [ ] **Step 5: 编译与测试验证**

Run: `cd client && npm run typecheck:electron && npx vitest run electron/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add client/electron/ipc/channels.ts client/electron/preload.ts client/electron/screenCaptureHandlers.ts
git commit -m "feat(window-recognition): 记忆IPC通道与评分boost接入"
```

---

## Task 10: captureTypes.ts 类型扩展（渲染层契约）

**Files:**
- Modify: `client/src/lib/capture/captureTypes.ts`

- [ ] **Step 1: 扩展 WindowInfo 与 CourseMeta.detectedBy**

`client/src/lib/capture/captureTypes.ts` 的 `WindowInfo`（约 L117）扩展：

```ts
// 可捕获窗口信息（screen_list_windows 返回）
export interface WindowInfo {
  id: string;
  title: string;
  thumbnail?: string;          // base64 缩略图
  score?: number;              // 推荐分数（关键词匹配）
  matched?: string;            // 命中的关键词（用于显示推荐理由）
  processName?: string;        // 进程可执行文件名（native 可用时）
  confidence?: 'low' | 'medium' | 'high'; // 评分置信度
  reasons?: string[];          // 命中理由（双向评分）
  learningScore?: number;      // 未被娱乐负分主导的学习分
  memoryCourseName?: string;   // 记忆命中的课程名（可回填）
  isForeground?: boolean;      // 是否前台窗口
}
```

`CourseMeta.detectedBy`（约 L113）类型扩展：

```ts
  detectedBy?: 'manual' | 'window_title' | 'ai' | 'memory';  // 来源标识（memory=窗口记忆回填）
```

- [ ] **Step 2: 类型检查**

Run: `cd client && npm run typecheck`
Expected: PASS（字段全部可选，既有消费方不受影响）

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/capture/captureTypes.ts
git commit -m "feat(window-recognition): WindowInfo 类型扩展（置信度/理由/记忆课程名）"
```

---

## Task 11: useWindowWatcher 自动选中 + 记忆回填 + 测试

**Files:**
- Modify: `client/src/features/classroom/hooks/useWindowWatcher.ts`
- Test: `client/src/features/classroom/hooks/useWindowWatcher.test.ts`

- [ ] **Step 1: 写失败测试（自动选中三规则）**

Create `client/src/features/classroom/hooks/useWindowWatcher.test.ts`：

```ts
/**
 * 窗口监听 hook 测试：自动选中三规则与课程名回填
 * @ai-context: mock window.electronAPI；仅验证自动选中评估逻辑（窗口列表变化时
 * 未选中 → 按 high/前台/唯一候选规则自动选中并通知）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowWatcher } from './useWindowWatcher';

const invokeMock = vi.fn();
const onMock = vi.fn(() => () => {});
const notifyMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { electronAPI: unknown }).electronAPI = {
    invoke: invokeMock,
    on: onMock,
  };
  invokeMock.mockResolvedValue([]);
});

function makeWindow(id: string, overrides: Record<string, unknown> = {}) {
  return { id, title: `win-${id}`, score: 0, ...overrides };
}

function setup(initialWindows: unknown[] = []) {
  return renderHook(() =>
    useWindowWatcher({
      courseMeta: { courseName: undefined as string | undefined },
      setCourseMeta: () => {},
      onNotify: notifyMock,
    }),
  );
}

describe('useWindowWatcher — 自动选中', () => {
  it('high 置信度 top1 自动选中并 toast', async () => {
    const { result } = setup();
    const high = makeWindow('w1', { score: 150, confidence: 'high', processName: 'wemeet.exe', reasons: ['学习意图'] });
    invokeMock.mockResolvedValue([high, makeWindow('w2', { score: 20 })]);

    await act(async () => {
      onMock.mock.calls.forEach(([channel, cb]) => {
        if (channel === 'screen_windows_changed') cb(null, [high, makeWindow('w2', { score: 20 })]);
      });
    });

    await waitFor(() => {
      expect(result.current.selectedWindow?.id).toBe('w1');
    });
    expect(notifyMock).toHaveBeenCalledWith('success', expect.stringContaining('w1'));
  });

  it('前台窗口 + 唯一候选自动选中（无记忆）', async () => {
    const { result } = setup();
    const fg = makeWindow('w1', { score: 90, confidence: 'medium', isForeground: true, processName: 'chrome.exe' });
    const others = [makeWindow('w2', { score: 10 })];

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [fg, ...others]));
    });

    await waitFor(() => {
      expect(result.current.selectedWindow?.id).toBe('w1');
    });
  });

  it('medium 且无记忆且非唯一候选 → 不自动选中', async () => {
    const { result } = setup();
    const med = makeWindow('w1', { score: 80, confidence: 'medium', processName: 'chrome.exe' });
    const med2 = makeWindow('w2', { score: 75, confidence: 'medium', processName: 'msedge.exe' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [med, med2]));
    });

    await waitFor(() => {
      expect(result.current.selectedWindow).toBeNull();
    });
  });

  it('已有选中时不覆盖（不重复 toast）', async () => {
    const { result } = setup();
    const high = makeWindow('w1', { score: 150, confidence: 'high' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [high]));
    });
    result.current.setSelectedWindow(makeWindow('w2', { score: 5 }));

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [high, makeWindow('w3', { score: 5 })]));
    });

    expect(result.current.selectedWindow?.id).toBe('w2');
  });

  it('记忆课程名回填 courseName（detectedBy=memory）', async () => {
    const setCourseMeta = vi.fn();
    renderHook(() =>
      useWindowWatcher({
        courseMeta: { courseName: undefined as string | undefined },
        setCourseMeta,
        onNotify: notifyMock,
      }),
    );
    const mem = makeWindow('w1', { score: 150, confidence: 'high', memoryCourseName: '高等数学' });

    await act(async () => {
      onMock.mock.calls.forEach(([, cb]) => cb(null, [mem]));
    });

    expect(setCourseMeta).toHaveBeenCalledWith(expect.objectContaining({ courseName: '高等数学', detectedBy: 'memory' }));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run src/features/classroom/hooks/useWindowWatcher.test.ts`
Expected: FAIL（无自动选中逻辑）

- [ ] **Step 3: 实现自动选中逻辑**

修改 `client/src/features/classroom/hooks/useWindowWatcher.ts`：

在 `screen_windows_changed` 订阅 effect 之后新增自动选中评估 effect：

```ts
  // 自动选中评估（三规则）：仅在未选中窗口时评估，避免覆盖用户选择与重复 toast
  useEffect(() => {
    if (selectedWindow || windows.length === 0) return;
    const top = windows[0];
    if (!top) return;

    // 唯一视频类候选：learningScore >= 60 的窗口仅此一个
    const uniqueCandidates = windows.filter((w) => (w.learningScore ?? 0) >= 60);
    const isUnique = uniqueCandidates.length === 1 && uniqueCandidates[0].id === top.id;

    const rule1 = top.confidence === 'high';
    const rule2 =
      !!top.isForeground &&
      (top.score ?? 0) >= 60 &&
      (!!top.memoryCourseName || isUnique);
    const rule3 =
      top.confidence === 'medium' &&
      !!top.memoryCourseName &&
      isUnique;

    if (!(rule1 || rule2 || rule3)) return;

    setSelectedWindow(top);
    onNotify('success', `已自动选择：${top.title}`);

    // 记录记忆（自动选中同样累加 useCount——用户接受默认即正反馈）
    if (top.processName) {
      window.electronAPI?.invoke('window_memory_record', {
        processName: top.processName,
        title: top.title,
        courseName: courseMeta.courseName,
      }).catch(() => {});
    }

    // 记忆课程名回填（优先级最高；无记忆时由 AI 首帧/正则兜底）
    if (top.memoryCourseName && !courseMeta.courseName) {
      setCourseMeta((prev) => ({ ...prev, courseName: top.memoryCourseName, detectedBy: 'memory' }));
    }
  }, [windows, selectedWindow, courseMeta.courseName, onNotify, setCourseMeta]);
```

注：hook 返回中已有 `setSelectedWindow`；课程名正则提取 effect（现有）保留为兜底，其条件 `!courseMeta.courseName` 保证记忆回填后不再覆盖。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run src/features/classroom/hooks/useWindowWatcher.test.ts`
Expected: PASS

- [ ] **Step 5: 类型检查与全量测试**

Run: `cd client && npm run typecheck && npm run test`
Expected: PASS（无回归）

- [ ] **Step 6: Commit**

```bash
git add client/src/features/classroom/hooks/useWindowWatcher.ts client/src/features/classroom/hooks/useWindowWatcher.test.ts
git commit -m "feat(window-recognition): 自动选中三规则与记忆课程名回填"
```

---

## Task 12: WindowSelectCard UI（reasons 展示 + 自动选中态）

**Files:**
- Modify: `client/src/features/classroom/components/WindowSelectCard.tsx`

- [ ] **Step 1: 展示 reasons 替代单值 matched**

`WindowSelectCard.tsx` 中窗口条目的匹配文案区（约 L44）与已选卡片区（约 L115）改为：

```tsx
{win.reasons?.[0] && (
  <span className="text-[10px] text-brand-500 leading-tight">推荐：{win.reasons[0]}</span>
)}
```

（`matched` 字段仍由主进程填充，保留兼容；优先展示 `reasons[0]`）

- [ ] **Step 2: 自动选中态视觉提示**

已选卡片（`selected` 分支）在标题前增加自动识别标记（当 `selected.confidence === 'high'` 或存在 `memoryCourseName` 时）：

```tsx
{selected.confidence === 'high' && (
  <span className="text-[10px] font-medium text-brand-600 flex-shrink-0">自动识别</span>
)}
```

- [ ] **Step 3: 编译验证**

Run: `cd client && npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/src/features/classroom/components/WindowSelectCard.tsx
git commit -m "feat(window-recognition): 窗口卡片展示推荐理由与自动识别标记"
```

---

## Task 13: contentClassifier 进程信号 + 测试扩展

**Files:**
- Modify: `client/src/lib/capture/contentClassifier.ts`
- Test: `client/src/lib/capture/contentClassifier.test.ts`（扩展）

- [ ] **Step 1: 扩展失败测试**

`client/src/lib/capture/contentClassifier.test.ts` 追加 describe 块：

```ts
describe('classifyByTitle — 进程名信号', () => {
  it('进程名命中软件名单 → software_skill（标题无特征词）', () => {
    expect(classifyByTitle('随便看看', 'photoshop.exe')).toBe('software_skill');
    expect(classifyByTitle('随便看看', 'obs64.exe')).toBe('software_skill');
    expect(classifyByTitle('随便看看', 'code.exe')).toBe('software_skill');
  });
  it('游戏/直播进程不误判，交给标题判定', () => {
    expect(classifyByTitle('随便看看', 'steam.exe')).toBe('unknown');
    expect(classifyByTitle('只狼全 Boss 打法教学', 'steam.exe')).not.toBe('unknown');
  });
  it('非软件进程保持原行为', () => {
    expect(classifyByTitle('高等数学全程课程', 'chrome.exe')).toBe('course');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd client && npx vitest run src/lib/capture/contentClassifier.test.ts`
Expected: FAIL（`classifyByTitle` 不支持第二参）

- [ ] **Step 3: 实现 processName 信号**

修改 `client/src/lib/capture/contentClassifier.ts`：

在 `SOFTWARE_TITLE_RE` 常量附近新增：

```ts
/** 软件技能进程名单（标题无特征词时，进程名兜底判定；Windows） */
const SOFTWARE_PROCESS_RE =
  /photoshop|premiere|afterfx|illustrator|lightroom|剪映|obs64|blender|figma|sketch|unity|unreal|code\.exe|pycharm|intellij|webstorm|notepad\+\+|wps\.exe/i;
```

`classifyByTitle` 签名与实现更新：

```ts
/** 窗口标题单独分类（无转写信号时）；processName 为可选进程信号（Windows） */
export function classifyByTitle(title: string, processName?: string): ContentKind {
  const t = (title ?? '').trim();
  if (!t) return 'unknown';
  // 讲座/会议类优先（"AI 开发者大会"含"开发"字样但属讲座场景，需先于软件判定）
  if (LECTURE_TITLE_RE.test(t)) return 'lecture';
  if (SOFTWARE_TITLE_RE.test(t)) return 'software_skill';
  if (CRAFT_TITLE_RE.test(t)) return 'craft_skill';
  // 进程名兜底：软件技能进程（如 PS/剪辑/IDE）在标题无特征词时判为软件技能
  if (processName && SOFTWARE_PROCESS_RE.test(processName)) return 'software_skill';
  // 标题含"教程/课程/课堂/教学"默认按知识授课（视频站标题高频形态）
  if (/教程|课程|课堂|教学|网课/i.test(t)) return 'course';
  return 'unknown';
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd client && npx vitest run src/lib/capture/contentClassifier.test.ts`
Expected: PASS

- [ ] **Step 5: 调用方接线（把进程名传入分类）**

`classifyContent` 签名增加第三参透传：

```ts
export function classifyContent(
  windowTitle: string,
  transcriptText: string,
  processName?: string,
): ClassificationResult {
  const byTitle = classifyByTitle(windowTitle, processName);
  if (byTitle !== 'unknown') return { kind: byTitle, source: 'title' };
  const byTranscript = classifyByTranscript(transcriptText);
  if (byTranscript !== 'unknown') return { kind: byTranscript, source: 'transcript' };
  return { kind: 'unknown', source: 'none' };
}
```

调用处（`useClassroomEvents.ts`）：在 `UseClassroomEventsOptions` 增加可选 `windowProcessName?: string`，由 `useClassroomCapture` 从 `selectedWindow.processName` 传入，分类调用改为：

```ts
classifyContent(windowTitle ?? '', transcriptText, windowProcessName)
```

- [ ] **Step 6: 类型检查与全量测试**

Run: `cd client && npm run typecheck && npm run test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add client/src/lib/capture/contentClassifier.ts client/src/lib/capture/contentClassifier.test.ts
git commit -m "feat(window-recognition): 内容分类接入进程名信号（软件名单兜底）"
```

---

## Task 14: 监听 diff 升级（标题变化触发）+ 课程名正则补充

**Files:**
- Modify: `client/electron/screenCaptureHandlers.ts`
- Modify: `client/src/features/classroom/hooks/useWindowWatcher.ts`

- [ ] **Step 1: 监听 diff 从 id 集合升级为 id|title 集合**

`client/electron/screenCaptureHandlers.ts`：

模块状态（L53）替换：

```ts
/** 上一次窗口列表的 id|title 键集合（用于 diff 检测变化——标题变化同样触发推送） */
let lastWindowKeys: Set<string> = new Set();
```

watch 轮询内（L218-226 区域）替换：

```ts
        // 检测是否有变化（新增/关闭窗口或标题变化——如会议未读角标、网页标题更新）
        const currentKeys = new Set(sources.map((s) => `${s.id}|${s.name}`));
        const hasChanged =
          currentKeys.size !== lastWindowKeys.size ||
          [...currentKeys].some((k) => !lastWindowKeys.has(k));

        if (hasChanged) {
          lastWindowKeys = currentKeys;
```

`screen_watch_windows_stop` handler 内（L256）同步替换：

```ts
      lastWindowKeys = new Set();
```

- [ ] **Step 2: 课程名正则补充攻略类词**

`client/src/features/classroom/hooks/useWindowWatcher.ts` 的 `COURSE_KEYWORDS` 补充：

```ts
/** 常见课程名关键词（规则模式兜底提取；含攻略/教程形态） */
const COURSE_KEYWORDS = /((?:高等数学|线性代数|概率论|大学物理|数据结构|操作系统|编译原理|离散数学|复变函数|英语|高数|大物|C语言|Python|Java|机器学习|深度学习|人工智能|计算机网络|数据库|入门|进阶|实战|从零|攻略|教程)[^\s|]*)/;
```

- [ ] **Step 3: 编译与测试验证**

Run: `cd client && npm run typecheck:electron && npm run typecheck && npm run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add client/electron/screenCaptureHandlers.ts client/src/features/classroom/hooks/useWindowWatcher.ts
git commit -m "feat(window-recognition): 监听diff含标题变化；课程名正则补攻略形态"
```

---

## Task 15: 全量门禁验证与收尾

**Files:**
- None（仅验证）

- [ ] **Step 1: 客户端全量门禁**

Run: `cd client && npm run check`
Expected: PASS（lint + typecheck ×2 + 全部测试）

- [ ] **Step 2: 原生模块编译复验**

Run: `cd client && npm run native:build`
Expected: 编译成功

- [ ] **Step 3: 仓库级文档检查**

Run: `cd <repo-root> && npm run docs:check`
Expected: PASS（新设计文档/计划文档通过链接与命名检查；如计划文档未收录，按 docs 规范补登记）

- [ ] **Step 4: 对照设计文档逐项核对（Spec coverage）**

核对清单（全部实现）：
- [ ] 双向评分（学习意图 +60 / 娱乐 −30~−40 对冲）→ Task 2
- [ ] 系统黑名单（进程新增、宽泛标题词移除）→ Task 2
- [ ] 信号层（HWND/进程/几何/前台，注入式降级）→ Task 3、7
- [ ] windowScorer 组合入口导出兼容 → Task 4
- [ ] native 扩展（rect/置顶/前台 HWND）→ Task 6
- [ ] 记忆层（模板 hash/boost/LRU/记录/查询/清空）→ Task 8、9
- [ ] 自动选中三规则 + toast 可更换 + 唯一候选定义 → Task 11
- [ ] WindowInfo 类型扩展（含 detectedBy 'memory'）→ Task 10
- [ ] 课程名回填优先级（记忆 > AI > 正则）→ Task 11（回填）+ Task 14（正则补充）
- [ ] 热词词表自动加载（课程名回填联动，P1-3 既有机制零改动）→ 人工回归：自动选中带 memoryCourseName 的窗口 → 课程名回填 → 热词词表切换
- [ ] contentClassifier 进程信号 → Task 13
- [ ] 监听 diff 含标题变化 → Task 14
- [ ] 错误降级（native 缺失纯标题/记忆失败静默/前台失败跳过）→ Task 3、7、8 实现内

- [ ] **Step 5: Commit（如 Step 4 有补充改动）**

```bash
git add -A
git commit -m "chore(window-recognition): 全量门禁验证通过"
```
