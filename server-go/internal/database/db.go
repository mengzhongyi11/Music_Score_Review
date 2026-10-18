// Package database 负责 MySQL 连接池与事务辅助。
package database

import (
	"fmt"
	"log/slog"
	"time"

	_ "github.com/go-sql-driver/mysql" // 注册 mysql driver
	"github.com/jmoiron/sqlx"

	"score-review/server-go/internal/config"
)

// DSN 参数说明（两个都不能少）：
//   - parseTime=true：否则 DATETIME/TIMESTAMP 会扫成 []byte 而不是 time.Time
//   - loc=Local：**必须与 mysql2 的默认行为一致**。mysql2 的 timezone 选项默认
//     'local'，即把库里的 DATETIME 字符串按**进程本地时区**解释，再转成 JS Date。
//     若写成 loc=UTC，Go 会把同样的字面量当成 UTC，输出就整体偏移一个时区
//     （实测偏移 8 小时，被契约对比脚本抓出）。
//     最终 UTC 化由 httpx.JSTime.MarshalJSON 完成，两边结果才一致。
func dsn(cfg *config.Config) string {
	return fmt.Sprintf(
		"%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&charset=utf8mb4&collation=utf8mb4_unicode_ci",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)
}

// Open 建立连接池。
//
// 注意：**不做连通性检查**。Node 版用的是 mysql.createPool()，它是惰性连接——
// 建池不建连，因此即使 MySQL 没起，服务照样能启动、/api/health 照样能响应，
// 只有真正执行查询时才会报错。这里保持同样的语义：Ping 失败仅告警，
// 不阻断启动（否则健康检查和 A/B 契约对比都无法在无数据库时进行）。
func Open(cfg *config.Config) (*sqlx.DB, error) {
	db, err := sqlx.Open("mysql", dsn(cfg))
	if err != nil {
		return nil, fmt.Errorf("打开数据库连接失败: %w", err)
	}

	// 对齐 Node 版 db.ts 的 connectionLimit: 10
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)
	// 短于 MySQL 默认 wait_timeout(8h)，避免复用到已被服务端关闭的连接
	db.SetConnMaxLifetime(3 * time.Minute)

	if err := db.Ping(); err != nil {
		slog.Warn("数据库当前不可达（服务仍会启动，查询时才会报错）", "err", err)
	} else {
		slog.Info("数据库连接正常", "host", cfg.DBHost, "port", cfg.DBPort, "database", cfg.DBName)
	}

	return db, nil
}
