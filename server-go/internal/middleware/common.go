package middleware

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
)

// maxBodyBytes 对齐 Node 版 express.json({ limit: '10mb' })
const maxBodyBytes = 10 << 20

// BodyLimit 限制请求体大小。
func BodyLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
		c.Next()
	}
}

// CORS 复刻 Node 版 cors({ origin: CLIENT_ORIGIN, credentials: true })：
// 只放行单一前端来源，且允许携带凭证。
func CORS(clientOrigin string) gin.HandlerFunc {
	return cors.New(cors.Config{
		AllowOrigins:     []string{clientOrigin},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	})
}

// RequestLogger 对应 Node 版 pino-http：记录方法、路径、状态码与耗时。
func RequestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		slog.Info("request",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"duration_ms", time.Since(start).Milliseconds(),
		)
	}
}

// Recover 兜底 panic，避免单个请求打挂整个进程。
//
// Node 版 Express 的默认行为是记录错误并返回 500，文案与多数端点的
// "服务器繁忙" 对齐；具体端点若文案不同，仍以各 handler 自己写的为准。
func Recover() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("请求处理 panic", "panic", r, "path", c.Request.URL.Path)
				httpx.Fail(c, http.StatusInternalServerError, "服务器繁忙")
				c.Abort()
			}
		}()
		c.Next()
	}
}
