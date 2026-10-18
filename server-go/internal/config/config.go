// Package config 集中管理运行时配置。
//
// 环境变量名与 Node 版完全一致（server/src/db.ts 及各处的 process.env 读取点），
// 以便 docker-compose 与前端契约无需改动即可复用。
package config

import (
	"bufio"
	"log/slog"
	"os"
	"strings"
)

// 与 Node 版保持一致的默认值
const (
	defaultPort         = "3001"
	defaultClientOrigin = "http://localhost:5173"
	defaultJWTSecret    = "score-review-dev-secret"
	defaultLogLevel     = "info"
	defaultRedisURL     = "redis://localhost:6379"
	defaultDataDir      = "./data"

	defaultDBHost = "localhost"
	defaultDBPort = "3306"
	defaultDBUser = "root"
	defaultDBName = "score_review"

	// 与 server/src/db.ts:26 一致：缺 DB_PASSWORD 时回退到该开发用默认值。
	// ⚠ 这是 Node 版就存在的安全隐患（硬编码密码），此处保持行为一致，
	//   建议后续单独清理（改为缺失即失败）。
	devFallbackDBPassword = "4435790"
)

// Config 保存全部配置项。
type Config struct {
	Port         string
	ClientOrigin string
	JWTSecret    string
	LogLevel     string
	RedisURL     string
	DataDir      string
	DashScopeKey string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
}

// Load 读取 .env（若存在）后组装配置。
//
// .env 解析语义复刻 server/src/db.ts：逐行读取、跳过空行与 # 开头的注释、
// 按第一个 '=' 切分、两端去空白，且**已存在的真实环境变量优先**（不覆盖）。
func Load() *Config {
	loadDotEnv(".env")

	cfg := &Config{
		Port:         env("PORT", defaultPort),
		ClientOrigin: env("CLIENT_ORIGIN", defaultClientOrigin),
		JWTSecret:    env("JWT_SECRET", defaultJWTSecret),
		LogLevel:     env("LOG_LEVEL", defaultLogLevel),
		RedisURL:     env("REDIS_URL", defaultRedisURL),
		DataDir:      env("DATA_DIR", defaultDataDir),
		DashScopeKey: os.Getenv("DASHSCOPE_API_KEY"),

		DBHost:     env("DB_HOST", defaultDBHost),
		DBPort:     env("DB_PORT", defaultDBPort),
		DBUser:     env("DB_USER", defaultDBUser),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBName:     env("DB_NAME", defaultDBName),
	}

	if cfg.DBPassword == "" {
		slog.Warn("环境变量 DB_PASSWORD 未设置，请创建 .env 文件（参考 .env.example）")
		slog.Warn("使用默认密码（仅开发环境）")
		cfg.DBPassword = devFallbackDBPassword
	}

	return cfg
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv 解析 .env 并注入进程环境变量。
// 已存在的环境变量不会被覆盖，与 Node 版 `if (!process.env[key])` 的语义一致。
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return // 文件不存在是正常情况，配置全部走真实环境变量
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		if key == "" {
			continue
		}
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}
