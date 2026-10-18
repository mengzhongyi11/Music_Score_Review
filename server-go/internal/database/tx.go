package database

import (
	"context"
	"errors"

	"github.com/jmoiron/sqlx"
)

// ErrNotFound 供事务回调中途"业务性中止"使用。
//
// 有些端点（如版本回滚）需要在事务进行到一半时返回 404。直接在回调里写
// HTTP 响应会导致事务无法回滚，所以约定：回调返回 ErrNotFound，
// handler 用 errors.Is 判定后映射成对应状态码与文案。
var ErrNotFound = errors.New("记录不存在")

// WithTx 在事务中执行 fn：返回 nil 则提交，返回错误则回滚。
//
// 迁移背景：Node 版有 5 个端点手写了 beginTransaction/commit/rollback/release，
// 另有 3 个端点存在多写但无事务（见计划中的缺陷修复清单）。统一走这里。
func WithTx(ctx context.Context, db *sqlx.DB, fn func(tx *sqlx.Tx) error) error {
	tx, err := db.BeginTxx(ctx, nil)
	if err != nil {
		return err
	}

	committed := false
	defer func() {
		// panic 或提前 return 时兜底回滚；已提交则跳过
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}
