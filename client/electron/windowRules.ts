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
export const MEDIUM_CONFIDENCE_MIN = 25;

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
  'bilibili.exe', 'bililive.exe', 'youku.exe', 'iqiyi.exe',
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
  // 置顶 +10
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