/**
 * 休息活动建议数据（自 DigitalWellbeingOverlay.tsx 拆出）
 *
 * @ai-context: 数字养生守门人 L3 休息活动默认列表——getDefaultRestActivities 从
 * 组件文件移出（react-refresh：组件文件只导出组件），DigitalWellbeingOverlay 组件
 * 保留在原文件。
 */
export interface RestActivity {
  id: string;
  label: string;
  emoji: string;
  duration: number;
}

/** 纯函数版本：获取默认休息活动列表 */
export function getDefaultRestActivities(): RestActivity[] {
  return [
    { id: 'stretch', label: '站立拉伸', emoji: '🧘', duration: 120 },
    { id: 'look-far', label: '远眺 20 秒', emoji: '🌳', duration: 20 },
    { id: 'breathe', label: '深呼吸 4-7-8', emoji: '🌬️', duration: 60 },
    { id: 'walk', label: '散步 5 分钟', emoji: '🚶', duration: 300 },
  ];
}
