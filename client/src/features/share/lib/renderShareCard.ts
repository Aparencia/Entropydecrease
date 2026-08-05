/**
 * 学习成果分享卡 — canvas 绘制纯函数
 * Share card — pure canvas renderer
 *
 * @ai-context: 将本周回顾摘要绘制为深海风格分享卡（不含任何隐私数据——
 * 只有聚合统计与品牌元素）。canvas.toBlob 导出 PNG；非 Electron/PWA
 * 环境同样可用（纯 DOM canvas）。失败静默（可选增强）。
 * @ai-context: Renders a deep-sea styled share card from the weekly summary;
 * contains aggregate stats only — no private data. Exports PNG via toBlob.
 */

import type { WeeklySummary } from '@/features/dashboard/types/analytics';

/** 绘制分享卡并导出 PNG 数据 URL（失败返回 null） */
export function renderShareCard(summary: WeeklySummary): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const W = 800;
      const H = 480;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      // ── 深海背景 ──
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0c1b33');
      bg.addColorStop(0.6, '#0e2a4a');
      bg.addColorStop(1, '#123a5e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // 光斑（品牌星点）
      for (let i = 0; i < 40; i++) {
        const x = ((i * 37) % W) + Math.sin(i * 2.3) * 12;
        const y = ((i * 61) % H) + Math.cos(i * 1.7) * 8;
        ctx.globalAlpha = 0.12 + (i % 5) * 0.05;
        ctx.fillStyle = i % 3 === 0 ? '#7dd3fc' : '#fbbf24';
        ctx.beginPath();
        ctx.arc(x, y, i % 4 === 0 ? 2.5 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // 品牌渐变条
      const bar = ctx.createLinearGradient(0, 0, W, 0);
      bar.addColorStop(0, '#818cf8');
      bar.addColorStop(0.5, '#22d3ee');
      bar.addColorStop(1, '#f472b6');
      ctx.fillStyle = bar;
      ctx.fillRect(0, 0, W, 6);

      // ── 标题 ──
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 44px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('本周学习回顾', 56, 92);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillText(`${summary.weekStart} ~ ${summary.weekEnd}`, 56, 128);

      // ── 核心数字 ──
      const minutesLabel = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${m}m`);
      const metrics = [
        { label: '深潜时长', value: minutesLabel(summary.totalMinutes), color: '#f97316' },
        { label: '结礁笔记', value: String(summary.noteCount), color: '#3b82f6' },
        { label: '复习次数', value: String(summary.reviewCount), color: '#10b981' },
        { label: '费曼输出', value: String(summary.feynmanCount), color: '#8b5cf6' },
      ];
      const cardW = (W - 112 - 48) / 4;
      metrics.forEach((m, i) => {
        const x = 56 + i * (cardW + 16);
        ctx.fillStyle = 'rgba(15, 42, 74, 0.75)';
        roundRect(ctx, x, 168, cardW, 128, 16);
        ctx.fill();
        ctx.fillStyle = m.color;
        ctx.font = 'bold 38px "Microsoft YaHei", sans-serif';
        ctx.fillText(m.value, x + 20, 228);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px "Microsoft YaHei", sans-serif';
        ctx.fillText(m.label, x + 20, 264);
      });

      // ── 复习及时率 / 掌握度变化 ──
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '20px "Microsoft YaHei", sans-serif';
      ctx.fillText(
        summary.reviewTimeliness === null
          ? '复习及时率：样本积累中'
          : `复习及时率 ${summary.reviewTimeliness}% · 到期如期巩固`,
        56, 344,
      );
      ctx.fillText(
        summary.masteryDelta === null
          ? '掌握度：持续生长中'
          : `掌握度 ${summary.masteryDelta > 0 ? '+' : ''}${summary.masteryDelta} 天 · 记忆更牢固`,
        56, 380,
      );

      // ── 底部品牌 ──
      ctx.fillStyle = '#64748b';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.fillText('万物趋于无序，而你在此造序', 56, 432);
      ctx.textAlign = 'right';
      ctx.fillText('熵减 · 我的学习世界', W - 56, 432);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const url = URL.createObjectURL(blob);
          resolve(url);
        },
        'image/png',
        0.95,
      );
    } catch {
      resolve(null);
    }
  });
}

/** 圆角矩形路径辅助 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
