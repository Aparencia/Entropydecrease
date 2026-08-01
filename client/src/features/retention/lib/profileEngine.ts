/**
 * 学习画像规则引擎
 * Learning profile rule engine
 *
 * @ai-context: 基于 aggregator.ts 已有数据（热力图、雷达、趋势）生成模板化
 * 洞察和身份标签。离线可用，无需网络。AI 深度分析为可选增强。
 * @ai-context: Generates templated insights and identity tags from existing
 * aggregator data (heatmap, radar, trend). Offline-capable, no network needed.
 */
import type { ProfileInsight, IdentityTag } from '../types';
import type { HeatmapCell, RadarDimension, TrendPoint } from '@/features/dashboard/types/analytics';

const DOW_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// ─── 洞察生成 / Insight generation ─────────────────────────────────

/**
 * 从热力图生成时间洞察
 * Generate time insights from heatmap
 */
export function generateTimeInsights(heatmap: HeatmapCell[]): ProfileInsight[] {
  const insights: ProfileInsight[] = [];
  const nonZero = heatmap.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  if (nonZero.length > 0) {
    const top = nonZero[0];
    insights.push({
      id: 'peak-time',
      category: 'time',
      text: `你在${DOW_LABELS[top.dayOfWeek]} ${top.hour}:00 最专注，累计 ${top.value} 分钟`,
      value: top.value,
    });
  }

  // 早起 vs 夜猫 / Early bird vs night owl
  const morningMin = heatmap.filter((c) => c.hour >= 6 && c.hour < 12).reduce((s, c) => s + c.value, 0);
  const eveningMin = heatmap.filter((c) => c.hour >= 20 && c.hour < 24).reduce((s, c) => s + c.value, 0);
  if (morningMin + eveningMin > 60) {
    const isMorning = morningMin > eveningMin;
    insights.push({
      id: 'chronotype',
      category: 'time',
      text: isMorning ? '你是晨间学习者，上午效率最高' : '你是夜间学习者，深夜是你的黄金时段',
      value: isMorning ? morningMin : eveningMin,
    });
  }

  return insights;
}

/**
 * 从趋势数据生成持续性洞察
 * Generate consistency insights from trend data
 */
export function generateConsistencyInsights(trend: TrendPoint[]): ProfileInsight[] {
  const insights: ProfileInsight[] = [];
  const activeDays = trend.filter((t) => t.value > 0).length;
  const totalDays = trend.length;

  if (totalDays > 0) {
    const rate = Math.round((activeDays / totalDays) * 100);
    insights.push({
      id: 'active-rate',
      category: 'consistency',
      text: `近 ${totalDays} 天中你有 ${activeDays} 天在学习（${rate}% 出勤率）`,
      value: rate,
    });
  }

  // 周趋势 / Weekly trend
  if (trend.length >= 14) {
    const firstWeek = trend.slice(0, 7).reduce((s, t) => s + t.value, 0);
    const lastWeek = trend.slice(-7).reduce((s, t) => s + t.value, 0);
    if (firstWeek > 0) {
      const change = Math.round(((lastWeek - firstWeek) / firstWeek) * 100);
      if (Math.abs(change) >= 10) {
        insights.push({
          id: 'weekly-trend',
          category: 'consistency',
          text: change > 0
            ? `本周学习时长比上周增加了 ${change}%，势头很好`
            : `本周学习时长比上周减少了 ${Math.abs(change)}%，适当调整节奏`,
          value: change,
        });
      }
    }
  }

  return insights;
}

/**
 * 从雷达数据生成效率洞察
 * Generate efficiency insights from radar data
 */
export function generateEfficiencyInsights(radar: RadarDimension[]): ProfileInsight[] {
  const insights: ProfileInsight[] = [];
  const focus = radar.find((r) => r.dimension === 'focus');
  const breadth = radar.find((r) => r.dimension === 'breadth');

  if (focus && focus.value >= 70) {
    insights.push({
      id: 'high-focus',
      category: 'efficiency',
      text: `你的专注度达到 ${focus.value}%，深潜质量很高`,
      value: focus.value,
    });
  }

  if (breadth && breadth.value >= 50) {
    insights.push({
      id: 'breadth',
      category: 'breadth',
      text: '你涉猎了多个学科领域，知识网络正在扩展',
      value: breadth.value,
    });
  }

  return insights;
}

// ─── 身份标签 / Identity tags ──────────────────────────────────────

/** 身份标签定义 / Identity tag definitions */
const IDENTITY_TAG_DEFS: Omit<IdentityTag, 'unlocked'>[] = [
  { key: 'deep_explorer', title: '深海探索者', description: '累计专注 100 小时', threshold: '100h 专注' },
  { key: 'knowledge_weaver', title: '知识编织者', description: '完成 50 个费曼讲解', threshold: '50 次费曼' },
  { key: 'memory_guardian', title: '记忆守护者', description: '累计复习 500 张闪卡', threshold: '500 次复习' },
  { key: 'consistent_diver', title: '持续潜行者', description: '连续 30 天学习', threshold: '30 天连续' },
  { key: 'coral_gardener', title: '珊瑚园丁', description: '培育 20 株珊瑚', threshold: '20 株珊瑚' },
  { key: 'abyss_walker', title: '深渊行者', description: '累计深度超过 4000m', threshold: '4000m 深度' },
];

/**
 * 计算身份标签解锁状态
 * Calculate identity tag unlock status
 */
export function computeIdentityTags(stats: {
  totalFocusMinutes: number;
  feynmanCompleted: number;
  totalReviews: number;
  longestStreak: number;
  coralCount: number;
  totalDepth: number;
}): IdentityTag[] {
  return IDENTITY_TAG_DEFS.map((def) => {
    let unlocked = false;
    switch (def.key) {
      case 'deep_explorer': unlocked = stats.totalFocusMinutes >= 6000; break;
      case 'knowledge_weaver': unlocked = stats.feynmanCompleted >= 50; break;
      case 'memory_guardian': unlocked = stats.totalReviews >= 500; break;
      case 'consistent_diver': unlocked = stats.longestStreak >= 30; break;
      case 'coral_gardener': unlocked = stats.coralCount >= 20; break;
      case 'abyss_walker': unlocked = stats.totalDepth >= 4000; break;
    }
    return { ...def, unlocked };
  });
}
