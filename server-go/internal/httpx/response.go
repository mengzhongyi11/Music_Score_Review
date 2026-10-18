// Package httpx 收敛响应写法，保证与 Node 版逐端点形状一致。
//
// Node 版没有统一 envelope，全靠每个 handler 自己 res.json(...)；
// 这里同样不做统一包装，只提供三个语义明确的助手。
package httpx

import (
	"log/slog"

	"github.com/gin-gonic/gin"
)

// Fail 写统一错误体。字段名是 message（不是 error），与 Node 版一致；
// 具体文案由调用方给出——Node 各端点的 500 文案并不相同。
func Fail(c *gin.Context, status int, message string) {
	c.PureJSON(status, gin.H{"message": message})
}

// FailWith 在 Fail 之前记录原始错误，避免每次都要手写 slog。
func FailWith(c *gin.Context, status int, message string, err error) {
	if err != nil {
		slog.Error(message, "err", err, "path", c.Request.URL.Path)
	}
	c.PureJSON(status, gin.H{"message": message})
}

// List 写**裸数组**响应。
//
// nil slice 会被 encoding/json 序列化成 null，而前端一律使用 .map()，
// null 会直接崩——这是迁移中最容易踩的契约破坏点，故此处强制兜底为 []。
func List[T any](c *gin.Context, rows []T) {
	if rows == nil {
		rows = make([]T, 0)
	}
	c.PureJSON(200, rows)
}

// OK 写任意对象响应。
//
// 用 PureJSON 而非 JSON：gin 的 JSON 会转义 < > &，
// 而 Node 的 JSON.stringify 不会；简谱里的 >（重音标记）会被写成 >，
// 造成字节级差异（解析后等值，但不利于契约比对与排查）。
func OK(c *gin.Context, v any) {
	c.PureJSON(200, v)
}
