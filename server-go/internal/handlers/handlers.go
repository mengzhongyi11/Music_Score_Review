// Package handlers 实现全部 HTTP 端点。
//
// 每个文件对应 server/src/routes/ 下的一个文件；Handler 持有依赖容器，
// 各 handler 方法只做「取参 → 查库 → 写响应」，与 Node 版结构对齐。
package handlers

import (
	"strconv"

	"score-review/server-go/internal/app"
)

// Handler 是所有端点的接收者。
type Handler struct {
	App *app.App
}

// New 创建 Handler。
func New(a *app.App) *Handler { return &Handler{App: a} }

/* ── 参数解析小工具 ── */

// parsePositiveIntParam 复刻 Node 的 `Math.max(1, Number(x))`。
// 解析失败（JS 里是 NaN，属 falsy）时返回 nil，表示该参数不生效。
func parsePositiveIntParam(raw string) *int {
	if raw == "" {
		return nil
	}
	n, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return nil // JS Number('abc') === NaN，NaN 为 falsy，参数被忽略
	}
	v := int(n)
	if v < 1 {
		v = 1
	}
	return &v
}

// parsePageSizeParam 复刻 `Math.min(100, Math.max(1, Number(x)))`。
func parsePageSizeParam(raw string) *int {
	p := parsePositiveIntParam(raw)
	if p == nil {
		return nil
	}
	v := *p
	if v > 100 {
		v = 100
	}
	return &v
}

// intParam 取路径参数中的整数；解析失败返回 0。
func intParam(s string) int {
	n, _ := strconv.Atoi(s)
	return n
}
