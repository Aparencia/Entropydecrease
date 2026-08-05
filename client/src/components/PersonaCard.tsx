/**
 * 概念拟人化卡片 — 展示概念的拟人化角色信息
 *
 * @ai-context: 展示概念的角色名称、性格、背景故事、口头禅
 * 以及与其他概念的关系戏剧（师徒/双胞胎/宿敌等）。
 * 使用品牌色渐变和动画效果增强可读性。
 */
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { PersonaData, RelationshipType } from '@/lib/ai/types';

const RELATIONSHIP_META: Record<RelationshipType, { label: string; color: string; icon: string }> = {
  mentor: { label: '师徒', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: '🎓' },
  twin: { label: '双胞胎', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: '👯' },
  rival: { label: '宿敌', color: 'text-red-500 bg-red-500/10 border-red-500/20', icon: '⚔️' },
  parent_child: { label: '父子', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: '👨‍👦' },
  ally: { label: '盟友', color: 'text-violet-500 bg-violet-500/10 border-violet-500/20', icon: '🤝' },
};

interface PersonaCardProps {
  persona: PersonaData;
  className?: string;
}

export default function PersonaCard({ persona, className }: PersonaCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('rounded-2xl border border-border/20 bg-bg-elevated/50 overflow-hidden', className)}
    >
      {/* 头部 — 角色名 + 概念 */}
      <div className="bg-gradient-to-r from-brand-500/10 to-violet-500/10 p-4 border-b border-border/10">
        <div className="flex items-center gap-1 text-[11px] text-text-tertiary mb-1">
          <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-brand-500">{persona.concept}</span>
        </div>
        <h3 className="text-[16px] font-bold text-text-primary">{persona.name}</h3>
      </div>

      <div className="p-4 space-y-3">
        {/* 性格描述 */}
        <div>
          <p className="text-[11px] text-text-tertiary font-medium mb-1">性格</p>
          <p className="text-[13px] text-text-secondary leading-relaxed">{persona.personality}</p>
        </div>

        {/* 背景故事 */}
        <div>
          <p className="text-[11px] text-text-tertiary font-medium mb-1">背景故事</p>
          <p className="text-[13px] text-text-secondary leading-relaxed">{persona.backstory}</p>
        </div>

        {/* 口头禅 */}
        <div className="rounded-xl bg-brand-500/5 border border-brand-500/15 p-3">
          <p className="text-[11px] text-text-tertiary mb-1">口头禅</p>
          <p className="text-[14px] font-medium text-brand-500 italic">&ldquo;{persona.catchphrase}&rdquo;</p>
        </div>

        {/* 关系戏剧 */}
        {persona.relationships.length > 0 && (
          <div>
            <p className="text-[11px] text-text-tertiary font-medium mb-2">与其他概念的关系</p>
            <div className="space-y-2">
              {persona.relationships.map((rel, i) => {
                const meta = RELATIONSHIP_META[rel.relationship] ?? RELATIONSHIP_META.ally;
                return (
                  <div
                    key={i}
                    className={cn('rounded-xl border p-2.5', meta.color)}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span>{meta.icon}</span>
                      <span className="text-[11px] font-medium">{meta.label}</span>
                      <span className="text-[12px] text-text-primary font-medium">— {rel.targetConcept}</span>
                    </div>
                    <p className="text-[12px] text-text-secondary">{rel.story}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 外观描述 */}
        {persona.appearance && (
          <div>
            <p className="text-[11px] text-text-tertiary font-medium mb-1">外观</p>
            <p className="text-[13px] text-text-secondary">{persona.appearance}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}