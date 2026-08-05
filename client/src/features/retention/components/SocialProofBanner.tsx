/**
 * 社交证据横幅 — 匿名聚合统计展示
 * Social proof banner — anonymous aggregate stats
 *
 * @ai-context: 从 sync-service 拉取今日匿名聚合统计（学习人数/总分钟数），
 * 以"共同在场"而非"排名比较"的方式呈现——符合焦虑防线宪法（无倒计时/赤字/
 * 与他人比较字段）。设置开关 socialProof 关闭或网络不可用时静默隐藏。
 * @ai-context: Shows anonymous aggregate stats (active users / total minutes)
 * as "shared presence", never as ranking — anxiety-defense compliant.
 * Silently hidden when the setting is off or when offline.
 */
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Waves } from 'lucide-react';
import { useSocialProof } from '../hooks/useSocialProof';
import { useRetentionSettings } from '../store/useRetentionSettings';

export default function SocialProofBanner() {
  const { socialProof, initialize } = useRetentionSettings();
  const stats = useSocialProof(socialProof);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // 开关关闭 / 无数据 / 网络不可用 → 静默隐藏（离线优先，不显示错误）
  if (!socialProof || !stats || stats.activeUsers === 0) return null;

  const minutes = stats.totalMinutesToday >= 60
    ? `${(stats.totalMinutesToday / 60).toFixed(1)} 小时`
    : `${stats.totalMinutesToday} 分钟`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.35 }}
      className="mt-rhythm-md inline-flex items-center gap-2 rounded-kb-full border border-border/15 bg-bg-elevated/30 px-4 py-1.5 backdrop-blur-sm"
    >
      <Waves className="w-3.5 h-3.5 text-cyan-400/80" strokeWidth={1.5} />
      <span className="text-c1 text-text-tertiary">
        今日 <span className="text-text-secondary font-medium">{stats.activeUsers}</span> 位潜航员在学，累计
        <span className="text-text-secondary font-medium"> {minutes}</span> · 你也在这片海里
      </span>
    </motion.div>
  );
}
