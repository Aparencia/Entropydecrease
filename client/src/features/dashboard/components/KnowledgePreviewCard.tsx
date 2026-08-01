/**
 * KnowledgePreviewCard — 知识预览浮动卡片
 * - 不对称圆角（24px 12px 20px 16px）
 * - 悬浮时3D倾斜效果（perspective + rotateX/Y 跟随鼠标）
 * - 卡片之间有微妙的「交融渐变」过渡
 *
 * @ai-context: 通用组件：KnowledgePreviewCard。
 */
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { FileText, Layers, Timer, Lightbulb, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/animation/springConfig';

type CardType = 'note' | 'flashcard' | 'pomodoro' | 'feynman';

interface KnowledgeCard {
  id: string;
  type: CardType;
  title: string;
  excerpt?: string;
  time: string;
  /** 点击跳转目标路径 */
  targetPath?: string;
}

interface KnowledgePreviewCardProps {
  card: KnowledgeCard;
  index: number;
}

const typeConfig: Record<CardType, {
  icon: typeof FileText;
  gradient: string;
  accentColor: string;
  label: string;
}> = {
  note: {
    icon: FileText,
    gradient: 'from-note/10 to-note/5',
    accentColor: 'text-note',
    label: '笔记',
  },
  flashcard: {
    icon: Layers,
    gradient: 'from-flashcard/10 to-flashcard/5',
    accentColor: 'text-flashcard',
    label: '闪卡',
  },
  pomodoro: {
    icon: Timer,
    gradient: 'from-pomodoro/10 to-pomodoro/5',
    accentColor: 'text-pomodoro',
    label: '番茄钟',
  },
  feynman: {
    icon: Lightbulb,
    gradient: 'from-feynman/10 to-feynman/5',
    accentColor: 'text-feynman',
    label: '费曼',
  },
};

/** 不对称圆角样式 - 每张卡片略有不同 */
const asymmetricRadius = [
  '24px 12px 20px 16px',
  '16px 24px 12px 20px',
  '20px 16px 24px 12px',
  '12px 20px 16px 24px',
  '18px 14px 22px 10px',
];

export default function KnowledgePreviewCard({ card, index }: KnowledgePreviewCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const clickable = !!card.targetPath;
  const handleClick = () => { if (card.targetPath) navigate(card.targetPath); };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && card.targetPath) {
      e.preventDefault();
      navigate(card.targetPath);
    }
  };

  const rotateX = useSpring(
    useTransform(mouseY, [-0.5, 0.5], [8, -8]),
    { stiffness: SPRING.default.stiffness, damping: SPRING.default.damping }
  );
  const rotateY = useSpring(
    useTransform(mouseX, [-0.5, 0.5], [-8, 8]),
    { stiffness: SPRING.default.stiffness, damping: SPRING.default.damping }
  );

  function handleMouseMove(e: React.MouseEvent) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set((e.clientX - rect.left) / rect.width - 0.5);
    mouseY.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleMouseLeave() {
    mouseX.set(0);
    mouseY.set(0);
  }

  const config = typeConfig[card.type];
  const Icon = config.icon;
  const radius = asymmetricRadius[index % asymmetricRadius.length];

  return (
    <motion.div
      ref={ref}
      role={clickable ? 'link' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `打开${config.label}：${card.title}` : undefined}
      className={cn(
        'relative overflow-hidden group focus-visible:outline-2 focus-visible:outline-brand-500',
        clickable ? 'cursor-pointer' : 'cursor-default',
        'border border-border/20 backdrop-blur-sm',
        'bg-bg-elevated/40 hover:bg-bg-elevated/60',
        'transition-colors duration-beat-x3',
      )}
      style={{
        borderRadius: radius,
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={clickable ? { scale: 0.97 } : undefined}
      transition={SPRING.default}
    >
      {/* 交融渐变遮罩 */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br opacity-60 group-hover:opacity-100 transition-opacity duration-beat-x5',
        config.gradient,
      )} />

      {/* 光泽层 */}
      <motion.div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-beat-x3"
        style={{
          background: useTransform(
            [useTransform(mouseX, [-0.5, 0.5], ['0%', '100%']), useTransform(mouseY, [-0.5, 0.5], ['0%', '100%'])],
            ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.06) 0%, transparent 60%)`
          ),
        }}
      />

      {/* 内容 */}
      <div className="relative p-4 flex flex-col gap-2 min-h-[120px]">
        {/* 顶部类型标签 */}
        <div className="flex items-center gap-1.5">
          <Icon className={cn('w-3.5 h-3.5', config.accentColor)} strokeWidth={1.5} />
          <span className={cn('text-c2 font-medium', config.accentColor)}>{config.label}</span>
          <span className="text-c2 text-text-tertiary ml-auto flex items-center gap-1">
            {card.time}
            {clickable && (
              <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity duration-beat-x2" />
            )}
          </span>
        </div>

        {/* 标题 */}
        <h3 className="text-b2 font-medium text-text-primary line-clamp-2 leading-snug">
          {card.title}
        </h3>

        {/* 摘要 */}
        {card.excerpt && (
          <p className="text-c1 text-text-secondary line-clamp-2 leading-relaxed mt-auto">
            {card.excerpt}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export type { KnowledgeCard, CardType };
