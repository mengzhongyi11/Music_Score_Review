package handlers

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"score-review/server-go/internal/httpx"
	"score-review/server-go/internal/middleware"
	"score-review/server-go/internal/services"
)

// hashPassword 复刻 Node 的 `crypto.createHash('sha256').update(pw).digest('hex').slice(0, 20)`。
//
// ⚠ 必须逐字节一致：库里存的是这个值，算法稍有差异所有既有用户都无法登录。
// 这是演示级哈希（非 bcrypt），无盐、截断到 20 位，安全性弱，属既有设计。
func hashPassword(pw string) string {
	sum := sha256.Sum256([]byte(pw))
	return hex.EncodeToString(sum[:])[:20]
}

// verificationCodeTTL 与 Node 的 300000ms 一致。
const verificationCodeTTL = 5 * time.Minute

// demoVerificationCode 演示环境固定验证码。
const demoVerificationCode = "123456"

/* ── 响应结构（字段顺序对齐 Node 字面量） ── */

type registerUserPayload struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Nickname string `json:"nickname"`
	Role     string `json:"role"`
}

type loginUserPayload struct {
	ID            int    `json:"id"`
	Name          string `json:"name"`
	Nickname      string `json:"nickname"`
	Role          string `json:"role"`
	PhoneVerified bool   `json:"phone_verified"`
}

// meUserPayload 既用于扫描又用于序列化。
// ⚠ db 标签不能省：sqlx 默认按字段名小写匹配，PhoneVerified → "phoneverified"，
// 与列名 phone_verified 对不上会报 missing destination name。
type meUserPayload struct {
	ID            int          `json:"id" db:"id"`
	Name          string       `json:"name" db:"name"`
	Nickname      *string      `json:"nickname" db:"nickname"`
	Role          string       `json:"role" db:"role"`
	Title         *string      `json:"title" db:"title"`
	Bio           *string      `json:"bio" db:"bio"`
	Avatar        *string      `json:"avatar" db:"avatar"`
	PhoneVerified int          `json:"phone_verified" db:"phone_verified"`
	CreatedAt     httpx.JSTime `json:"created_at" db:"created_at"`
}

type authTokenResponse[T any] struct {
	User  T      `json:"user"`
	Token string `json:"token"`
}

type meResponse struct {
	User meUserPayload `json:"user"`
}

/* ── 注册 ── */

// Register POST /api/auth/register
func (h *Handler) Register(c *gin.Context) {
	var body struct {
		Name     string  `json:"name"`
		Password string  `json:"password"`
		Nickname *string `json:"nickname"`
		Phone    *string `json:"phone"`
		Code     *string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "用户名和密码不能为空")
		return
	}
	if body.Name == "" || body.Password == "" {
		httpx.Fail(c, http.StatusBadRequest, "用户名和密码不能为空")
		return
	}
	if len([]rune(body.Name)) < 2 {
		httpx.Fail(c, http.StatusBadRequest, "用户名至少2个字符")
		return
	}
	if len([]rune(body.Password)) < 4 {
		httpx.Fail(c, http.StatusBadRequest, "密码至少4个字符")
		return
	}

	ctx := c.Request.Context()

	// 手机号存在时校验验证码
	phone := ""
	if body.Phone != nil {
		phone = *body.Phone
	}
	if phone != "" {
		entry, ok := h.App.Codes.Get(phone)
		code := ""
		if body.Code != nil {
			code = *body.Code
		}
		if !ok || entry.Code != code || time.Now().UnixMilli()-entry.Time > verificationCodeTTL.Milliseconds() {
			httpx.Fail(c, http.StatusBadRequest, "验证码错误或已过期（演示模式：验证码为 123456）")
			return
		}
		h.App.Codes.Delete(phone)
	}

	var exist []int
	if err := h.App.DB.SelectContext(ctx, &exist, "SELECT id FROM users WHERE name = ?", body.Name); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	if len(exist) > 0 {
		httpx.Fail(c, http.StatusBadRequest, "用户名已存在")
		return
	}

	nickname := body.Name
	if body.Nickname != nil && *body.Nickname != "" {
		nickname = *body.Nickname
	}
	phoneVerified := phone != ""

	res, err := h.App.DB.ExecContext(ctx,
		"INSERT INTO users (name, password, nickname, phone, phone_verified, role) VALUES (?, ?, ?, ?, ?, ?)",
		body.Name, hashPassword(body.Password), nickname, phone, phoneVerified, "contributor")
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	id, _ := res.LastInsertId()

	token, err := middleware.SignToken(h.App.Cfg.JWTSecret, middleware.AuthUser{ID: int(id), Role: "contributor"})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	c.PureJSON(http.StatusCreated, authTokenResponse[registerUserPayload]{
		User:  registerUserPayload{ID: id, Name: body.Name, Nickname: nickname, Role: "contributor"},
		Token: token,
	})
}

/* ── 登录 ── */

// Login POST /api/auth/login
func (h *Handler) Login(c *gin.Context) {
	var body struct {
		Name     string `json:"name"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "请输入用户名和密码")
		return
	}
	if body.Name == "" || body.Password == "" {
		httpx.Fail(c, http.StatusBadRequest, "请输入用户名和密码")
		return
	}

	ctx := c.Request.Context()
	// ⚠ sqlx 要求查询返回的**每一列**都有对应字段，否则报 missing destination name。
	// SELECT * 会带出 users 的全部 11 列，所以这里必须列全（不能只写用到的几个）。
	var u struct {
		ID            int          `db:"id"`
		Name          string       `db:"name"`
		Password      *string      `db:"password"`
		Nickname      *string      `db:"nickname"`
		Phone         *string      `db:"phone"`
		PhoneVerified *int         `db:"phone_verified"`
		Avatar        *string      `db:"avatar"`
		Role          *string      `db:"role"`
		Title         *string      `db:"title"`
		Bio           *string      `db:"bio"`
		CreatedAt     httpx.JSTime `db:"created_at"`
	}
	err := h.App.DB.GetContext(ctx, &u, "SELECT * FROM users WHERE name = ?", body.Name)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 安全修复：Node 版在 password 为空（NULL/空串）时**跳过校验**，
	// 导致任何密码都能登录任何未设置密码的账号（seed 用户全部命中）。
	// 这里改为：未设置密码的账号一律拒绝登录。
	if u.Password == nil || *u.Password == "" {
		httpx.Fail(c, http.StatusUnauthorized, "该账号尚未设置密码，请联系管理员")
		return
	}
	if *u.Password != hashPassword(body.Password) {
		httpx.Fail(c, http.StatusUnauthorized, "密码错误")
		return
	}

	nickname := u.Name
	if u.Nickname != nil && *u.Nickname != "" {
		nickname = *u.Nickname
	}
	role := "contributor"
	if u.Role != nil && *u.Role != "" {
		role = *u.Role
	}
	phoneVerified := u.PhoneVerified != nil && *u.PhoneVerified != 0

	token, err := middleware.SignToken(h.App.Cfg.JWTSecret, middleware.AuthUser{ID: u.ID, Role: role})
	if err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	httpx.OK(c, authTokenResponse[loginUserPayload]{
		User: loginUserPayload{
			ID: u.ID, Name: u.Name, Nickname: nickname, Role: role, PhoneVerified: phoneVerified,
		},
		Token: token,
	})
}

/* ── 验证码 ── */

// SendCode POST /api/auth/send-code（演示模式：固定 123456）
func (h *Handler) SendCode(c *gin.Context) {
	var body struct {
		Phone *string `json:"phone"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Phone == nil || *body.Phone == "" {
		httpx.Fail(c, http.StatusBadRequest, "请输入手机号")
		return
	}
	phone := *body.Phone
	h.App.Codes.Set(phone, services.VerificationCode{
		Code: demoVerificationCode, Time: time.Now().UnixMilli(),
	})

	// 与 Node 一致：手机号打码后回显
	masked := phone
	if len([]rune(phone)) > 7 {
		r := []rune(phone)
		masked = string(r[:3]) + "****" + string(r[len(r)-4:])
	}
	httpx.OK(c, messageResponse{
		Message: "验证码已发送到 " + masked + "（演示模式，验证码固定为 123456）",
	})
}

/* ── 改密码 ── */

// UpdatePassword PUT /api/auth/password
func (h *Handler) UpdatePassword(c *gin.Context) {
	var body struct {
		UserID      *int    `json:"userId"`
		OldPassword *string `json:"oldPassword"`
		NewPassword *string `json:"newPassword"`
		Phone       *string `json:"phone"`
		Code        *string `json:"code"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}
	if body.UserID == nil || body.NewPassword == nil || *body.NewPassword == "" {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}

	ctx := c.Request.Context()
	var u struct {
		ID            int          `db:"id"`
		Name          string       `db:"name"`
		Password      *string      `db:"password"`
		Nickname      *string      `db:"nickname"`
		Phone         *string      `db:"phone"`
		PhoneVerified *int         `db:"phone_verified"`
		Avatar        *string      `db:"avatar"`
		Role          *string      `db:"role"`
		Title         *string      `db:"title"`
		Bio           *string      `db:"bio"`
		CreatedAt     httpx.JSTime `db:"created_at"`
	}
	err := h.App.DB.GetContext(ctx, &u, "SELECT * FROM users WHERE id = ?", *body.UserID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}

	// 手机号验证优先，否则回落到原密码校验
	phone := ""
	if body.Phone != nil {
		phone = *body.Phone
	}
	storedPhone := ""
	if u.Phone != nil {
		storedPhone = *u.Phone
	}

	if phone != "" && storedPhone == phone {
		entry, ok := h.App.Codes.Get(phone)
		code := ""
		if body.Code != nil {
			code = *body.Code
		}
		if !ok || entry.Code != code || time.Now().UnixMilli()-entry.Time > verificationCodeTTL.Milliseconds() {
			httpx.Fail(c, http.StatusBadRequest, "验证码错误（演示模式：123456）")
			return
		}
		h.App.Codes.Delete(phone)
	} else {
		old := ""
		if body.OldPassword != nil {
			old = *body.OldPassword
		}
		// 安全修复：未设置密码的账号不能靠"任意原密码"改密，必须走手机验证码
		if u.Password == nil || *u.Password == "" {
			httpx.Fail(c, http.StatusBadRequest, "该账号尚未设置密码，请通过手机验证码重置")
			return
		}
		if *u.Password != hashPassword(old) {
			httpx.Fail(c, http.StatusUnauthorized, "原密码错误")
			return
		}
	}

	if _, err := h.App.DB.ExecContext(ctx,
		"UPDATE users SET password = ? WHERE id = ?", hashPassword(*body.NewPassword), *body.UserID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "密码修改成功"})
}

// UpdateNickname PUT /api/auth/nickname
func (h *Handler) UpdateNickname(c *gin.Context) {
	var body struct {
		UserID   *int    `json:"userId"`
		Nickname *string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}
	if body.UserID == nil || body.Nickname == nil || *body.Nickname == "" {
		httpx.Fail(c, http.StatusBadRequest, "参数不完整")
		return
	}
	if _, err := h.App.DB.ExecContext(c.Request.Context(),
		"UPDATE users SET nickname = ? WHERE id = ?", *body.Nickname, *body.UserID); err != nil {
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, messageResponse{Message: "昵称已更新"})
}

/* ── 当前用户（JWT 鉴权） ── */

// GetMe GET /api/auth/me
func (h *Handler) GetMe(c *gin.Context) {
	user, ok := middleware.CurrentUser(c)
	if !ok {
		httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
		return
	}

	var u meUserPayload
	err := h.App.DB.GetContext(c.Request.Context(), &u,
		"SELECT id, name, nickname, role, title, bio, avatar, phone_verified, created_at FROM users WHERE id = ?",
		user.ID)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpx.Fail(c, http.StatusNotFound, "用户不存在")
			return
		}
		httpx.FailWith(c, http.StatusInternalServerError, "服务器繁忙", err)
		return
	}
	httpx.OK(c, meResponse{User: u})
}
