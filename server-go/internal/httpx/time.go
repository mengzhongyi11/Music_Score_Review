package httpx

import (
	"database/sql/driver"
	"fmt"
	"time"
)

// jstLayout 复刻 mysql2 + Express 的时间序列化结果：
// UTC、毫秒固定 3 位、以 Z 结尾，例如 2024-01-01T00:00:00.000Z。
//
// Go 的 time.Time 默认 JSON 形如 2024-01-01T00:00:00Z（无毫秒），
// 会造成前端契约不一致，因此所有时间字段统一走本类型。
const jstLayout = "2006-01-02T15:04:05.000Z"

// 解析 MySQL 驱动在 parseTime=true 下可能给出的几种文本形态
var parseLayouts = []string{
	"2006-01-02 15:04:05.999999",
	"2006-01-02 15:04:05",
	time.RFC3339Nano,
	time.RFC3339,
}

// JSTime 用于**非空**时间列（如 created_at）。
type JSTime struct {
	time.Time
}

func (t JSTime) MarshalJSON() ([]byte, error) {
	if t.IsZero() {
		return []byte("null"), nil
	}
	return []byte(`"` + t.UTC().Format(jstLayout) + `"`), nil
}

func (t *JSTime) UnmarshalJSON(b []byte) error {
	s := string(b)
	if s == "null" || s == "" {
		t.Time = time.Time{}
		return nil
	}
	return t.parse(trimQuotes(s))
}

func (t *JSTime) Scan(v any) error {
	switch val := v.(type) {
	case nil:
		t.Time = time.Time{}
		return nil
	case time.Time:
		t.Time = val
		return nil
	case []byte:
		return t.parse(string(val))
	case string:
		return t.parse(val)
	default:
		return fmt.Errorf("httpx.JSTime: 不支持的扫描类型 %T", v)
	}
}

func (t JSTime) Value() (driver.Value, error) {
	if t.IsZero() {
		return nil, nil
	}
	return t.Time, nil
}

func (t *JSTime) parse(s string) error {
	for _, layout := range parseLayouts {
		if parsed, err := time.ParseInLocation(layout, s, time.UTC); err == nil {
			t.Time = parsed
			return nil
		}
	}
	return fmt.Errorf("httpx.JSTime: 无法解析时间 %q", s)
}

// NullJSTime 用于**可空**时间列（如 reviewed_at / resolved_at）。
//
// 注意不能直接用 *JSTime：database/sql 扫到 NULL 时会去调用已分配指针的
// Scan(nil)，指针本身仍非 nil，序列化出来就变成了零值时间而不是 null。
type NullJSTime struct {
	Time  time.Time
	Valid bool
}

func (n NullJSTime) MarshalJSON() ([]byte, error) {
	if !n.Valid {
		return []byte("null"), nil
	}
	return []byte(`"` + n.Time.UTC().Format(jstLayout) + `"`), nil
}

func (n *NullJSTime) Scan(v any) error {
	if v == nil {
		n.Time, n.Valid = time.Time{}, false
		return nil
	}
	var t JSTime
	if err := t.Scan(v); err != nil {
		return err
	}
	n.Time, n.Valid = t.Time, true
	return nil
}

func (n NullJSTime) Value() (driver.Value, error) {
	if !n.Valid {
		return nil, nil
	}
	return n.Time, nil
}

// NowISO 复刻 Node 的 new Date().toISOString()，用于 handler 内自行生成的时间戳。
func NowISO() string {
	return time.Now().UTC().Format(jstLayout)
}

func trimQuotes(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		return s[1 : len(s)-1]
	}
	return s
}
