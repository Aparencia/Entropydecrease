package middleware

// @ai-context
// goroutine panic 统一防护：Go 中任一 goroutine panic 且未 recover 会直接崩溃整个进程。
// 本包提供 GoSafe 包装器，供所有 go 启动点使用（writePump/readPump/cleanupLoop/
// 异步查询等），把"单连接/单协程异常"隔离在进程之外。
// Why: 2026-08 审计发现 sync-service 生产代码 0 处 defer recover()，11 处 go 启动点
// 任一 panic 即整体宕机；WebSocket 长连接场景下恶意/异常帧是真实触发源。
// 注意：recover 只阻止进程崩溃，不替代业务错误处理——日志必须保留上下文。

import "log"

// GoSafe 在 goroutine 内执行 fn，panic 时记录日志并吞掉异常（不崩溃进程）。
// 用法：go GoSafe(func() { ... })
func GoSafe(fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[panicguard] goroutine recovered: %v", r)
		}
	}()
	fn()
}
