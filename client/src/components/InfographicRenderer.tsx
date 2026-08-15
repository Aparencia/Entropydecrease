/**
 * 知识信息图渲染器 — SVG 渲染 AI 生成的信息图
 *
 * @ai-context: 渲染标题、带要点的段落、关系连接节点图。
 * 支持 3 种主题：academic（学术衬线）、tech（技术等宽蓝）、warm（圆润手绘感）。
 */
import { cn } from '@/lib/utils';
import type { InfographicData } from '@/lib/ai/types';

interface InfographicRendererProps {
  data: InfographicData;
  className?: string;
}

/** 主题样式配置 */
const THEME_STYLES = {
  academic: {
    fontFamily: "'Georgia', 'Noto Serif SC', serif",
    titleColor: '#1e293b',
    sectionBg: '#f8fafc',
    sectionBorder: '#e2e8f0',
    accentColor: '#3b82f6',
    pointColor: '#475569',
    relationColor: '#94a3b8',
    headingFont: "'Georgia', 'Noto Serif SC', serif",
    bodyFont: "'Georgia', 'Noto Serif SC', serif",
  },
  tech: {
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    titleColor: '#1e3a5f',
    sectionBg: '#f0f5ff',
    sectionBorder: '#bfdbfe',
    accentColor: '#2563eb',
    pointColor: '#334155',
    relationColor: '#60a5fa',
    headingFont: "'JetBrains Mono', 'Consolas', monospace",
    bodyFont: "'JetBrains Mono', 'Consolas', monospace",
  },
  warm: {
    fontFamily: "'Comic Sans MS', 'Chalkboard SE', cursive",
    titleColor: '#7c2d12',
    sectionBg: '#fff7ed',
    sectionBorder: '#fed7aa',
    accentColor: '#ea580c',
    pointColor: '#57534e',
    relationColor: '#fdba74',
    headingFont: "'Comic Sans MS', 'Chalkboard SE', cursive",
    bodyFont: "'Comic Sans MS', 'Chalkboard SE', cursive",
  },
};

function InfographicSVG({ data }: { data: InfographicData }) {
  const theme = THEME_STYLES[data.theme] ?? THEME_STYLES.academic;
  const sectionHeight = 80 + data.sections.reduce((max, s) => Math.max(max, s.points.length * 20), 0);
  const svgWidth = 600;
  const svgHeight = 120 + data.sections.length * (sectionHeight + 20) + (data.relations.length > 0 ? 60 : 0);

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ fontFamily: theme.fontFamily }}
      className="w-full h-auto"
    >
      {/* 背景 */}
      <rect width={svgWidth} height={svgHeight} rx={12} fill={theme.sectionBg} />

      {/* 标题 */}
      <text
        x={svgWidth / 2}
        y={40}
        textAnchor="middle"
        fill={theme.titleColor}
        fontSize={20}
        fontWeight="bold"
        fontFamily={theme.headingFont}
      >
        {data.title}
      </text>

      {/* 分割线 */}
      <line x1={40} y1={55} x2={svgWidth - 40} y2={55} stroke={theme.sectionBorder} strokeWidth={1} />

      {/* 段落 */}
      {data.sections.map((section, si) => {
        const y = 80 + si * (sectionHeight + 30);
        return (
          <g key={si}>
            {/* 段落背景 */}
            <rect
              x={30}
              y={y}
              width={svgWidth - 60}
              height={sectionHeight}
              rx={8}
              fill={theme.sectionBg}
              stroke={theme.sectionBorder}
              strokeWidth={1}
            />
            {/* 段落标题 */}
            <text
              x={50}
              y={y + 24}
              fill={theme.accentColor}
              fontSize={14}
              fontWeight="bold"
              fontFamily={theme.headingFont}
            >
              {section.icon ? `${section.icon} ` : ''}{section.title}
            </text>
            {/* 要点 */}
            {section.points.map((point, pi) => (
              <text
                key={pi}
                x={55}
                y={y + 48 + pi * 22}
                fill={theme.pointColor}
                fontSize={11}
                fontFamily={theme.bodyFont}
              >
                {`• ${point}`}
              </text>
            ))}
          </g>
        );
      })}

      {/* 关系连线 */}
      {data.relations.length > 0 && (() => {
        const relY = 70 + data.sections.length * (sectionHeight + 30) + 10;
        return (
          <g>
            <line x1={40} y1={relY} x2={svgWidth - 40} y2={relY} stroke={theme.sectionBorder} strokeWidth={1} strokeDasharray="4,4" />
            <text
              x={svgWidth / 2}
              y={relY + 20}
              textAnchor="middle"
              fill={theme.relationColor}
              fontSize={11}
              fontFamily={theme.bodyFont}
              fontWeight="bold"
            >
              关系图
            </text>
            {data.relations.map((rel, ri) => {
              const fromIdx = data.sections.findIndex(s => s.title === rel.from);
              const toIdx = data.sections.findIndex(s => s.title === rel.to);
              if (fromIdx < 0 || toIdx < 0) return null;

              const x1 = 60 + (fromIdx % 2) * (svgWidth - 200);
              const x2 = 60 + (toIdx % 2) * (svgWidth - 200);
              const y1Val = relY + 40 + ri * 30;
              const y2Val = relY + 40 + ri * 30;

              return (
                <g key={ri}>
                  <line
                    x1={x1}
                    y1={y1Val}
                    x2={x2}
                    y2={y2Val}
                    stroke={theme.accentColor}
                    strokeWidth={1}
                    strokeOpacity={0.5}
                  />
                  <text
                    x={x1 + 10}
                    y={y1Val + 4}
                    fill={theme.relationColor}
                    fontSize={10}
                    fontFamily={theme.bodyFont}
                  >
                    {rel.from}
                  </text>
                  <text
                    x={x1 + (x2 - x1) / 2}
                    y={y1Val - 5}
                    textAnchor="middle"
                    fill={theme.accentColor}
                    fontSize={9}
                    fontFamily={theme.bodyFont}
                    fontStyle="italic"
                  >
                    {rel.label}
                  </text>
                  <text
                    x={x2 + 10}
                    y={y2Val + 4}
                    fill={theme.relationColor}
                    fontSize={10}
                    fontFamily={theme.bodyFont}
                  >
                    {rel.to}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
}

export default function InfographicRenderer({ data, className }: InfographicRendererProps) {
  const theme = THEME_STYLES[data.theme] ?? THEME_STYLES.academic;

  return (
    <div
      className={cn('rounded-2xl overflow-hidden border', className)}
      style={{
        borderColor: theme.sectionBorder,
        backgroundColor: theme.sectionBg,
        fontFamily: theme.fontFamily,
      }}
    >
      <InfographicSVG data={data} />
    </div>
  );
}