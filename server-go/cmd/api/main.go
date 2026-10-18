// Command api 是乐谱审阅系统的 Go 后端入口。
//
// 对照 server/src/index.ts：装配依赖 → 建路由 → 监听 3001。
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"score-review/server-go/internal/app"
	"score-review/server-go/internal/config"
	"score-review/server-go/internal/database"
	"score-review/server-go/internal/router"
)

func main() {
	cfg := config.Load()
	setupLogger(cfg.LogLevel)

	db, err := database.Open(cfg)
	if err != nil {
		slog.Error("数据库初始化失败", "err", err)
		os.Exit(1)
	}
	defer func() { _ = db.Close() }()

	// 依赖容器：Node 版里这些是模块级全局状态，Go 侧显式构造一次后注入
	application := app.New(cfg, db)

	// 异步加载规则知识库 + 初始化向量索引（不阻塞启动，与 Node 版一致）
	go func() {
		slog.Info("规则知识库加载完成", "entries", application.KB.Len())

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		if err := application.Embedding.InitVectorIndex(ctx, application.KB); err != nil {
			// 与 Node 版一致：失败仅告警，自动降级为关键词匹配
			slog.Warn("向量索引加载失败（将降级为关键词匹配）", "err", err)
		}
	}()

	engine := router.New(application)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: engine,
	}

	go func() {
		slog.Info("服务器启动成功", "url", "http://localhost:"+cfg.Port)
		slog.Info("API 文档", "url", "http://localhost:"+cfg.Port+"/api/health")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("服务启动失败", "err", err)
			os.Exit(1)
		}
	}()

	// 阶段 4 会在此处异步初始化向量索引（不阻塞启动），与 Node 版一致。

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("正在关闭服务器…")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// setupLogger 用标准库 slog，level 取自 LOG_LEVEL（与 Node 版同名）。
func setupLogger(level string) {
	var lv slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lv = slog.LevelDebug
	case "warn":
		lv = slog.LevelWarn
	case "error":
		lv = slog.LevelError
	default:
		lv = slog.LevelInfo
	}

	// 生产输出 JSON（对应 pino 的默认行为），开发用文本便于阅读（对应 pino-pretty）
	var handler slog.Handler
	if os.Getenv("NODE_ENV") == "production" {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lv})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: lv})
	}
	slog.SetDefault(slog.New(handler))
}
