// Package app 是依赖容器。
//
// Node 版的 ruleKnowledgeBase / cache / codeStore 都是模块级可变状态（包级变量），
// Go 里一律改为显式持有：main 构造一次，经本容器注入 router 与各 handler，
// 既避免包级全局，也便于测试时替换成 fake 实现。
package app

import (
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/config"
	"score-review/server-go/internal/rules"
	"score-review/server-go/internal/services"
)

// App 持有全部长生命周期依赖。
type App struct {
	Cfg       *config.Config
	DB        *sqlx.DB
	Cache     *services.Cache
	KB        *rules.KnowledgeBase
	DashScope *services.DashScopeClient
	Embedding *services.EmbeddingService
	AIReview  *services.AIReviewService
	Codes     *services.CodeStore
}

// New 按依赖顺序组装容器。
func New(cfg *config.Config, db *sqlx.DB) *App {
	kb := rules.New()
	client := services.NewDashScopeClient(cfg.DashScopeKey)
	embedding := services.NewEmbeddingService(client, cfg.DataDir)

	return &App{
		Cfg:       cfg,
		DB:        db,
		Cache:     services.NewCache(cfg.RedisURL),
		KB:        kb,
		DashScope: client,
		Embedding: embedding,
		AIReview:  services.NewAIReviewService(db, kb, client),
		Codes:     services.NewCodeStore(),
	}
}
