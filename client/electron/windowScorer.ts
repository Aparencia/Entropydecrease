/**
 * 窗口智能评分与过滤模块
 *
 * 基于关键词匹配对 desktopCapturer 返回的窗口列表进行评分和排序，
 * 过滤系统/不可见窗口，将最可能是网课/直播/会议的窗口排在前面。
 * 仅针对 Windows 平台优化关键词列表。
 *
 * @ai-context: 采集窗口智能评分过滤：排除自身窗口（含旧品牌'课伴'关键词——防旧版本窗口被采集，为兼容保留勿删）与系统窗口。
 */

// ================================================================
// 类型定义
// ================================================================

export interface ScoredWindow {
  id: string;
  title: string;
  thumbnail: string;
  score: number;
  matched?: string; // 命中的关键词（用于前端显示推荐理由）
}

// ================================================================
// 关键词评分规则
// ================================================================

const SCORE_RULES = {
  /** 高优先级：网课/直播/会议关键词 (+100) */
  highPriority: [
    '网课', '直播', '课程', '课堂', '学习', '讲座', '培训',
    '腾讯会议', '钉钉', 'Zoom', 'Teams', 'Meet', 'Webex',
    '中国大学MOOC', '学堂在线', '智慧树', '学习通', '雨课堂',
    'Bilibili', '哔哩哔哩', 'YouTube', '网易公开课',
    'Coursera', 'edX', 'Udemy',
  ],
  /** 中优先级：浏览器/视频播放器 (+50) */
  mediumPriority: [
    'Chrome', 'Edge', 'Firefox', 'Brave', 'Opera',
    'PotPlayer', 'VLC', 'mpv', 'Windows Media',
    'EV录屏', 'OBS', 'MPC-HC',
  ],
  /** 黑名单：系统/工具窗口（直接过滤） */
  blacklist: [
    'Program Manager',
    'Taskbar',
    'Settings',
    '设置',
    'Windows Input Experience',
    'MSCTFIME',
    'Default IME',
    'Electron',
    'Entropy decrease',
    '课伴',
    '熵减',
  ],
} as const;

const HIGH_SCORE = 100;
const MEDIUM_SCORE = 50;

// ================================================================
// 评分逻辑
// ================================================================

/**
 * 对窗口标题进行关键词匹配评分
 * @returns score 和 matched 关键词，若命中黑名单返回 null
 */
function scoreTitle(title: string): { score: number; matched?: string } | null {
  const lowerTitle = title.toLowerCase();

  // 黑名单检测
  for (const keyword of SCORE_RULES.blacklist) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      return null; // 过滤
    }
  }

  // 高优先级匹配
  for (const keyword of SCORE_RULES.highPriority) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      return { score: HIGH_SCORE, matched: keyword };
    }
  }

  // 中优先级匹配
  for (const keyword of SCORE_RULES.mediumPriority) {
    if (lowerTitle.includes(keyword.toLowerCase())) {
      return { score: MEDIUM_SCORE, matched: keyword };
    }
  }

  // 无匹配，基础分 0
  return { score: 0 };
}

/**
 * 对窗口列表进行评分、过滤和排序
 * @param windows 原始窗口列表（来自 desktopCapturer）
 * @returns 过滤并排序后的窗口列表（降序）
 */
export function scoreAndFilterWindows(
  windows: { id: string; title: string; thumbnail: string }[],
): ScoredWindow[] {
  const scored: ScoredWindow[] = [];

  for (const win of windows) {
    // 过滤空标题窗口
    if (!win.title || win.title.trim() === '') continue;

    const result = scoreTitle(win.title);
    if (result === null) continue; // 命中黑名单

    scored.push({
      id: win.id,
      title: win.title,
      thumbnail: win.thumbnail,
      score: result.score,
      matched: result.matched,
    });
  }

  // 按 score 降序排列，同分按 id 稳定排序
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  return scored;
}
