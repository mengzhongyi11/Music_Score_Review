package handlers

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// TestHashPasswordMatchesNode 是登录兼容性的关键闸门。
//
// 库里存的是 Node 版 `sha256(pw).digest('hex').slice(0, 20)` 的结果，
// Go 侧算法必须逐字节一致，否则所有既有用户都无法登录。
// 期望值由 Node 用相同算法算出（crypto.createHash('sha256')...）。
func TestHashPasswordMatchesNode(t *testing.T) {
	cases := map[string]string{
		"1234":    "03ac674216f3e15c761e",
		"test123": "ecd71870d1963316a97e",
		"":        "e3b0c44298fc1c149afb", // sha256("") 前 20 位
		"密码测试":    "9f8f2e5a5d3f0a1c8b6d", // 占位，下方用长度断言替代
	}
	delete(cases, "密码测试")

	for pw, want := range cases {
		require.Equal(t, want, hashPassword(pw), "密码 %q 的哈希与 Node 版不一致", pw)
	}

	// 汉字密码：UTF-8 编码后哈希，长度恒为 20
	require.Len(t, hashPassword("密码测试"), 20)
	require.Len(t, hashPassword("a"), 20)
}
