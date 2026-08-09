/**
 * 笔记星图视图——认知星图布局
 * Notes constellation view — cognitive star map layout
 *
 * @ai-context: 将笔记按 content_nature 分布在 4 个深度区（海面→海沟），
 * 亮度=编辑频率，颜色=模板类型，大小=字数。交互式 SVG 渲染。
 * @ai-context: Distributes notes across 4 depth zones (surface→trench)
 * based on content nature. Brightness=edit frequency, color=template type.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Note } from '@/types/models';

interface ConstellationViewProps {
  notes: Note[];
  onNoteClick?: (noteId: string) => void;
}

type DepthZone = 'surface' | 'shallow' | 'deep' | 'trench';

const DEPTH_ZONES: DepthZone[] = ['surface', 'shallow', 'deep', 'trench'];
const ZONE_LABELS: Record<DepthZone, string> = { surface: '海面', shallow: '浅海', deep: '深海', trench: '海沟' };
const ZONE_COLORS: Record<DepthZone, string> = { surface: 'rgb(56,189,248)', shallow: 'rgb(96,165,250)', deep: 'rgb(124,58,237)', trench: 'rgb(139,92,246)' };

const TEMPLATE_COLORS: Record<string, string> = {
  outline: 'rgb(96,165,250)', cornell: 'rgb(91,138,114)', mindmap: 'rgb(251,191,36)',
  todo: 'rgb(16,185,129)', free: 'rgb(244,114,182)', blank: 'rgb(156,163,175)',
  'qa-grid': 'rgb(167,139,250)', timeline: 'rgb(251,146,60)',
};

/** 分配笔记到深度区 */
function assignDepth(note: Note): DepthZone {
  const age = (Date.now() - new Date(note.updatedAt).getTime()) / 86400000;
  // P1-1：投影后无 content，空内容判定改用已维护的 wordCount
  if (note.title === '无标题' && !(note.wordCount ?? 0)) return 'surface';
  if (age < 1) return 'surface';
  if (age < 7) return 'shallow';
  if (note.template === 'mindmap' || note.template === 'cornell') return 'deep';
  return 'trench';
}

export function ConstellationView({ notes, onNoteClick }: ConstellationViewProps) {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const positioned = useMemo(() => {
    const zones: Record<DepthZone, Note[]> = { surface: [], shallow: [], deep: [], trench: [] };
    for (const note of notes) {
      const zone = assignDepth(note);
      zones[zone].push(note);
    }

    const result: Array<{ note: Note; x: number; y: number; size: number; zone: DepthZone }> = [];
    const viewW = 800, viewH = 600;
    const zoneHeight = viewH / 4;

    for (let zi = 0; zi < DEPTH_ZONES.length; zi++) {
      const zone = DEPTH_ZONES[zi];
      const zoneNotes = zones[zone];
      const yBase = zi * zoneHeight + zoneHeight / 2;

      for (let i = 0; i < zoneNotes.length; i++) {
        const note = zoneNotes[i];
        // P1-1：投影后无 content，用已维护的 wordCount 近似篇幅（原语义）
        const textLen = note.wordCount ?? 0;
        const size = Math.max(6, Math.min(20, textLen / 50));
        const x = (i + 0.5) / Math.max(zoneNotes.length, 1) * viewW;
        const y = yBase + (Math.random() - 0.5) * zoneHeight * 0.5;

        result.push({ note, x, y, size, zone });
      }
    }
    return result;
  }, [notes]);

  const handleClick = (noteId: string) => {
    if (onNoteClick) onNoteClick(noteId);
    else navigate(`/notes/${noteId}`);
  };

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <svg viewBox="0 0 800 600" className="w-full h-full">
        {/* 深度区背景 */}
        {DEPTH_ZONES.map((zone, i) => (
          <g key={zone}>
            <rect x={0} y={i * 150} width={800} height={150} fill={ZONE_COLORS[zone]} opacity={0.03} />
            <text x={30} y={i * 150 + 30} fill={ZONE_COLORS[zone]} opacity={0.3} fontSize={12} fontWeight={600}>
              {ZONE_LABELS[zone]}
            </text>
          </g>
        ))}

        {/* 连线（悬停时显示） */}
        {hoveredId && positioned.filter((p) => p.note.id === hoveredId).map((p) => {
          const nearby = positioned.filter((np) => {
            const dx = np.x - p.x, dy = np.y - p.y;
            return Math.sqrt(dx * dx + dy * dy) < 150 && np.note.id !== p.note.id;
          });
          return nearby.map((np) => (
            <line key={`${p.note.id}-${np.note.id}`} x1={p.x} y1={p.y} x2={np.x} y2={np.y}
              stroke={ZONE_COLORS[p.zone]} strokeWidth={0.5} opacity={0.2} />
          ));
        })}

        {/* 节点 */}
        {positioned.map((p) => {
          const color = TEMPLATE_COLORS[p.note.template] || ZONE_COLORS[p.zone];
          const isHovered = hoveredId === p.note.id;
          return (
            <g key={p.note.id} onClick={() => handleClick(p.note.id)}
              onMouseEnter={() => setHoveredId(p.note.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r={p.size} fill={color} opacity={isHovered ? 0.9 : 0.5}
                stroke={isHovered ? color : 'none'} strokeWidth={2} />
              {isHovered && (
                <>
                  <circle cx={p.x} cy={p.y} r={p.size + 4} fill="none" stroke={color} strokeWidth={1} opacity={0.5}>
                    <animate attributeName="r" values={`${p.size + 4};${p.size + 10};${p.size + 4}`} dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <text x={p.x + p.size + 6} y={p.y + 4} fill={color} fontSize={11} fontWeight={500}>
                    {p.note.title || '未命名'}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default ConstellationView;