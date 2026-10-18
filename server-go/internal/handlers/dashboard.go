package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
)

// ActivityPoint 近 7 天每日活动点。
type ActivityPoint struct {
	Day   httpx.JSTime `json:"day" db:"day"`
	Type  string       `json:"type" db:"type"`
	Count int          `json:"count" db:"count"`
}

// TopContributor 贡献者排行项。
type TopContributor struct {
	ID           int     `json:"id" db:"id"`
	Name         string  `json:"name" db:"name"`
	Avatar       *string `json:"avatar" db:"avatar"`
	Role         string  `json:"role" db:"role"`
	CommentCount int     `json:"comment_count" db:"comment_count"`
}

// TagDistribution 标签分布项。
type TagDistribution struct {
	Name       string `json:"name" db:"name"`
	Color      string `json:"color" db:"color"`
	ScoreCount int    `json:"score_count" db:"score_count"`
}

type dashboardResponse struct {
	Activity        []ActivityPoint   `json:"activity"`
	TopContributors []TopContributor  `json:"topContributors"`
	TagDistribution []TagDistribution `json:"tagDistribution"`
}

// GetDashboard GET /api/dashboard
func (h *Handler) GetDashboard(c *gin.Context) {
	ctx := c.Request.Context()

	activity := make([]ActivityPoint, 0)
	if err := h.App.DB.SelectContext(ctx, &activity,
		`SELECT DATE(time) as day, type, COUNT(*) as count FROM (
		   SELECT created_at as time, 'comment' as type FROM comments
		   UNION ALL
		   SELECT created_at as time, 'version' as type FROM section_versions
		   UNION ALL
		   SELECT created_at as time, 'merge' as type FROM branches WHERE status = 'merged'
		 ) AS all_activity
		 WHERE time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
		 GROUP BY DATE(time), type
		 ORDER BY day`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	contributors := make([]TopContributor, 0)
	if err := h.App.DB.SelectContext(ctx, &contributors,
		`SELECT u.id, u.name, u.avatar, u.role, COUNT(c.id) as comment_count
		 FROM comments c
		 JOIN users u ON c.user_id = u.id
		 GROUP BY u.id, u.name, u.avatar, u.role
		 ORDER BY comment_count DESC
		 LIMIT 10`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	tags := make([]TagDistribution, 0)
	if err := h.App.DB.SelectContext(ctx, &tags,
		`SELECT t.name, t.color, COUNT(st.score_id) as score_count
		 FROM tags t
		 LEFT JOIN score_tags st ON t.id = st.tag_id
		 GROUP BY t.id, t.name, t.color
		 ORDER BY score_count DESC`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	httpx.OK(c, dashboardResponse{
		Activity: activity, TopContributors: contributors, TagDistribution: tags,
	})
}
