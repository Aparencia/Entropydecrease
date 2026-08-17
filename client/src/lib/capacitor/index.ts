/**
 * Capacitor 桥接层统一出口
 *
 * @ai-context: 移动端原生能力（相机/相册/录屏/本地 ASR）经此目录暴露给渲染
 * 进程；所有桥接函数必须先经 lib/platform/platform.ts 的能力门控再调用，
 * 非 Capacitor 环境调用会抛出明确错误。
 * @ai-context EN: single export point for the Capacitor bridge; gate every
 * call through lib/platform capability checks first.
 */
export { pickImage, readDataFile } from './media';
export type { PickedImage } from './media';
