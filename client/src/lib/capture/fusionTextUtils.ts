/**
 * 融合文本处理（纯函数层）
 *
 * @ai-context: 从 CrossFusionEngine 拆出的无状态文本算法：Jaccard 字符集
 * 相似度、视觉/ASR 去重、公式提取与语音术语交叉验证。阈值 0.75 与
 * routeFusion 的去重策略语义一致但独立配置。全部纯函数，可单测。
 */
import {
  DEDUP_SIMILARITY_THRESHOLD, MATH_TERMS,
  type VisionResult,
} from './fusionTypes';

/**
 * 计算两段文本的 Jaccard 字符集相似度
 */
export function jaccardSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const setA = new Set(a);
  const setB = new Set(b);

  let intersectionSize = 0;
  for (const ch of setA) {
    if (setB.has(ch)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

/**
 * 文本去重：ASR 和视觉提取的相似文本合并
 * Jaccard 相似度 > 0.75 → 视为重复，保留置信度更高的版本（由调用方决定）
 */
export function deduplicateText(
  visionText: string,
  audioText: string,
): { merged: string; isDuplicate: boolean } {
  if (!visionText && !audioText) {
    return { merged: '', isDuplicate: false };
  }
  if (!visionText) {
    return { merged: audioText, isDuplicate: false };
  }
  if (!audioText) {
    return { merged: visionText, isDuplicate: false };
  }

  const similarity = jaccardSimilarity(visionText, audioText);

  if (similarity > DEDUP_SIMILARITY_THRESHOLD) {
    // 高度相似，标记为重复，由调用方决定保留哪个版本
    return { merged: visionText, isDuplicate: true };
  }

  // 不重复，合并文本
  return {
    merged: `${visionText}\n${audioText}`,
    isDuplicate: false,
  };
}

/**
 * 从视觉结果中提取公式
 */
export function extractFormulas(visionResults: VisionResult[]): string[] {
  const formulas: string[] = [];
  for (const result of visionResults) {
    if (result.structured) {
      const f = result.structured.formulas;
      if (Array.isArray(f)) {
        formulas.push(...f.filter((item): item is string => typeof item === 'string'));
      }
    }
  }
  return formulas;
}

/**
 * 公式校正：语音中的数学术语与视觉公式交叉验证
 * 检测语音中的数学术语，与视觉提取的 LaTeX 公式进行匹配验证
 */
export function crossValidateFormulas(
  visionFormulas: string[],
  audioText: string,
): string[] {
  if (visionFormulas.length === 0 || !audioText) return [];

  const corrected: string[] = [];

  // 检测语音中提到的数学术语
  const mentionedTerms = MATH_TERMS.filter(term => audioText.includes(term));

  if (mentionedTerms.length === 0) return [];

  // 对每个视觉公式，检查是否与语音中提到的术语相关
  for (const formula of visionFormulas) {
    const formulaLower = formula.toLowerCase();
    const hasMatch = mentionedTerms.some(term => {
      // 检查术语是否出现在公式中，或公式关键词是否在术语中
      return formulaLower.includes(term.toLowerCase())
        || term.toLowerCase().includes(formulaLower);
    });

    if (hasMatch) {
      corrected.push(`[已验证] ${formula}`);
    } else {
      corrected.push(formula);
    }
  }

  return corrected;
}
