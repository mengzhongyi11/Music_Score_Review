// Package models 保存 sqlx 行结构体。
//
// 三个必须遵守的约定（都直接决定前端契约是否一致）：
//  1. 可空列一律用指针（*string/*int/httpx.NullJSTime），nil 序列化成 null；
//     用零值会输出 "" / 0，与 Node 版不符
//  2. TINYINT(1) 布尔列扫进 int（mysql2 返回 0/1 数字，不是 true/false）
//  3. 时间列用 httpx.JSTime / httpx.NullJSTime，保证输出 .000Z 格式
package models

import "score-review/server-go/internal/httpx"

// ScoreBaseRow 只含 scores 表自身的列。
//
// 用于 `SELECT * FROM scores` 的场景（如 full-score 里的 score 字段）——
// 那里的响应不应出现 owner_name / owner_avatar 键，与 Node 版一致。
type ScoreBaseRow struct {
	ID            int              `json:"id" db:"id"`
	Name          string           `json:"name" db:"name"`
	Composer      string           `json:"composer" db:"composer"`
	Description   *string          `json:"description" db:"description"`
	OwnerID       *int             `json:"owner_id" db:"owner_id"`
	IsPublic      int              `json:"is_public" db:"is_public"`
	ReviewStatus  string           `json:"review_status" db:"review_status"`
	ReviewedBy    *int             `json:"reviewed_by" db:"reviewed_by"`
	ReviewComment *string          `json:"review_comment" db:"review_comment"`
	ReviewedAt    httpx.NullJSTime `json:"reviewed_at" db:"reviewed_at"`
	CreatedAt     httpx.JSTime     `json:"created_at" db:"created_at"`
	UpdatedAt     httpx.JSTime     `json:"updated_at" db:"updated_at"`
}

// ScoreRow = 表列 + JOIN 出的扩展列（列表 / 详情 / 搜索端点使用）。
type ScoreRow struct {
	ScoreBaseRow
	OwnerName   *string `json:"owner_name" db:"owner_name"`
	OwnerAvatar *string `json:"owner_avatar" db:"owner_avatar"`
	// 仅列表端点有该列；详情/搜索端点没有，此时为 nil 且因 omitempty 不出现在 JSON 里
	CommentCount *int `json:"comment_count,omitempty" db:"comment_count"`
}

// SectionRow 对应 sections 表。
type SectionRow struct {
	ID            int              `json:"id" db:"id"`
	ScoreID       int              `json:"score_id" db:"score_id"`
	ParentID      *int             `json:"parent_id" db:"parent_id"`
	Name          string           `json:"name" db:"name"`
	Path          string           `json:"path" db:"path"`
	Type          string           `json:"type" db:"type"`
	Content       *string          `json:"content" db:"content"`
	Tempo         *string          `json:"tempo" db:"tempo"`
	KeySignature  *string          `json:"key_signature" db:"key_signature"`
	TimeSignature *string          `json:"time_signature" db:"time_signature"`
	SortOrder     int              `json:"sort_order" db:"sort_order"`
	CreatedAt     httpx.JSTime     `json:"created_at" db:"created_at"`
	UpdatedAt     httpx.JSTime     `json:"updated_at" db:"updated_at"`
}

// SectionVersionRow 对应 section_versions 表。
type SectionVersionRow struct {
	ID            int         `json:"id" db:"id"`
	SectionID     int         `json:"section_id" db:"section_id"`
	Name          string      `json:"name" db:"name"`
	Content       *string     `json:"content" db:"content"`
	Tempo         *string     `json:"tempo" db:"tempo"`
	KeySignature  *string     `json:"key_signature" db:"key_signature"`
	TimeSignature *string     `json:"time_signature" db:"time_signature"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
}

// CommentRow 对应 comments 表（含 JOIN 出的用户信息）。
type CommentRow struct {
	ID         int         `json:"id" db:"id"`
	SectionID  int         `json:"section_id" db:"section_id"`
	UserID     int         `json:"user_id" db:"user_id"`
	Author     string      `json:"author" db:"author"`
	Avatar     *string     `json:"avatar" db:"avatar"`
	Content    string      `json:"content" db:"content"`
	Status     string      `json:"status" db:"status"`
	MeasureRef *string     `json:"measure_ref" db:"measure_ref"`
	CreatedAt  httpx.JSTime `json:"created_at" db:"created_at"`
	UserRole   *string     `json:"user_role,omitempty" db:"user_role"`
	UserTitle  *string     `json:"user_title,omitempty" db:"user_title"`
}

// UserRow 对应 users 表（不含密码时会单独裁剪）。
type UserRow struct {
	ID            int         `json:"id" db:"id"`
	Name          string      `json:"name" db:"name"`
	Nickname      *string     `json:"nickname" db:"nickname"`
	Avatar        *string     `json:"avatar" db:"avatar"`
	Role          string      `json:"role" db:"role"`
	Title         *string     `json:"title" db:"title"`
	Bio           *string     `json:"bio" db:"bio"`
	PhoneVerified int         `json:"phone_verified" db:"phone_verified"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
}
