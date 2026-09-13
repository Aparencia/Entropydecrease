/**
 * TranscriptRow — 采集期实时转写流的**行渲染**（批 7 T20 自 `LiveTranscriptStream.tsx` 纯搬迁而出）。
 *
 * @ai-context 为什么拆（§C9.19「先拆后改」）：主件 `LiveTranscriptStream.tsx` 在拆前是 **297/300**
 *   （余 3），而 T20 的 B 块要给它挂「逐段显影」（§C9.16 的 7b 半，约 +15~30 行）⇒ 余量装不下。
 *   本件承载**行**这一层，主件只留状态与四个事件订阅 ⇒ 两个文件各自留出余量。
 *   拆这件**只搬不改**：DOM 结构、类名、行内样式、文案一个字未动（判据 = 结构快照逐字节对拍）。
 * @ai-context 边界：本件**零状态、零订阅、零 IPC** —— 采集事件的累积（`partialsRef` 镜像、
 *   `settleCommitted` 沉淀、`MAX_PENDING_LINES` 防御）全在 `LiveTranscriptStream.tsx`；本件拿到的是
 *   「已经算好的行数组 + 两个时间口（`fmtTime` / `elapsedMs`）」。`nextPendingId` 同样留在主件
 *   （**句子序是跨行状态**，搬进来就会造出第二份计数器）。
 * @ai-context 搬迁守恒：`TranscriptLine` / `PendingLine` 两个行类型与 `splitBySentence` / `hasText`
 *   两个纯函数随代码搬入本件（主件 `import type` 取类型）—— 同一份实现只有一处，不各持一份。
 * 副作用：无（纯函数式渲染）。边界：`partials` 里 `committed === false` 的行按句读**一对多**展开
 *   （一行文本出多行），故本件返回的是**数组**而非单元素（`<>…</>` 不产生 DOM 节点）。
 */
import type { ReactElement } from "react";
import { Text } from "../ui/primitives";

/** 定稿转写行（字幕或语音） */
export interface TranscriptLine {
  id: number;
  time: number; // 会话相对毫秒（前端按事件到达估算，展示 mm:ss）
  source: "subtitle" | "asr";
  text: string;
}

/**
 * 识别中行（M3/REQ-038 流式先行 + 静默修正；2026-08 扩展为多行挂起）：
 * committed=false = partial 上屏（灰色斜体"识别中"，同句流式更新原位替换）；
 * committed=true = SenseVoice 重打分定稿（原位转黑，待新句开始统一沉淀入列表）。
 * id=句子序：同句 partial→final 复用同一 id（保证 React key 稳定不跳动）。
 */
export interface PendingLine {
  id: number;
  /** 定稿时刻（会话纪元 ms；未定稿阶段 0——展示用实时时钟） */
  time: number;
  text: string;
  committed: boolean;
}

/**
 * 中文句读切分（识别中行展示用，2026-08 用户需求：识别中的灰斜体内容全部显示）。
 *
 * @ai-context: 流式 partial 是整句候选且可能含多个句子（zipformer 中文模型输出
 *              带句读；asr_clean 的跨标点重复/纯标点幻觉处理即依赖此事实）——
 *              现状整句挤在一行灰斜里越滚越长；按句读切分后每句一行，全部可见。
 *              句读保留在句尾；无句读尾段为"残余"（调用方加 … 表示仍在识别）。
 *              不切英文句点（Mr./U.S. 缩写防误切）与逗号（句内成分不拆行）。
 *              连续句读（"结束。。"）切出的纯标点段过滤（防垃圾行）。
 */
function splitBySentence(text: string): string[] {
  const parts: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if ("。！？!?…".includes(ch)) {
      if (hasText(buf)) parts.push(buf);
      buf = "";
    }
  }
  if (hasText(buf)) parts.push(buf);
  return parts;
}

/** 段是否含实质内容（过滤纯标点/空白段——连续句读切出的垃圾段不展示） */
function hasText(seg: string): boolean {
  return seg.trim().length > 0 && !/^[。！？!?…\s]+$/.test(seg);
}

/** 一条**定稿**转写行（时间码 · 来源色点 · 正文）—— 形态与拆前逐字相同 */
export function TranscriptRow({ line, fmtTime }: { line: TranscriptLine; fmtTime: (ms: number) => string }): ReactElement {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, lineHeight: 1.6 }}>
      <Text tone="ink-3" style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        {fmtTime(line.time)}
      </Text>
      <span
        title={line.source === "subtitle" ? "字幕" : "语音"}
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          flexShrink: 0,
          alignSelf: "center",
          background: line.source === "subtitle" ? "#0d9488" : "#9ca3af",
        }}
      />
      <span style={{ color: line.source === "subtitle" ? "#0f766e" : "#374151" }}>{line.text}</span>
    </div>
  );
}

/**
 * **未沉淀行**区（识别中 + 已定稿待沉淀）。2026-08 用户需求：ASR 未沉淀行全部展示——
 * 识别中（灰斜）按句读拆多行全部显示；已定稿待沉淀（黑）一行；连续定稿各行并存；
 * 新句首个 partial 到达时统一沉淀入上方列表（沉淀逻辑在主件，本件只渲染）。
 */
export function PendingRows({ partials, fmtTime, elapsedMs }: {
  partials: readonly PendingLine[];
  fmtTime: (ms: number) => string;
  elapsedMs: number;
}): ReactElement {
  return (
    <>
      {partials.map((p) => {
        if (p.committed) {
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                fontSize: 13,
                color: "#374151",
              }}
            >
              <span style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                {fmtTime(p.time)}
              </span>
              <span
                title="已定稿待沉淀"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  flexShrink: 0,
                  alignSelf: "center",
                  background: "#9ca3af",
                }}
              />
              <span>{p.text}</span>
            </div>
          );
        }
        // 识别中：整句候选按句读切分多行灰斜体——"识别中的内容全部显示"；
        // 首行带时间，后续行对齐留空；残余段（无句读尾段）加 … 
        const segs = splitBySentence(p.text);
        return segs.map((seg, i) => (
          <Text as="div" size={4} tone="ink-3" key={`${p.id}-${i}`} style={{
            display: "flex",
            gap: 8,
            alignItems: "baseline",
            fontStyle: "italic",
          }}>
            <span style={{ fontSize: 11, width: 44, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {i === 0 ? fmtTime(elapsedMs) : ""}
            </span>
            <span
              title="识别中"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                flexShrink: 0,
                alignSelf: "center",
                background: "#d1d5db",
              }}
            />
            <span>{seg}{i === segs.length - 1 ? "…" : ""}</span>
          </Text>
        ));
      })}
    </>
  );
}
