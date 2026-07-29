/**
 * className 合并工具
 *
 * @ai-context: 纯函数。clsx 处理条件类名，twMerge 消除 Tailwind 冲突类
 * （后者覆盖前者），使组件可安全接收外部 className 覆盖默认样式。
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
