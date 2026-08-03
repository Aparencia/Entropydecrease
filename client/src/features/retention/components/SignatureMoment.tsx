/**
 * SignatureMoment — 签名时刻（宪法第三条：全产品唯一一级时刻）
 * SignatureMoment — the one signature moment (constitution §3)
 *
 * @ai-context: 挂载点=掌握一个概念（费曼评估通过/卡片牢固）。三幕结构：
 * 第一幕·静默（1.5s 世界安静下来）→ 第二幕·事件（4.5s 星亮起+波纹+连线）
 * → 第三幕·余韵（2s 自动消散，痕迹已由 OrderRipples/星图永久保留）。
 * 约束：Esc/点击可打断（觉察原则）；reduced-motion 降级为 3s 静帧卡；
 * 声音占一半（achievement_unlocked）；同屏仅一次（新事件重置计时）。
 *
 * @ai-context: Three-act overlay driven by useWorldEvents.signatureSeq.
 * Interruptible (Esc/click), reduced-motion static fallback, sound included.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorldEvents } from '../store/useWorldEvents';
import { soundPlayer } from '@/lib/audio/SoundPlayer';

/** 三幕时长（毫秒）/ Act durations */
const ACT1_MS = 1500;
const ACT2_MS = 4500;
const ACT3_MS = 2000;
/** reduced-motion 静帧版展示时长 / Static fallback duration */
const STATIC_MS = 3000;

type Act = 'silence' | 'event' | 'afterglow';

export function SignatureMoment() {
  const signatureSeq = useWorldEvents((s) => s.signatureSeq);
  const signatureConcept = useWorldEvents((s) => s.signatureConcept);
  const [active, setActive] = useState(false);
  const [act, setAct] = useState<Act>('silence');
  const [concept, setConcept] = useState('');
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const dismiss = () => {
    clearTimers();
    setActive(false);
    setAct('silence');
  };

  // 序列号驱动：新事件重置计时（可变重奏的入口，变体库 P2 扩展）
  useEffect(() => {
    if (signatureSeq === 0) return;
    clearTimers();
    setConcept(signatureConcept);
    setActive(true);

    if (reduced) {
      // 静帧版：跳过动效，直达事件文案，3s 后消散
      setAct('event');
      soundPlayer.play('achievement_unlocked');
      timers.current.push(setTimeout(dismiss, STATIC_MS));
      return;
    }

    setAct('silence');
    soundPlayer.play('achievement_unlocked');
    timers.current.push(setTimeout(() => setAct('event'), ACT1_MS));
    timers.current.push(setTimeout(() => setAct('afterglow'), ACT1_MS + ACT2_MS));
    timers.current.push(setTimeout(dismiss, ACT1_MS + ACT2_MS + ACT3_MS));

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureSeq]);

  // Esc 打断（觉察原则：仪式服务人，不绑架人）
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key={`signature-${signatureSeq}`}
        onClick={dismiss}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.2 } }}
        style={{
          position: 'fixed', inset: 0, zIndex: 60, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'radial-gradient(circle at 50% 42%, rgba(10,16,30,0.55), rgba(6,10,20,0.82) 75%)',
          backdropFilter: 'blur(3px)',
        }}
      >
        {/* 第一幕提示：世界安静下来 */}
        <AnimatePresence mode="wait">
          {act === 'silence' && !reduced && (
            <motion.div
              key="silence"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ fontSize: 13, letterSpacing: 6, color: '#90A0B8' }}
            >
              世 界 安 静 下 来
            </motion.div>
          )}

          {(act === 'event' || act === 'afterglow') && (
            <motion.div
              key="event"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: act === 'afterglow' ? 0.85 : 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 26 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, textAlign: 'center', padding: '0 32px' }}
            >
              {/* 亮起的星 + 秩序波纹（痕迹由场景层永久保留，此处是演出） */}
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                {!reduced && [0, 0.5, 1].map((d) => (
                  <motion.span
                    key={d}
                    initial={{ scale: 0.2, opacity: 0.8 }}
                    animate={{ scale: 2.6, opacity: 0 }}
                    transition={{ duration: 2, delay: d, ease: 'easeOut', repeat: Infinity }}
                    style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid #22D3EE' }}
                  />
                ))}
                <div style={{
                  position: 'absolute', inset: 44, borderRadius: '50%',
                  background: 'radial-gradient(circle at 40% 36%, #E0F7FF, #67E8F9 60%, #0891B2)',
                  boxShadow: '0 0 34px #22D3EE, 0 0 90px rgba(34,211,238,0.4)',
                }} />
              </div>

              <div>
                <div style={{
                  fontFamily: "'LXGW WenKai Lite','Noto Serif SC',serif",
                  fontSize: 30, fontWeight: 700, letterSpacing: 2, color: '#E0E6F0',
                }}>
                  「{concept || '这个概念'}」
                </div>
                <div style={{ fontSize: 14, color: '#90A0B8', marginTop: 12, letterSpacing: 3 }}>
                  已成为你秩序的一部分
                </div>
              </div>

              {act === 'afterglow' && !reduced && (
                <div style={{ fontSize: 11, color: '#607088', letterSpacing: 2 }}>
                  痕迹已留在世界里 · 点击任意处返回
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
