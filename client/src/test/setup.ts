/**
 * Vitest 全局测试环境装配
 *
 * @ai-context: 由 vitest.config.ts 的 setupFiles 自动加载，引入 jest-dom
 * 断言扩展（toBeInTheDocument 等）。测试环境隔离：不连接任何真实数据库。
 */
import '@testing-library/jest-dom';
