// @ai-context
// handlers 包内 goroutine panic 统一防护。
// Why: Go 中任一 goroutine panic 且未 recover 会崩溃整个进程；WebSocket 长连接
// 场景下单连接异常不应拖垮服务。本文件与 middleware/panicguard.go 分工：
// middleware.GoSafe 供 main 包使用，本 goSafe 供 handlers 包内部使用（避免
// handlers → middleware 反向依赖）。
package handlers

import "log"

// goSafe 执行 fn 并 recover 一切 panic（记录日志，不崩溃进程）。
// 用法：go goSafe(func() { ... })
func goSafe(fn func()) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[panicguard] goroutine recovered: %v", r)
		}
	}()
	fn()
}
