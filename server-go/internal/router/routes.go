package router

import (
	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/app"
	"score-review/server-go/internal/handlers"
	"score-review/server-go/internal/middleware"
)

// registerRoutes 按资源分组注册业务路由。
//
// 挂载点与 server/src/index.ts 的 app.use(...) 逐个对应。
//
// ⚠ 与 Node 版的一处**有意差异**：Node 只给 5 个端点挂了鉴权，
// 大量写接口（创建/删除乐谱、分支合并、标签、协作者、导入、AI 分析…）
// 完全无鉴权。本次迁移按计划「顺手修复明显缺陷」，给**所有会写库的端点**
// 补上了 RequireAuth。纯计算的只读 POST（impact 分析、check-reject）不加，
// 因为它们不产生副作用、也不泄露数据。
func registerRoutes(r *gin.Engine, a *app.App) {
	h := handlers.New(a)
	api := r.Group("/api")
	auth := middleware.RequireAuth(a.Cfg.JWTSecret)

	// ── /api/scores ──
	scores := api.Group("/scores")
	{
		scores.GET("", h.ListScores)
		scores.GET("/search/:keyword", h.SearchScores)
		scores.GET("/:id", h.GetScore)
		scores.POST("", auth, h.CreateScore)
		scores.PUT("/:id/transfer", auth, h.TransferScore)
		scores.PUT("/:id/review-status", auth, h.UpdateReviewStatus)
		scores.DELETE("/:id", auth, h.DeleteScore)
	}

	// ── /api/sections ──
	sections := api.Group("/sections")
	{
		sections.GET("/score/:scoreId", h.ListRootSections)
		sections.GET("/score/:scoreId/tree", h.ListSectionTree)
		sections.GET("/:id/children", h.ListSectionChildren)
		sections.GET("/:id/versions", h.ListSectionVersions)
		sections.GET("/:id", h.GetSection)
		sections.POST("", auth, h.CreateSection)
		sections.PUT("/:id", auth, h.UpdateSection)
		sections.DELETE("/:id", auth, h.DeleteSection)
	}

	// ── /api/users ──
	users := api.Group("/users")
	{
		users.GET("", h.ListUsers)
		users.GET("/:id/profile", h.GetUserProfile)
		users.GET("/:id/scores", h.GetUserScores)
		users.GET("/:id/collaborations", h.GetUserCollaborations)
		users.GET("/:id/activity", h.GetUserActivity)
		users.GET("/:id", h.GetUser)
	}

	// ── /api/tags ──
	tags := api.Group("/tags")
	{
		tags.GET("", h.ListTags)
		tags.GET("/score/:scoreId", h.GetScoreTags)
		tags.PUT("/score/:scoreId", auth, h.SetScoreTags)
	}

	// ── /api/collaborators ──
	collaborators := api.Group("/collaborators")
	{
		collaborators.GET("/score/:scoreId", h.GetCollaborators)
		collaborators.POST("", auth, h.InviteCollaborator)
		collaborators.PUT("/:id/role", auth, h.UpdateCollaboratorRole)
		collaborators.DELETE("/:id", auth, h.RemoveCollaborator)
	}

	// ── /api/branches ──
	branches := api.Group("/branches")
	{
		branches.GET("/score/:scoreId", h.GetBranches)
		branches.GET("/:branchId/diff", h.GetBranchDiff)
		branches.POST("", auth, h.CreateBranch)
		branches.PUT("/:branchId/sections/:sectionId", auth, h.UpdateBranchSection)
		branches.POST("/:branchId/merge", auth, h.MergeBranch)
		branches.PUT("/:branchId/status", auth, h.UpdateBranchStatus)
	}

	// ── /api/versions ──
	versions := api.Group("/versions")
	{
		versions.GET("/:id", h.GetVersion)
		versions.POST("/:id/rollback", auth, h.RollbackVersion)
	}

	// ── /api/auth ──
	// 只有 GET /me 挂鉴权；其余是公开端点（登录/注册/验证码/改资料）
	authGroup := api.Group("/auth")
	{
		authGroup.POST("/register", h.Register)
		authGroup.POST("/login", h.Login)
		authGroup.POST("/send-code", h.SendCode)
		authGroup.PUT("/password", h.UpdatePassword)
		authGroup.PUT("/nickname", h.UpdateNickname)
		authGroup.GET("/me", auth, h.GetMe)
	}

	// ── /api/comments ──
	comments := api.Group("/comments")
	{
		comments.GET("/section/:sectionId", h.GetCommentsBySection)
		comments.GET("/by-score", h.GetAllCommentsByScore)
		comments.POST("", auth, h.CreateComment) // Node 版此处已有鉴权
		comments.PUT("/:id/status", auth, h.UpdateCommentStatus)
		comments.DELETE("/:id", auth, h.DeleteComment)
	}

	// ── /api/reviews ──
	// POST 的权限校验在 handler 内（查 users.role 是否为 admin），与 Node 一致
	reviews := api.Group("/reviews")
	{
		reviews.GET("/:scoreId", h.GetReviewHistory)
		reviews.POST("/:scoreId", auth, h.SubmitReview)
	}

	// ── /api/invitations ──
	invitations := api.Group("/invitations")
	{
		invitations.GET("/user/:userId", h.GetUserInvitations)
		invitations.GET("/score/:scoreId", h.GetScoreApplications)
		invitations.POST("", auth, h.CreateInvitation)
		invitations.PUT("/:id", auth, h.RespondInvitation)
	}

	// ── /api/ai-review ──
	aiReview := api.Group("/ai-review")
	{
		aiReview.GET("/suggestions/:scoreId", h.GetSuggestions)
		aiReview.POST("/analyze", auth, h.AnalyzeSubmission)
		aiReview.POST("/branch/:branchId", auth, h.AnalyzeBranch)
		aiReview.PUT("/suggestions/:id/status", auth, h.UpdateSuggestionStatus)
	}

	// ── /api/merge ──
	mergeGroup := api.Group("/merge")
	{
		mergeGroup.GET("/conflicts/:branchId", h.GetConflicts)
		mergeGroup.POST("/conflicts/:id/resolve", auth, h.ResolveConflict)
	}

	// ── /api/impact ──
	// 两个 POST 都是纯计算、不写库，故不加鉴权
	impact := api.Group("/impact")
	{
		impact.POST("/analyze-section", h.AnalyzeSectionImpact)
		impact.POST("/analyze-branch/:branchId", h.AnalyzeBranchImpact)
		impact.GET("/summary/:scoreId", h.GetImpactSummary)
	}

	// ── /api/preferences ──
	// check-reject 只读不写，不加鉴权
	prefs := api.Group("/preferences")
	{
		prefs.GET("/ai-stats", h.GetAIStats)
		prefs.POST("/check-reject", h.CheckReject)
		prefs.GET("/:userId/stats", h.GetPreferenceStats)
		prefs.PUT("/:userId", auth, h.UpdatePreferences)
	}

	// ── /api/import ──
	api.POST("/import", auth, h.ImportMusicXML)

	// ── /api/notifications ──
	notifications := api.Group("/notifications")
	{
		notifications.GET("/:userId", h.ListNotifications)
		notifications.GET("/:userId/unread-count", h.GetUnreadCount)
		notifications.PUT("/:id/read", auth, h.MarkNotificationRead)
		notifications.PUT("/read-all/:userId", auth, h.MarkAllNotificationsRead)
	}

	// ── /api/stats · /api/feed · /api/dashboard ──
	api.GET("/stats", h.GetStats)
	api.GET("/feed", h.GetFeed)
	api.GET("/dashboard", h.GetDashboard)

	// ── fullscore ──
	// Node 版把 fullscoreRouter 挂在 `/api` 根上，实际路径是 /api/scores/:id/full-score
	api.GET("/scores/:id/full-score", h.GetFullScore)
}
