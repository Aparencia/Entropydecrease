/**
 * 流式分句器（Streaming Sentence Splitter）— 降低 TTS 首句延迟
 *
 * @ai-context: 文本边流式到达边切分句子，第一句完整即送 TTS 合成，
 * 不等全文到齐——这是语音助手（Siri/Alexa）降低感知延迟的标准做法。
 * 配合 ttsController 的 FIFO 队列形成流水线：第 1 句播放时第 2 句在合成。
 *
 * 关键设计：代码围栏（```）感知——代码块内的句号/换行不作为句子边界，
 * 避免把代码当散文朗读。围栏未闭合时其后的内容一律挂起不消费。
 *
 * 纯函数 scanSentences 无副作用、可单测；SpeechSentenceStreamer 为有状态封装。
 */

/** 围栏标记 */
const FENCE = '```';

/** 句子结束符（中英文 + 换行） */
const SENTENCE_ENDERS = '。！？!?；;\n';

export interface SentenceScan {
  /** 已确认的完整句子（位于代码围栏之外，按出现顺序） */
  sentences: string[];
  /** 安全消费偏移量——此前的文本已处理完毕（句子已提取/代码已跳过） */
  consumed: number;
  /** 文本是否以未闭合的代码围栏结尾（其后内容应挂起） */
  inFence: boolean;
}

/**
 * 扫描原始（可能不完整的）文本，提取所有已确认的完整句子。
 *
 * 语义：句子一旦确认即稳定——后续追加的文本不会改变已返回的句子
 * （围栏只会影响其后的内容，不会回溯撤销之前的句子）。
 * 因此调用方可用"已朗读数量"做增量消费。
 *
 * @param raw - 累积的原始文本（含 Markdown，可能含未闭合围栏）
 */
export function scanSentences(raw: string): SentenceScan {
  const sentences: string[] = [];
  let inFence = false;
  let segStart = 0;   // 当前待处理片段的起点
  let consumed = 0;   // 安全消费偏移
  let i = 0;

  while (i < raw.length) {
    // 围栏标记：切换状态，并把围栏前的散文片段作为一句 flush
    if (raw.startsWith(FENCE, i)) {
      if (!inFence) {
        const seg = raw.slice(segStart, i).trim();
        if (seg) sentences.push(seg);
        consumed = i;
      }
      inFence = !inFence;
      // 跳过整行围栏（标记 + 可选语言标签 + 换行）
      const nl = raw.indexOf('\n', i);
      i = nl === -1 ? raw.length : nl + 1;
      segStart = i;
      if (!inFence) consumed = i; // 围栏闭合：其内代码已安全跳过
      continue;
    }

    // 句子边界（仅围栏外有效）
    if (!inFence && SENTENCE_ENDERS.includes(raw[i])) {
      const seg = raw.slice(segStart, i + 1).trim();
      if (seg) sentences.push(seg);
      consumed = i + 1;
      segStart = i + 1;
      i++;
      continue;
    }

    i++;
  }

  return { sentences, consumed, inFence };
}

/**
 * 有状态的流式分句器：逐块喂入文本，增量返回新完成的句子。
 * 每条消息新建一个实例，避免跨消息污染。
 */
export class SpeechSentenceStreamer {
  private raw = '';
  private spokenCount = 0;

  /** 追加一个流式块，返回新完成的句子（原文，由调用方送 TTS 规范化） */
  push(chunk: string): string[] {
    this.raw += chunk;
    const { sentences } = scanSentences(this.raw);
    const fresh = sentences.slice(this.spokenCount);
    this.spokenCount = sentences.length;
    return fresh;
  }

  /** 流结束时冲刷末尾残余文本（未闭合代码块内的内容丢弃） */
  flush(): string[] {
    const { consumed, inFence } = scanSentences(this.raw);
    if (inFence) return [];
    const tail = this.raw.slice(consumed).trim();
    return tail ? [tail] : [];
  }
}
