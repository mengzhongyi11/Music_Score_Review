package services

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// Cache 是 server/src/services/cache.ts 的 Go 移植。
//
// 关键行为：**优雅降级**——Redis 不可用时所有操作静默跳过，直接走数据库，
// 不影响主流程。因此 Redis 是可选依赖，本地不启也能跑。
//
// 缓存内容按**原始 JSON 字节**存取（而不是解码成 any 再编码）：
// 后者会把数字全部变成 float64，重新序列化时大整数会被写成科学计数法（1e+06），
// 破坏与 Node 版的字节一致性。
type Cache struct {
	client   *redis.Client
	available atomic.Bool
	once     sync.Once
	redisURL string
}

// NewCache 创建缓存客户端（懒连接：首次真正使用时才拨号）。
func NewCache(redisURL string) *Cache {
	return &Cache{redisURL: redisURL}
}

// ensure 保证只尝试连接一次；返回当前是否可用。
func (c *Cache) ensure(ctx context.Context) bool {
	if c == nil {
		return false
	}
	c.once.Do(func() {
		opts, err := redis.ParseURL(c.redisURL)
		if err != nil {
			slog.Warn("Redis 地址解析失败（缓存降级为直查数据库）", "url", c.redisURL, "err", err)
			return
		}
		client := redis.NewClient(opts)

		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		if err := client.Ping(pingCtx).Err(); err != nil {
			slog.Warn("Redis 不可用（缓存降级为直查数据库）", "err", err)
			_ = client.Close()
			return
		}

		c.client = client
		c.available.Store(true)
		slog.Info("Redis 缓存已连接", "url", c.redisURL)
	})
	return c.available.Load() && c.client != nil
}

// Available 报告缓存当前是否可用。
func (c *Cache) Available(ctx context.Context) bool { return c.ensure(ctx) }

// GetRaw 读缓存原始字节；未命中或不可用时返回 (nil, false)。
func GetRaw(ctx context.Context, c *Cache, key string) ([]byte, bool) {
	if !c.ensure(ctx) {
		return nil, false
	}
	raw, err := c.client.Get(ctx, key).Bytes()
	if err != nil {
		return nil, false
	}
	return raw, true
}

// SetRaw 写缓存原始字节（带 TTL）；失败不影响主流程。
func SetRaw(ctx context.Context, c *Cache, key string, raw []byte, ttl time.Duration) {
	if !c.ensure(ctx) {
		return
	}
	_ = c.client.Set(ctx, key, raw, ttl).Err()
}

// Del 删除缓存，支持 `*` 通配（用 SCAN 遍历，与 Node 版一致）。
func Del(ctx context.Context, c *Cache, patterns ...string) {
	if !c.ensure(ctx) {
		return
	}
	for _, pattern := range patterns {
		if !hasWildcard(pattern) {
			_ = c.client.Del(ctx, pattern).Err()
			continue
		}

		var cursor uint64
		for {
			keys, next, err := c.client.Scan(ctx, cursor, pattern, 100).Result()
			if err != nil {
				break
			}
			if len(keys) > 0 {
				_ = c.client.Del(ctx, keys...).Err()
			}
			cursor = next
			if cursor == 0 {
				break
			}
		}
	}
}

// WithRawCache 缓存包裹：命中直接把原始字节写回响应，未命中执行 build 生成 JSON。
//
// Go 不允许带类型参数的方法，所以写成接收 *Cache 的泛型无关函数 ——
// build 直接返回最终 JSON 字节，调用方负责把它写回。
func WithRawCache(
	ctx context.Context,
	c *Cache,
	key string,
	ttl time.Duration,
	build func() ([]byte, error),
) ([]byte, error) {
	if raw, ok := GetRaw(ctx, c, key); ok {
		return raw, nil
	}
	raw, err := build()
	if err != nil {
		return nil, err
	}
	SetRaw(ctx, c, key, raw, ttl)
	return raw, nil
}

func hasWildcard(s string) bool {
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '*', '?', '[':
			return true
		}
	}
	return false
}
