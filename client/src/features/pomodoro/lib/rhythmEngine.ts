/**
 * 超昼夜节律自适应引擎（T1）
 *
 * @ai-context: 纯本地算法：按小时桶聚合历史专注会话的完成率，拟合个人
 * 时段效率曲线（注意力遵循 90-120 分钟波动周期，因人而异），输出当前
 * 时段的建议番茄时长——高峰期延长、低谷期缩短。数据不足时回退默认 25
 * 分钟，零 AI 依赖（本地优先原则）。
 */

/** 单条历史会话（与 DurationHistoryData.sessions 对齐） */
export interface RhythmSession {
  duration: number;     // 计划时长（分钟）
  completed: boolean;
  date: string;         // ISO 时间串
}

/** 小时桶效率数据 */
export interface HourBucket {
  hour: number;         // 0-23
  score: number;        // 加权完成率 0-1
  sampleCount: number;  // 样本数
}

/** 时段效率档位 */
export type EnergyLevel = 'low' | 'medium' | 'high';

/** 节律推荐结果 */
export interface RhythmRecommendation {
  minutes: number;
  level: EnergyLevel;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
}

const LOOKBACK_DAYS = 30;
const MIN_SAMPLES_FOR_FIT = 10;
/** 单桶最小样本数，低于此值的桶视为无数据 */
const MIN_BUCKET_SAMPLES = 2;

/**
 * 构建 24 小时效率曲线
 *
 * 权重策略：近 30 天内线性递减（与 adaptiveEngine 一致），
 * 完成率作为该时段的效率代理指标。
 */
export function buildHourlyCurve(sessions: RhythmSession[], now: Date = new Date()): HourBucket[] {
  const lookbackMs = LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const buckets = new Map<number, { weighted: number; weightTotal: number; count: number }>();

  for (const s of sessions) {
    const t = new Date(s.date).getTime();
    if (Number.isNaN(t)) continue;
    const age = now.getTime() - t;
    if (age < 0 || age > lookbackMs) continue;

    const hour = new Date(t).getHours();
    const weight = 1 - (age / lookbackMs) * 0.7; // 30 天内 1 → 0.3 线性递减
    const b = buckets.get(hour) ?? { weighted: 0, weightTotal: 0, count: 0 };
    b.weighted += (s.completed ? 1 : 0) * weight;
    b.weightTotal += weight;
    b.count += 1;
    buckets.set(hour, b);
  }

  const curve: HourBucket[] = [];
  for (let h = 0; h < 24; h++) {
    const b = buckets.get(h);
    curve.push({
      hour: h,
      score: b && b.weightTotal > 0 ? b.weighted / b.weightTotal : 0,
      sampleCount: b?.count ?? 0,
    });
  }
  return curve;
}

/**
 * 判定某小时的效率档位
 *
 * 以全局有效桶（样本 ≥ MIN_BUCKET_SAMPLES）的分数分布为基准：
 * 高于均值+0.15 为高峰，低于均值-0.15 为低谷，其余为平稳。
 */
export function getEnergyLevel(curve: HourBucket[], hour: number): EnergyLevel {
  const valid = curve.filter((b) => b.sampleCount >= MIN_BUCKET_SAMPLES);
  const current = curve[hour];
  if (valid.length < 3 || current.sampleCount < MIN_BUCKET_SAMPLES) return 'medium';

  const mean = valid.reduce((sum, b) => sum + b.score, 0) / valid.length;
  if (current.score >= mean + 0.15) return 'high';
  if (current.score <= mean - 0.15) return 'low';
  return 'medium';
}

/**
 * 推荐当前时段的番茄时长
 *
 * 高峰 35 分钟、平稳 25 分钟、低谷 18 分钟；
 * 数据不足（<10 条）时回退默认 25 分钟。
 */
export function recommendRhythmDuration(
  sessions: RhythmSession[],
  now: Date = new Date(),
): RhythmRecommendation {
  if (sessions.length < MIN_SAMPLES_FOR_FIT) {
    return {
      minutes: 25,
      level: 'medium',
      confidence: 'low',
      reasoning: '历史数据不足，暂用默认 25 分钟深潜',
    };
  }

  const curve = buildHourlyCurve(sessions, now);
  const hour = now.getHours();
  const level = getEnergyLevel(curve, hour);
  const bucket = curve[hour];

  const minutes = level === 'high' ? 35 : level === 'low' ? 18 : 25;
  const reasoning = level === 'high'
    ? `你在这个时段专注完成率较高，适合延长到 ${minutes} 分钟`
    : level === 'low'
      ? `这个时段你的完成率偏低，缩短到 ${minutes} 分钟更容易坚持`
      : `当前时段状态平稳，保持 ${minutes} 分钟节奏即可`;

  return {
    minutes,
    level,
    confidence: bucket.sampleCount >= 5 ? 'high' : 'medium',
    reasoning,
  };
}
