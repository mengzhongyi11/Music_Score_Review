// Package router 组装中间件与全部路由。
//
// 这是 server/src/index.ts 的对照物：中间件顺序与 21 个挂载点必须逐行对齐。
package router

import (
	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/app"
	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/middleware"
)

// healthResponse 字段顺序与 Node 版字面量顺序一致（status 在前）。
type healthResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// New 构建 Gin 引擎。
func New(a *app.App) *gin.Engine {
	r := gin.New() // 不用 gin.Default()：Logger/Recovery 由下面显式装配

	// ── 中间件顺序对照 index.ts ──
	// pinoHttp → helmet → cors → express.json({ limit: '10mb' })
	r.Use(middleware.Recover())
	r.Use(middleware.RequestLogger())
	r.Use(middleware.CORS(a.Cfg.ClientOrigin))
	r.Use(middleware.BodyLimit())

	// ── 健康检查 ──
	// Node 版内联在 index.ts 中（不在任何 router 文件里），此处保持一致。
	//
	// 用结构体而不是 gin.H：gin.H 是 map，encoding/json 会按键名排序输出，
	// 而 Express 保持字面量顺序（status 在前）。结构体按字段声明顺序输出，
	// 才能与 Node 版逐字节一致。
	r.GET("/api/health", func(c *gin.Context) {
		httpx.OK(c, healthResponse{Status: "ok", Message: "乐谱审阅系统 API 运行中"})
	})

	// ── 业务路由 ──
	// 阶段 2/3/4 逐步补齐，挂载点须与 index.ts 完全一致：
	//   /api/scores /api/sections /api/comments /api/users /api/versions
	//   /api (fullscore) /api/branches /api/feed /api/stats /api/tags
	//   /api/dashboard /api/collaborators /api/auth /api/import
	//   /api/invitations /api/reviews /api/notifications /api/ai-review
	//   /api/merge /api/impact /api/preferences
	registerRoutes(r, a)

	return r
}
