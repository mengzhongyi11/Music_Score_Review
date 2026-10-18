package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
)

// StatsRow 统计面板数据。
type StatsRow struct {
	MyScores        int `json:"myScores"`
	MyCollaborators int `json:"myCollaborators"`
	PendingReviews  int `json:"pendingReviews"`
	ActiveBranches  int `json:"activeBranches"`
	TotalSections   int `json:"totalSections"`
	TodayEdits      int `json:"todayEdits"`
}

// GetStats GET /api/stats?user_id=
//
// 传入 user_id 时统计范围限于「该用户拥有的乐谱」，否则统计全站。
// 注意 Node 版在无 user_id 时把 myCollaborators / todayEdits 直接置 0（不发查询）。
func (h *Handler) GetStats(c *gin.Context) {
	ctx := c.Request.Context()

	var userID *int
	if raw := c.Query("user_id"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			userID = &n
		}
	}

	var stats StatsRow
	var err error

	if userID != nil {
		uid := *userID
		if err = h.App.DB.GetContext(ctx, &stats.MyScores,
			"SELECT COUNT(*) as count FROM scores WHERE owner_id = ?", uid); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.MyCollaborators,
			`SELECT COUNT(DISTINCT sc.user_id) as count FROM score_collaborators sc
			 JOIN scores s ON sc.score_id = s.id WHERE s.owner_id = ?`, uid); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.PendingReviews,
			`SELECT COUNT(*) as count FROM comments c
			 JOIN sections sec ON c.section_id = sec.id
			 JOIN scores s ON sec.score_id = s.id
			 WHERE s.owner_id = ? AND c.status = 'open'`, uid); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.ActiveBranches,
			`SELECT COUNT(*) as count FROM branches
			 WHERE score_id IN (SELECT id FROM scores WHERE owner_id = ?) AND status = ?`,
			uid, "active"); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.TotalSections,
			`SELECT COUNT(*) as count FROM sections WHERE type = 'section'
			 AND score_id IN (SELECT id FROM scores WHERE owner_id = ?)`, uid); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.TodayEdits,
			`SELECT COUNT(*) as count FROM section_versions sv
			 JOIN sections sec ON sv.section_id = sec.id
			 WHERE sec.score_id IN (SELECT id FROM scores WHERE owner_id = ?)
			 AND DATE(sv.created_at) = CURDATE()`, uid); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
	} else {
		// 无 user_id：全站统计；Node 版对 myCollaborators / todayEdits 直接给 0
		if err = h.App.DB.GetContext(ctx, &stats.MyScores,
			"SELECT COUNT(*) as count FROM scores"); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.PendingReviews,
			"SELECT COUNT(*) as count FROM comments WHERE status = 'open'"); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.ActiveBranches,
			"SELECT COUNT(*) as count FROM branches WHERE status = 'active'"); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
		if err = h.App.DB.GetContext(ctx, &stats.TotalSections,
			"SELECT COUNT(*) as count FROM sections WHERE type = 'section'"); err != nil {
			httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
			return
		}
	}

	httpx.OK(c, stats)
}
