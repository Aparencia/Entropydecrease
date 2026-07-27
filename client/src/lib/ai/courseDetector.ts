/**
 * 课程识别客户端 — AI 模式（可选）
 * 从首帧关键帧推断课程名称、学科、专业术语
 * 遵循「本地 Ollama 优先 + 云端降级」架构，失败静默降级
 */

import { aiClient } from '@/lib/http/apiClient';
import type { CourseMeta } from '@/lib/capture/captureTypes';

interface CourseDetectResponse {
  course_name: string;
  subject: string;
  suggested_terms: string[];
}

/**
 * 从关键帧图片推断课程信息
 * @param imageBase64 关键帧 JPEG base64（不含 data: 前缀）
 * @returns 检测到的课程元数据，失败返回 null
 */
export async function detectCourseFromFrame(
  imageBase64: string,
): Promise<Omit<CourseMeta, 'detectedBy'> | null> {
  try {
    const resp = await aiClient.post<CourseDetectResponse>(
      '/api/v1/multimodal/detect-course',
      { image_base64: imageBase64 },
      { timeout: 8000 },
    );

    if (!resp || (!resp.course_name && !resp.subject)) return null;

    return {
      courseName: resp.course_name || undefined,
      subject: resp.subject || undefined,
      customTerms: resp.suggested_terms?.length ? resp.suggested_terms : undefined,
    };
  } catch {
    // 静默降级：不弹错误、不阻塞采集
    return null;
  }
}
