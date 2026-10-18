package handlers

import (
	"net/http"
	"sort"
	"strconv"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
)

// FeedItem 动态流的统一条目。
// 字段顺序与 Node 版构造对象时的顺序一致。
type FeedItem struct {
	Type        string      `json:"type"`
	Time        httpx.JSTime `json:"time"`
	UserName    string      `json:"user_name"`
	Avatar      *string     `json:"avatar"`
	Summary     string      `json:"summary"`
	ScoreName   string      `json:"score_name"`
	ScoreID     int         `json:"score_id"`
	SectionName string      `json:"section_name"`
	RefStatus   *string     `json:"ref_status"`
	RefMeasure  *string     `json:"ref_measure"`
}

// GetFeed GET /api/feed?limit=
//
// 三张表各查一次后在内存里合成统一格式，按时间倒序取前 limit 条。
// 时间排序用 SliceStable：JS 的 Array.sort 是稳定的，并列时顺序才不会漂移。
func (h *Handler) GetFeed(c *gin.Context) {
	ctx := c.Request.Context()

	limit := 20
	if raw := c.Query("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n != 0 {
			limit = n
		}
	}
	if limit > 50 {
		limit = 50
	}

	// ① 评论
	commentRows := make([]struct {
		Type       string       `db:"type"`
		Time       httpx.JSTime `db:"time"`
		UserName   string       `db:"user_name"`
		Avatar     *string      `db:"avatar"`
		Summary    string       `db:"summary"`
		ScoreName  string       `db:"score_name"`
		ScoreID    int          `db:"score_id"`
		SectionName string      `db:"section_name"`
		RefStatus  *string      `db:"ref_status"`
		RefMeasure *string      `db:"ref_measure"`
	}, 0)
	if err := h.App.DB.SelectContext(ctx, &commentRows,
		`SELECT 'comment' as type, c.created_at as time, u.name as user_name, u.avatar,
		        c.content as summary, sc.name as score_name, sc.id as score_id,
		        s.name as section_name, c.status as ref_status, c.measure_ref as ref_measure
		 FROM comments c
		 JOIN users u ON c.user_id = u.id
		 JOIN sections s ON c.section_id = s.id
		 JOIN scores sc ON s.score_id = sc.id`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// ② 已合并的分支
	mergeRows := make([]struct {
		Type       string       `db:"type"`
		Time       httpx.JSTime `db:"time"`
		UserName   string       `db:"user_name"`
		Avatar     *string      `db:"avatar"`
		BranchName string       `db:"branch_name"`
		ScoreName  string       `db:"score_name"`
		ScoreID    int          `db:"score_id"`
	}, 0)
	if err := h.App.DB.SelectContext(ctx, &mergeRows,
		`SELECT 'merge' as type, b.created_at as time, u.name as user_name, u.avatar,
		        b.name as branch_name, sc.name as score_name, sc.id as score_id
		 FROM branches b
		 JOIN users u ON b.created_by = u.id
		 JOIN scores sc ON b.score_id = sc.id
		 WHERE b.status = 'merged'`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	// ③ 版本快照
	versionRows := make([]struct {
		Type        string       `db:"type"`
		Time        httpx.JSTime `db:"time"`
		SectionName string       `db:"section_name"`
		ScoreName   string       `db:"score_name"`
		ScoreID     int          `db:"score_id"`
	}, 0)
	if err := h.App.DB.SelectContext(ctx, &versionRows,
		`SELECT 'version' as type, sv.created_at as time, s.name as section_name,
		        sc.name as score_name, sc.id as score_id
		 FROM section_versions sv
		 JOIN sections s ON sv.section_id = s.id
		 JOIN scores sc ON s.score_id = sc.id`); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙，请稍后重试", err)
		return
	}

	emptyAvatar := ""
	feed := make([]FeedItem, 0, len(commentRows)+len(mergeRows)+len(versionRows))

	for _, r := range commentRows {
		feed = append(feed, FeedItem{
			Type: "comment", Time: r.Time, UserName: r.UserName, Avatar: r.Avatar,
			Summary: r.Summary, ScoreName: r.ScoreName, ScoreID: r.ScoreID,
			SectionName: r.SectionName, RefStatus: r.RefStatus, RefMeasure: r.RefMeasure,
		})
	}
	for _, r := range mergeRows {
		feed = append(feed, FeedItem{
			Type: "merge", Time: r.Time, UserName: r.UserName, Avatar: r.Avatar,
			Summary: r.BranchName + " 已合并到主分支", ScoreName: r.ScoreName, ScoreID: r.ScoreID,
			SectionName: "", RefStatus: nil, RefMeasure: nil,
		})
	}
	for _, r := range versionRows {
		feed = append(feed, FeedItem{
			Type: "version", Time: r.Time, UserName: "系统", Avatar: &emptyAvatar,
			Summary: "「" + r.SectionName + "」已保存版本", ScoreName: r.ScoreName, ScoreID: r.ScoreID,
			SectionName: r.SectionName, RefStatus: nil, RefMeasure: nil,
		})
	}

	sort.SliceStable(feed, func(i, j int) bool {
		return feed[i].Time.After(feed[j].Time.Time)
	})

	if limit < len(feed) {
		feed = feed[:limit]
	}
	httpx.List(c, feed)
}
