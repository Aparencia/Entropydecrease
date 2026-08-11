/**
 * 贡献颜色图例 — 每个贡献者不同颜色标注
 * Contribution color legend
 *
 * @ai-context: 按 userId 稳定分配颜色（同人同色），只展示昵称/颜色，
 * 不展示任何人编辑的具体内容——隐私原则同社交模块。
 * @ai-context: Stable per-user colors; only nicknames/colors are shown,
 * never the content any contributor edited.
 */
import type { WikiContributor } from '../types';

interface ContributionLegendProps {
  contributors: WikiContributor[];
  className?: string;
}

export default function ContributionLegend({ contributors, className }: ContributionLegendProps) {
  if (contributors.length === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-kb-md gap-y-1 ${className ?? ''}`}>
      {contributors.map((c) => (
        <span key={c.userId} className="inline-flex items-center gap-1.5 text-c2 text-text-tertiary">
          <span
            className="w-2.5 h-2.5 rounded-kb-full flex-shrink-0"
            style={{ backgroundColor: c.color }}
            aria-hidden="true"
          />
          {c.nickname || c.userId.slice(0, 6)}
        </span>
      ))}
    </div>
  );
}
