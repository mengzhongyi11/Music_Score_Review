// 外部测试包：集成测试需要 import router，而 router 又 import handlers。
// 若用 `package handlers` 会形成 import cycle，必须放在 handlers_test。
package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"score-review/server-go/internal/app"
	"score-review/server-go/internal/config"
	"score-review/server-go/internal/database"
	"score-review/server-go/internal/router"
)

// setupServer 启动一个基于真实数据库的 httptest 服务。
//
// 与 Node 版一致，这些集成测试依赖 seed 数据（如 score 1、branch 3、用户"张教授"）。
// 若数据库不可达则跳过，保证在没有 MySQL 的机器上 `go test ./...` 仍然通过。
func setupServer(t *testing.T) *httptest.Server {
	t.Helper()

	// config.Load() 读取当前目录的 .env；测试的 cwd 是包目录，先切到模块根
	wd, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir("../.."))
	t.Cleanup(func() { _ = os.Chdir(wd) })

	cfg := config.Load()

	db, err := database.Open(cfg)
	require.NoError(t, err)
	t.Cleanup(func() { _ = db.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Skip("数据库不可达，跳过集成测试:", err)
	}

	application := app.New(cfg, db)
	srv := httptest.NewServer(router.New(application))
	t.Cleanup(srv.Close)
	return srv
}

// do 发请求并解析 JSON。
func do(t *testing.T, srv *httptest.Server, method, path string, body any, token string) (int, map[string]any, []any) {
	t.Helper()

	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, srv.URL+path, reader)
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	var raw []byte
	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(resp.Body)
	raw = buf.Bytes()

	var obj map[string]any
	var arr []any
	if len(raw) > 0 {
		if raw[0] == '[' {
			_ = json.Unmarshal(raw, &arr)
		} else {
			_ = json.Unmarshal(raw, &obj)
		}
	}
	return resp.StatusCode, obj, arr
}

/* ── 健康检查 ── */

func TestIntegrationHealth(t *testing.T) {
	srv := setupServer(t)

	status, obj, _ := do(t, srv, http.MethodGet, "/api/health", nil, "")
	require.Equal(t, http.StatusOK, status)
	assert.Equal(t, "ok", obj["status"])
	assert.Equal(t, "乐谱审阅系统 API 运行中", obj["message"])
}

/* ── 鉴权 ── */

func TestIntegrationAuthFlow(t *testing.T) {
	srv := setupServer(t)

	// 唯一用户名，避免与既有数据冲突
	name := fmt.Sprintf("go_test_%d", time.Now().UnixNano())
	const password = "test-pass-1234"

	// ① 注册
	status, obj, _ := do(t, srv, http.MethodPost, "/api/auth/register",
		map[string]any{"name": name, "password": password}, "")
	require.Equal(t, http.StatusCreated, status, "注册应返回 201: %v", obj)
	require.NotEmpty(t, obj["token"])
	user := obj["user"].(map[string]any)
	userID := int(user["id"].(float64))

	t.Cleanup(func() {
		// 清理测试用户（注意用独立连接，server 的 db 句柄在 setup 里已注册清理）
		wd, _ := os.Getwd()
		_ = os.Chdir("../..")
		cfg := config.Load()
		db, err := database.Open(cfg)
		if err == nil {
			_, _ = db.Exec("DELETE FROM users WHERE id = ?", userID)
			_ = db.Close()
		}
		_ = os.Chdir(wd)
	})

	// ② 重复注册 → 400
	status, obj, _ = do(t, srv, http.MethodPost, "/api/auth/register",
		map[string]any{"name": name, "password": password}, "")
	assert.Equal(t, http.StatusBadRequest, status)
	assert.Contains(t, obj["message"], "已存在")

	// ③ 正确密码登录
	status, obj, _ = do(t, srv, http.MethodPost, "/api/auth/login",
		map[string]any{"name": name, "password": password}, "")
	require.Equal(t, http.StatusOK, status)
	token := obj["token"].(string)
	loginUser := obj["user"].(map[string]any)
	assert.Equal(t, name, loginUser["name"])
	assert.Equal(t, "contributor", loginUser["role"])
	assert.Equal(t, false, loginUser["phone_verified"]) // Node 显式转成布尔

	// ④ 错误密码 → 401
	status, _, _ = do(t, srv, http.MethodPost, "/api/auth/login",
		map[string]any{"name": name, "password": "wrong-password"}, "")
	assert.Equal(t, http.StatusUnauthorized, status)

	// ⑤ 不存在的用户 → 404
	status, _, _ = do(t, srv, http.MethodPost, "/api/auth/login",
		map[string]any{"name": "不存在的用户_xyz", "password": "x"}, "")
	assert.Equal(t, http.StatusNotFound, status)

	// ⑥ 带 token 访问 /me
	status, obj, _ = do(t, srv, http.MethodGet, "/api/auth/me", nil, token)
	require.Equal(t, http.StatusOK, status)
	me := obj["user"].(map[string]any)
	assert.Equal(t, name, me["name"])

	// ⑦ 伪造 token → 401
	status, obj, _ = do(t, srv, http.MethodGet, "/api/auth/me", nil, "forged.token.value")
	assert.Equal(t, http.StatusUnauthorized, status)
	assert.Contains(t, obj["message"], "token")

	// ⑧ 缺失 token → 401
	status, obj, _ = do(t, srv, http.MethodGet, "/api/auth/me", nil, "")
	assert.Equal(t, http.StatusUnauthorized, status)
	assert.Contains(t, obj["message"], "未登录")
}

/* ── 写端点鉴权（本次迁移修复的缺陷） ── */

func TestIntegrationWriteEndpointsRequireAuth(t *testing.T) {
	srv := setupServer(t)

	cases := []struct {
		method string
		path   string
		body   any
	}{
		{http.MethodPost, "/api/scores", map[string]any{"name": "x", "composer": "y"}},
		{http.MethodDelete, "/api/scores/99999", nil},
		{http.MethodPut, "/api/scores/1/review-status", map[string]any{"status": "pending"}},
		{http.MethodPost, "/api/sections", map[string]any{"name": "x"}},
		{http.MethodPut, "/api/tags/score/1", map[string]any{"tag_ids": []int{}}},
		{http.MethodPost, "/api/branches", map[string]any{"score_id": 1, "name": "x"}},
		{http.MethodPost, "/api/import", map[string]any{"xml": "<x/>"}},
		{http.MethodPost, "/api/ai-review/analyze", map[string]any{"score_id": 1, "content": "x"}},
		{http.MethodPost, "/api/invitations", map[string]any{"score_id": 1, "user_id": 2}},
	}

	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			status, obj, _ := do(t, srv, c.method, c.path, c.body, "")
			assert.Equal(t, http.StatusUnauthorized, status, "写端点未鉴权: %v", obj)
		})
	}
}

/* ── 批注校验与鉴权 ── */

func TestIntegrationCommentsValidation(t *testing.T) {
	srv := setupServer(t)

	// 无 token → 401（Node 版本就要求鉴权）
	status, _, _ := do(t, srv, http.MethodPost, "/api/comments",
		map[string]any{"section_id": 1, "content": "拍号好像不对"}, "")
	assert.Equal(t, http.StatusUnauthorized, status)

	// 有 token 但参数非法 → 400 + errors[]
	token := loginAsSeedAdmin(t, srv)
	status, obj, _ := do(t, srv, http.MethodPost, "/api/comments",
		map[string]any{"content": ""}, token)
	assert.Equal(t, http.StatusBadRequest, status)
	assert.Equal(t, "参数校验失败", obj["message"])
	errs, ok := obj["errors"].([]any)
	require.True(t, ok, "应返回 errors 数组: %v", obj)
	assert.NotEmpty(t, errs)
}

// loginAsSeedAdmin 用 seed 用户登录（张教授 / 1234）。
func loginAsSeedAdmin(t *testing.T, srv *httptest.Server) string {
	t.Helper()
	status, obj, _ := do(t, srv, http.MethodPost, "/api/auth/login",
		map[string]any{"name": "张教授", "password": "1234"}, "")
	require.Equal(t, http.StatusOK, status, "seed 用户登录失败: %v", obj)
	return obj["token"].(string)
}

/* ── 只读端点形状 ── */

func TestIntegrationReadEndpoints(t *testing.T) {
	srv := setupServer(t)

	t.Run("列表端点返回裸数组", func(t *testing.T) {
		for _, path := range []string{
			"/api/scores", "/api/users", "/api/tags", "/api/sections/score/1",
			"/api/comments/by-score", "/api/branches/score/1", "/api/notifications/1",
			"/api/reviews/1", "/api/feed", "/api/collaborators/score/1",
			"/api/invitations/user/2", "/api/tags/score/1",
		} {
			status, _, arr := do(t, srv, http.MethodGet, path, nil, "")
			assert.Equal(t, http.StatusOK, status, path)
			assert.NotNil(t, arr, "%s 应返回数组（空结果也必须是 [] 而非 null）", path)
		}
	})

	t.Run("空结果仍是空数组", func(t *testing.T) {
		for _, path := range []string{
			"/api/tags/score/99999", "/api/collaborators/score/99999",
			"/api/notifications/99999", "/api/reviews/99999",
		} {
			status, _, arr := do(t, srv, http.MethodGet, path, nil, "")
			assert.Equal(t, http.StatusOK, status, path)
			assert.NotNil(t, arr, "%s 空结果必须是 []", path)
			assert.Empty(t, arr, path)
		}
	})

	t.Run("特定聚合对象形状", func(t *testing.T) {
		status, obj, _ := do(t, srv, http.MethodGet, "/api/scores/1/full-score", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, obj, "score")
		assert.Contains(t, obj, "sections")
		assert.Contains(t, obj, "comments")
		// full-score 的 score 字段来自 SELECT *，不应带 owner_* 扩展列
		score := obj["score"].(map[string]any)
		assert.NotContains(t, score, "owner_name")

		status, obj, _ = do(t, srv, http.MethodGet, "/api/branches/3/diff", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, obj, "branch")
		assert.Contains(t, obj, "diffs")

		status, obj, _ = do(t, srv, http.MethodGet, "/api/dashboard", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, obj, "activity")
		assert.Contains(t, obj, "topContributors")
		assert.Contains(t, obj, "tagDistribution")

		status, obj, _ = do(t, srv, http.MethodGet, "/api/notifications/1/unread-count", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, obj, "count")

		// AI 建议列表是**包了一层的特例**（不是裸数组）
		status, obj, _ = do(t, srv, http.MethodGet, "/api/ai-review/suggestions/1", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Contains(t, obj, "suggestions")
		assert.IsType(t, []any{}, obj["suggestions"], "空结果也必须序列化成 []")

		status, obj, _ = do(t, srv, http.MethodGet, "/api/ai-review/suggestions/99999", nil, "")
		assert.Equal(t, http.StatusOK, status)
		assert.Empty(t, obj["suggestions"])
	})

	t.Run("404 文案", func(t *testing.T) {
		status, obj, _ := do(t, srv, http.MethodGet, "/api/scores/99999", nil, "")
		assert.Equal(t, http.StatusNotFound, status)
		assert.Equal(t, "未找到该乐谱", obj["message"])

		status, obj, _ = do(t, srv, http.MethodGet, "/api/sections/99999", nil, "")
		assert.Equal(t, http.StatusNotFound, status)
		assert.Equal(t, "未找到该乐段", obj["message"])
	})
}
