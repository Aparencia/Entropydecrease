/**
 * 待补强知识点（底部汇总条 + 明细弹窗）
 *
 * @ai-context: 从 FeynmanPage 拆出。底部汇总条展示全部未掌握薄弱点计数，
 * 点击打开明细弹窗；弹窗内可标记已掌握或跳转到来源会话。
 * unmasteredWeakPoints 由父组件基于 store 派生后传入。
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Modal } from '@/components/ui';
import { AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';
import type { FeynmanWeakPoint } from '@/types/models';

const weakBarVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 25, delay: 0.2 } },
};

export interface UnmasteredWeakPointItem {
  wp: FeynmanWeakPoint;
  concept: string;
  noteId: string;
}

interface WeakPointsSummaryProps {
  totalCount: number;
  items: UnmasteredWeakPointItem[];
  modalOpen: boolean;
  onOpenModal: () => void;
  onCloseModal: () => void;
  onToggleMastered: (noteId: string, wpId: string) => void;
  onJumpToNote: (noteId: string) => void;
}

export function WeakPointsSummary({
  totalCount, items, modalOpen, onOpenModal, onCloseModal, onToggleMastered, onJumpToNote,
}: WeakPointsSummaryProps) {
  return (
    <>
      {/* 底部薄弱点汇总条 */}
      <AnimatePresence>
        {totalCount > 0 && (
          <motion.div
            className="flex-shrink-0 px-kb-md py-3 border-t border-border/30 relative z-10"
            variants={weakBarVariants}
          >
            <motion.button
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={onOpenModal}
              className="w-full flex items-center gap-3 px-kb-md py-3 rounded-[var(--kb-radius-md)]
                bg-bg-secondary/70 backdrop-blur-xl border border-border/40
                hover:border-[#F59E0B]/30 transition-colors duration-300 text-left relative overflow-hidden"
            >
              {/* shimmer */}
              <div className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-[1s] ease-in-out pointer-events-none"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.05), transparent)' }}
              />
              <div className="w-8 h-8 rounded-kb-md flex items-center justify-center flex-shrink-0
                bg-[#F59E0B]/10 text-[#F59E0B] relative z-10">
                <AlertTriangle className="w-4 h-4" strokeWidth={1.5} />
              </div>
              <div className="flex-1 relative z-10">
                <p className="text-b2 font-medium text-text-primary">查看待补强知识点</p>
                <p className="text-c1 text-text-tertiary">共 {totalCount} 个薄弱点等待复习巩固</p>
              </div>
              <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:translate-x-1 transition-transform relative z-10" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 待补强知识点明细弹窗 */}
      <Modal
        open={modalOpen}
        onClose={onCloseModal}
        title="待补强知识点"
        description={`共 ${items.length} 个薄弱点等待复习巩固`}
      >
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-b2 text-text-tertiary py-4 text-center">暂无待补强知识点</p>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.03 } },
              }}
            >
              {items.map(({ wp, concept, noteId }) => (
                <motion.div
                  key={wp.id}
                  variants={{
                    hidden: { opacity: 0, y: 8, scale: 0.97 },
                    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.25 } },
                  }}
                  className="flex items-start gap-3 p-3 rounded-kb-lg bg-bg-secondary/80 backdrop-blur-sm border border-border/40
                    hover:border-[#F59E0B]/30 transition-colors duration-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-b2 text-text-primary leading-relaxed">{wp.text}</p>
                    <span className="text-c1 text-text-tertiary mt-1 inline-block">来源：{concept}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => onToggleMastered(noteId, wp.id!)}
                      className="p-1.5 rounded-kb-md text-text-tertiary hover:text-semantic-success hover:bg-semantic-success/10 transition-all"
                      title="标记已掌握"
                    >
                      <CheckCircle className="w-4 h-4" strokeWidth={1.5} />
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.15, x: 2 }}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => onJumpToNote(noteId)}
                      className="p-1.5 rounded-kb-md text-text-tertiary hover:text-brand-600 hover:bg-brand-50 transition-all"
                      title="跳转到对应会话"
                    >
                      <ArrowRight className="w-4 h-4" strokeWidth={1.5} />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </Modal>
    </>
  );
}
