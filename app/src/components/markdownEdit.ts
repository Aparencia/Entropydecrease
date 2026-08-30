/**
 * markdownEdit — textarea 编辑纯函数（H2 修复自 NoteEditView 抽出）。
 *
 * @ai-context: H2 根因——原 insertAtCursor/wrapSelection 直接写受控 textarea
 *              的 DOM value 但从不同步 setContent，React 重渲染后插入被抹掉
 *              （工具栏 15 个动作全部失效）。修复：纯函数只计算"新字符串 +
 *              新光标位置"，由组件 setContent 走受控更新，再经 rAF 恢复光标。
 *              纯逻辑与副作用物理分离（无 DOM 读写，可单测）。
 */

/** 编辑结果：新全文 + 应恢复的光标选区 */
export interface EditResult {
  value: string;
  selStart: number;
  selEnd: number;
}

/** 在光标位置插入文本（替换当前选区） */
export function insertAtCursor(current: string, selStart: number, selEnd: number, text: string): EditResult {
  const before = current.substring(0, selStart);
  const after = current.substring(selEnd);
  const pos = selStart + text.length;
  return { value: before + text + after, selStart: pos, selEnd: pos };
}

/** 包裹选中文本（光标保持选中被包裹的内容，便于连续编辑） */
export function wrapSelection(
  current: string,
  selStart: number,
  selEnd: number,
  beforeMark: string,
  afterMark: string,
): EditResult {
  const selected = current.substring(selStart, selEnd);
  const fullBefore = current.substring(0, selStart);
  const fullAfter = current.substring(selEnd);
  return {
    value: fullBefore + beforeMark + selected + afterMark + fullAfter,
    selStart: selStart + beforeMark.length,
    selEnd: selStart + beforeMark.length + selected.length,
  };
}

/** 计算光标所在行号（0 起） */
function lineIndexOf(content: string, offset: number): number {
  const lines = content.split("\n");
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length + (i > 0 ? 1 : 0) > offset) return i;
    charCount += lines[i].length + (i > 0 ? 1 : 0);
  }
  return lines.length - 1;
}

/**
 * 标题层级转换：对选区逐行（或光标所在行）set-or-toggle——行已精确等于目标级别
 * 则剥掉 `#×level+空格` 切回普通段；其他级别/普通段一律置为该级别（v0.15：
 * 对齐 CM 版 computeHeadingChanges 的切换语义，修复"点 H1 无取消"；
 * 原"已是标题的行跳过"已废弃）。多行选区 → 选区每行转换；无选区 → 光标所在行
 * 转换。光标落在末行标记后（剥除时落行首）。
 *
 * Why（v0.13.9 修复）：原 wrapSelection 只在选区开头插一次标记——全选多行加 H1
 * 只有首行生效，且光标回跳到文档开头（选区起点 0 → 视图跳顶）；本函数逐行转换
 * + 光标落在末行，视图停在被编辑区域，不跳顶。
 */
export function headingLines(content: string, selStart: number, selEnd: number, level: number): EditResult {
  const start = Math.min(selStart, selEnd);
  const end = Math.max(selStart, selEnd);
  const lines = content.split("\n");
  let startLine = lineIndexOf(content, start);
  let endLine = lineIndexOf(content, end);
  // 选区尾恰在行首（\n 之后第一字符）且非空选区 → 该行未被选中（选区到上一行结尾止）
  if (end > start && end > 0 && content[end - 1] === "\n" && endLine > startLine) {
    endLine -= 1;
  }
  const target = Math.max(1, Math.min(level, 6));
  const marker = "#".repeat(target) + " ";
  // 原文本每行行首 offset（行尾 \n 记 1 字符）——光标落位用
  const lineOffsets: number[] = [0];
  for (let i = 1; i < lines.length; i++) {
    lineOffsets.push(lineOffsets[i - 1] + lines[i - 1].length + 1);
  }
  let deltaBeforeEnd = 0; // 末行之前各行的净变更增量（插入为正、剥除/换级为负）
  let endLineDelta = 0; // 末行自身变换后光标在"新末行"内的落点
  for (let i = startLine; i <= endLine; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i]);
    if (m) {
      const cur = m[1].length;
      if (cur === target) {
        // 同级别 → 剥除（切换取消）
        lines[i] = lines[i].slice(m[0].length);
        if (i < endLine) deltaBeforeEnd -= m[0].length;
      } else {
        // 其他级别 → 剥旧标记 + 插新标记（换级）
        lines[i] = marker + lines[i].slice(m[0].length);
        const net = marker.length - m[0].length;
        if (i < endLine) deltaBeforeEnd += net;
        else endLineDelta = marker.length;
      }
    } else {
      // 普通段 → 行首插入
      lines[i] = marker + lines[i];
      if (i < endLine) deltaBeforeEnd += marker.length;
      else endLineDelta = marker.length;
    }
  }
  // 光标 = 新末行行首 + 末行落点
  const cursor = lineOffsets[endLine] + deltaBeforeEnd + endLineDelta;
  return { value: lines.join("\n"), selStart: cursor, selEnd: cursor };
}

/** A1：提升标题层级（减一个 #）；H1 → 普通段落；不可提升返回 null（不动内容） */
export function promoteHeading(content: string, selStart: number): EditResult | null {
  const lines = content.split("\n");
  const idx = lineIndexOf(content, selStart);
  const line = lines[idx];
  if (/^#{2,6}\s/.test(line)) {
    lines[idx] = line.replace(/^#/, "");
  } else if (line.startsWith("# ")) {
    // 已是 H1，降为普通段落
    lines[idx] = line.replace(/^#\s+/, "");
  } else {
    return null;
  }
  return { value: lines.join("\n"), selStart, selEnd: selStart };
}

/** A1：降低标题层级（加一个 #）；普通段落 → H6 */
export function demoteHeading(content: string, selStart: number): EditResult {
  const lines = content.split("\n");
  const idx = lineIndexOf(content, selStart);
  const line = lines[idx];
  lines[idx] = /^#{1,5}\s/.test(line) ? "#" + line : "###### " + line;
  return { value: lines.join("\n"), selStart, selEnd: selStart };
}

/** A1：合并段落——选区内换行替换为空格；无选区返回 null（不动内容） */
export function mergeSelection(content: string, selStart: number, selEnd: number): EditResult | null {
  if (selStart === selEnd) return null;
  const selected = content.substring(selStart, selEnd);
  const merged = selected.replace(/\n+/g, " ");
  return {
    value: content.substring(0, selStart) + merged + content.substring(selEnd),
    selStart,
    selEnd: selStart + merged.length,
  };
}

/** A1：拆分段落——光标处插入换行 */
export function splitAtCursor(content: string, selStart: number): EditResult {
  return {
    value: content.substring(0, selStart) + "\n" + content.substring(selStart),
    selStart: selStart + 1,
    selEnd: selStart + 1,
  };
}
