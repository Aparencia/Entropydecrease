/**
 * @ai-context: 本地规则时长推荐引擎——AI 降级链的最终兜底（离线可用，永不失败）。
 */
import type { DurationResult, DurationHistoryData, DurationOptions } from './types';

/**
 * 本地深潜时长推荐引擎
 * 基于历史数据的简单规则引擎，无需网络
 */
export class LocalDurationRecommender {
  recommend(historyData: DurationHistoryData, options?: DurationOptions): DurationResult {
    const minDuration = options?.minDuration || 15;
    const maxDuration = options?.maxDuration || 60;

    const sessions = historyData.sessions || [];
    
    if (sessions.length === 0) {
      return {
        recommendedDuration: 25, // 默认深潜
        reasoning: '暂无历史数据，推荐使用标准深潜时长 25 分钟',
        confidence: 'low',
        isLocalFallback: true,
      };
    }

    // 计算完成会话的平均时长
    const completedSessions = sessions.filter(s => s.completed);
    if (completedSessions.length === 0) {
      return {
        recommendedDuration: Math.min(20, maxDuration),
        reasoning: '暂无完整完成的专注记录，建议从较短时长开始',
        confidence: 'low',
        isLocalFallback: true,
      };
    }

    const avgDuration = completedSessions.reduce((sum, s) => sum + s.duration, 0) / completedSessions.length;
    const completionRate = completedSessions.length / sessions.length;

    let recommended: number;
    let reasoning: string;

    if (completionRate >= 0.8) {
      // 高完成率，可以尝试稍微增加
      recommended = Math.min(Math.round(avgDuration * 1.1), maxDuration);
      reasoning = `基于您 ${completedSessions.length} 次专注记录（完成率 ${Math.round(completionRate * 100)}%），建议适当增加时长`;
    } else if (completionRate >= 0.5) {
      // 中等完成率，保持平均
      recommended = Math.round(avgDuration);
      reasoning = `基于您的专注记录，建议保持当前平均时长`;
    } else {
      // 低完成率，建议缩短
      recommended = Math.max(Math.round(avgDuration * 0.8), minDuration);
      reasoning = `完成率较低（${Math.round(completionRate * 100)}%），建议适当缩短专注时长`;
    }

    recommended = Math.max(minDuration, Math.min(maxDuration, recommended));

    return {
      recommendedDuration: recommended,
      reasoning,
      confidence: 'medium',
      isLocalFallback: true,
    };
  }
}

/**
 * 本地降级提示生成器
 * 当 AI 服务不可用时，为摘要/反衰减呼吸/评估功能生成友好提示
 */
export function getLocalFallbackMessage(feature: 'summarize' | 'flashcard' | 'evaluate' | 'optimize_card'): {
  available: false;
  message: string;
  suggestion: string;
} {
  const messages: Record<string, { message: string; suggestion: string }> = {
    summarize: {
      message: 'AI 摘要服务暂时不可用',
      suggestion: '您可以尝试手动提取笔记中的关键段落作为摘要',
    },
    flashcard: {
      message: 'AI 闪卡生成服务暂时不可用',
      suggestion: '您可以手动将笔记中的重要概念制作为闪卡',
    },
    evaluate: {
      message: 'AI 费曼评估服务暂时不可用',
      suggestion: '您可以尝试将讲解录音后回听，自行评估理解程度',
    },
    optimize_card: {
      message: 'AI 闪卡优化服务暂时不可用',
      suggestion: '您可以尝试手动精简闪卡内容，使其更易于记忆',
    },
  };

  return { available: false, ...messages[feature] };
}
