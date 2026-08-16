/**
 * 课堂内容类型感知（P1-6 规则版分类器）
 *
 * @ai-context: 识别链路的内容类型分类：course（知识授课）/ software_skill
 * （软件技能：PS/剪辑/编程）/ craft_skill（手法技巧：化妆/拍照/手工）/
 * lecture（讲座）。规则版：窗口标题关键词优先，转写术语证据兜底；分类
 * 结果驱动采样参数（技能类提高采样频率）与产物形态（P2-7 步骤化笔记）。
 * P2-5 将以 VLM 分类器替换规则版（本文件保留为回退）。
 * @ai-context EN: Rule-based content classifier for the recognition chain.
 * Window-title keywords take priority, transcript cues fall back. The kind
 * drives sampling parameters (denser for skill videos) and the note product
 * form (step cards in P2-7). Replaced by a VLM classifier in P2-5.
 */
import type { SmartSamplerConfig } from './smartSampler';

/** 内容类型 */
export type ContentKind = 'course' | 'software_skill' | 'craft_skill' | 'lecture' | 'unknown';

// ================================================================
// 窗口标题关键词规则
// ================================================================

/** 软件技能工具名（标题命中 → software_skill） */
const SOFTWARE_TITLE_RE =
  /photoshop|premiere|after\s?effects|illustrator|lightroom|剪映|剪辑|达芬奇|blender|figma|sketch|unity|unreal|excel|word|ppt|powerpoint|wps|python|java|编程|代码|前端|后端|vue|react|node|sql|ui设计|摄影后期|ps\s*教程|pr\s*教程|ae\s*教程|ai\s*教程/i;

/** 手法技巧类（标题命中 → craft_skill） */
const CRAFT_TITLE_RE =
  /化妆|彩妆|护肤|发型|美甲|拍照|摄影|绘画|素描|水彩|书法|手工|折纸|编织|烘焙|做饭|厨艺|健身|瑜伽|普拉提|舞蹈|乐器|吉他|钢琴|小提琴|声乐|发音|演讲技巧/i;

/** 讲座/会议类（标题命中 → lecture） */
const LECTURE_TITLE_RE =
  /讲座|演讲|发布会|报告|论坛|会议|访谈|大师课|公开课/i;

/** 软件技能进程名单（标题无特征词时，进程名兜底判定；Windows） */
const SOFTWARE_PROCESS_RE =
  /photoshop|premiere|afterfx|illustrator|lightroom|剪映|obs64|blender|figma|sketch|unity|unreal|code\.exe|pycharm|intellij|webstorm|notepad\+\+|wps\.exe/i;

// ================================================================
// 转写术语证据规则
// ================================================================

/** 软件技能证据词（转写中出现 → software_skill 证据） */
const SOFTWARE_CUES = [
  '点击', '拖到', '拖拽', '图层', '面板', '参数', '快捷键', '按钮', '菜单',
  '插件', '导出', '导入', '渲染', '时间轴', '关键帧', '画布', '选区', '滤镜',
];

/** 手法技巧证据词（转写中出现 → craft_skill 证据） */
const CRAFT_CUES = [
  '手法', '力度', '角度', '姿势', '手腕', '手指', '重心', '呼吸', '节奏感',
  '皮肤', '轮廓', '光线', '构图', '调色',
];

/** 授课类证据词（转写中出现 → course 证据） */
const COURSE_CUES = [
  '定理', '公式', '概念', '定义', '例题', '习题', '考试', '知识点', '推导',
  '证明', '结论',
];

// ================================================================
// 分类逻辑
// ================================================================

/** 窗口标题单独分类（无转写信号时） */
export function classifyByTitle(title: string, processName?: string): ContentKind {
  const t = (title ?? '').trim();
  if (!t) return 'unknown';
  // 讲座/会议类优先（"AI 开发者大会"含"开发"字样但属讲座场景，需先于软件判定）
  if (LECTURE_TITLE_RE.test(t)) return 'lecture';
  if (SOFTWARE_TITLE_RE.test(t)) return 'software_skill';
  if (CRAFT_TITLE_RE.test(t)) return 'craft_skill';
  // 进程名兜底：软件技能进程在标题无特征词时判为软件技能
  if (processName && SOFTWARE_PROCESS_RE.test(processName)) return 'software_skill';
  // 标题含"教程/课程/课堂/教学"默认按知识授课（视频站标题高频形态）
  if (/教程|课程|课堂|教学|网课/i.test(t)) return 'course';
  return 'unknown';
}

/** 转写文本证据投票分类（各类证据词命中数，无命中 → unknown） */
export function classifyByTranscript(text: string): ContentKind {
  const t = (text ?? '').trim();
  if (!t) return 'unknown';
  const count = (cues: string[]) => cues.reduce((acc, c) => acc + (t.includes(c) ? 1 : 0), 0);
  const scores: Array<[ContentKind, number]> = [
    ['software_skill', count(SOFTWARE_CUES)],
    ['craft_skill', count(CRAFT_CUES)],
    ['course', count(COURSE_CUES)],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] === 0) return 'unknown';
  // 最高分需显著领先（≥2 或至少为次高的 2 倍），避免混合场景误判
  const [best, bestScore] = scores[0];
  const secondScore = scores[1][1];
  if (bestScore >= 2 || bestScore > secondScore * 2) return best;
  return 'unknown';
}

export interface ClassificationResult {
  kind: ContentKind;
  /** 分类信号来源：标题 / 转写 / 无信号 */
  source: 'title' | 'transcript' | 'none';
}

/**
 * 综合分类：标题优先，无标题信号时用转写证据。
 * 标题信号覆盖转写（窗口标题是用户主动选择的上下文，可信度更高）。
 */
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

// ================================================================
// 采样参数（分类驱动）
// ================================================================

/**
 * 技能类采样参数：界面操作转瞬即逝，定时兜底从 15s 收紧到 5s，
 * 变化阈值从 0.12 降至 0.05（捕捉按钮悬停/面板切换/数值微调）。
 * course/lecture 维持默认（静态 PPT 翻页节奏）。
 */
export const SKILL_SAMPLER_CONFIG: Partial<SmartSamplerConfig> = {
  changeThreshold: 0.05,
  periodicIntervalMs: 5_000,
};

/** 授课类默认采样参数（分类修正回 course 时恢复） */
export const COURSE_SAMPLER_CONFIG: Partial<SmartSamplerConfig> = {
  changeThreshold: 0.12,
  periodicIntervalMs: 15_000,
};

// ================================================================
// 指令句检测（P1-7 补帧触发）
// ================================================================

/** 操作指令模式（技能场景：教师口述操作时强制补抓画面） */
const COMMAND_PATTERNS: RegExp[] = [
  /(?:点击|单击|双击|右键|拖到|拖拽|拖动|拉到|选中|选择|打开|关闭|切换到|勾选|取消)/,
  /(?:设置为|调成|改成|改为|设成|输入|按下|按一下|调整|修改|删除|复制|粘贴)/,
  /(?:参数|数值|不透明度|曝光|对比度|饱和度|帧率|分辨率|字号)/,
];

/** 指令句检测：转写文本含操作指令词时返回 true（P1-7 补帧触发信号） */
export function hasCommandCue(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  return COMMAND_PATTERNS.some((re) => re.test(t));
}
