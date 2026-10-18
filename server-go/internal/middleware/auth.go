// Package middleware 提供与 Node 版行为一致的 Gin 中间件。
package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"score-review/server-go/internal/httpx"
)

// AuthUser 是 JWT 载荷承载的身份信息，与 Node 版 payload `{ id, role }` 对齐。
type AuthUser struct {
	ID   int    `json:"id"`
	Role string `json:"role"`
}

const (
	ctxUserKey = "auth_user"
	tokenTTL   = 7 * 24 * time.Hour // Node 版 JWT_EXPIRES_IN = '7d'
)

// SignToken 签发 HS256 JWT。
//
// 与 jsonwebtoken 的 sign 保持一致：载荷含 id、role，并自动带 iat、exp。
func SignToken(secret string, u AuthUser) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"id":   u.ID,
		"role": u.Role,
		"iat":  now.Unix(),
		"exp":  now.Add(tokenTTL).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

// parseToken 校验签名与过期时间并取出身份。
func parseToken(secret, raw string) (AuthUser, error) {
	var u AuthUser
	token, err := jwt.Parse(raw, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return u, jwt.ErrTokenInvalidClaims
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return u, jwt.ErrTokenInvalidClaims
	}

	// JSON 数字在 MapClaims 里是 float64
	if id, ok := claims["id"].(float64); ok {
		u.ID = int(id)
	}
	if role, ok := claims["role"].(string); ok {
		u.Role = role
	}
	return u, nil
}

// bearerToken 从 Authorization 头取 Bearer token。
func bearerToken(c *gin.Context) (string, bool) {
	header := c.GetHeader("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", false
	}
	return strings.TrimPrefix(header, "Bearer "), true
}

// RequireAuth 鉴权中间件：缺失或无效 token 一律 401，文案与 Node 版逐字一致。
func RequireAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw, ok := bearerToken(c)
		if !ok {
			httpx.Fail(c, http.StatusUnauthorized, "未登录或 token 缺失")
			c.Abort()
			return
		}
		u, err := parseToken(secret, raw)
		if err != nil {
			httpx.Fail(c, http.StatusUnauthorized, "token 无效或已过期")
			c.Abort()
			return
		}
		c.Set(ctxUserKey, u)
		c.Next()
	}
}

// OptionalAuth 可选鉴权：有合法 token 就挂身份，否则放行。
// 与 Node 版一致——定义了但当前没有端点使用。
func OptionalAuth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if raw, ok := bearerToken(c); ok {
			if u, err := parseToken(secret, raw); err == nil {
				c.Set(ctxUserKey, u)
			}
		}
		c.Next()
	}
}

// AdminOnly 角色校验：非 admin 一律 403。
func AdminOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		if u, ok := CurrentUser(c); !ok || u.Role != "admin" {
			httpx.Fail(c, http.StatusForbidden, "仅管理员可执行此操作")
			c.Abort()
			return
		}
		c.Next()
	}
}

// CurrentUser 从上下文取当前身份。
func CurrentUser(c *gin.Context) (AuthUser, bool) {
	v, ok := c.Get(ctxUserKey)
	if !ok {
		return AuthUser{}, false
	}
	u, ok := v.(AuthUser)
	return u, ok
}
