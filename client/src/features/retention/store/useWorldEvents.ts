/**
 * 世界事件 Store（熵可视化 · 秩序波纹驱动）
 * World events store (entropy visualization · order ripple driver)
 *
 * @ai-context: 宪法第一条：复习行为→秩序波纹。本 store 是事件总线：
 * 学习流程在「掌握/复习」时刻调用 emitOrderRipple()，3D 场景层订阅
 * rippleSeq 生成扩散波纹。模块间零直接依赖，保持世界层与业务层解耦。
 * 仅保留最近一次事件（波纹是即时反馈，无需队列积压）。
 *
 * @ai-context: Event bus between learning flows and the 3D world layer.
 * Flows call emitOrderRipple() at mastery/review moments; the scene subscribes
 * to rippleSeq to spawn expanding ripples. Only the latest event is kept.
 */
import { create } from 'zustand';

/** 波纹起源锚点：模块实体 ID（场景内定位）或 'center' 场景中心 / Ripple origin */
export type RippleOrigin = 'center' | 'pomodoro' | 'notes' | 'flashcards' | 'feynman' | 'inspiration';

/** 签名时刻变体：掌握（常规）/ 创世（首潜加长版，宪法第三条 §5）/ 入籍（知识安放，阶段 A） / Signature variants */
export type SignatureVariant = 'mastery' | 'genesis' | 'settling';

interface WorldEventsState {
  /** 波纹序列号：每次 emit 自增，场景层据此生成新波纹 / Ripple sequence counter */
  rippleSeq: number;
  /** 最近一次波纹起源 / Latest ripple origin */
  rippleOrigin: RippleOrigin;

  /** 签名时刻序列号（宪法第三条：掌握一个概念） / Signature moment counter */
  signatureSeq: number;
  /** 被掌握的概念名（签名时刻文案） / Mastered concept name */
  signatureConcept: string;
  /** 签名时刻变体 / Signature variant (mastery | genesis | settling) */
  signatureVariant: SignatureVariant;

  /** 发射秩序波纹（复习/掌握的即时正反馈） / Emit an order ripple */
  emitOrderRipple: (origin?: RippleOrigin) => void;
  /** 触发签名时刻（概念掌握/首潜创世） / Trigger signature moment */
  emitSignatureMoment: (concept: string, variant?: SignatureVariant) => void;
}

export const useWorldEvents = create<WorldEventsState>((set) => ({
  rippleSeq: 0,
  rippleOrigin: 'center',
  signatureSeq: 0,
  signatureConcept: '',
  signatureVariant: 'mastery',

  emitOrderRipple: (origin = 'center') => {
    set((s) => ({ rippleSeq: s.rippleSeq + 1, rippleOrigin: origin }));
  },

  emitSignatureMoment: (concept, variant = 'mastery') => {
    set((s) => ({
      signatureSeq: s.signatureSeq + 1,
      signatureConcept: concept,
      signatureVariant: variant,
    }));
  },
}));
