// Package rules 承载 GB/T 记谱规范知识库（解析 + 关键词倒排索引 + 检索）。
//
// 文档通过 go:embed 打进二进制：Node 版用 path.resolve(__dirname, '../../../简谱规则')
// 指向仓库根目录，而 Go 没有 __dirname，且 go:embed 不允许引用包目录之外（不能用 ..），
// 因此文档被物理复制到 embedded/ 下。
//
// ⚠ 维护提示：源文档在仓库根目录的「简谱规则/」「五线谱规则/」「简谱五线谱映射规范.md」，
// 修改后需重新复制到本目录，否则二进制里仍是旧规则。
package rules

import (
	"embed"
	"io/fs"
	"sort"
	"strings"
)

//go:embed embedded
var embeddedFS embed.FS

// SourceFile 一份已加载的规则文档。
type SourceFile struct {
	Name    string // 文件名
	Content string
}

// LoadEmbeddedDocs 按 Node 版的加载顺序返回全部规则文档。
//
// Node 版顺序：简谱规则 → 五线谱规则 → 映射规范文件。
// 目录内文件按文件名**显式排序**：Node 的 fs.readdirSync 顺序依赖操作系统，
// 显式排序才能让条目下标稳定（下标会影响关键词索引与并列时的排序结果）。
func LoadEmbeddedDocs() (jianpu, staff []SourceFile, mapping string, err error) {
	jianpu, err = readDir("embedded/jianpu")
	if err != nil {
		return nil, nil, "", err
	}
	staff, err = readDir("embedded/staff")
	if err != nil {
		return nil, nil, "", err
	}

	entries, err := bundledFiles.ReadDir("embedded/mapping")
	if err != nil {
		return nil, nil, "", err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		b, rerr := embeddedFS.ReadFile("embedded/mapping/" + e.Name())
		if rerr != nil {
			return nil, nil, "", rerr
		}
		mapping = string(b)
		break // Node 版只读这一个文件
	}

	return jianpu, staff, mapping, nil
}

// bundledFiles 与 embeddedFS 同源，单独取名便于阅读。
var bundledFiles = embeddedFS

func readDir(dir string) ([]SourceFile, error) {
	entries, err := fs.ReadDir(embeddedFS, dir)
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".md") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names) // 显式排序，见函数注释

	out := make([]SourceFile, 0, len(names))
	for _, name := range names {
		b, err := embeddedFS.ReadFile(dir + "/" + name)
		if err != nil {
			return nil, err
		}
		out = append(out, SourceFile{Name: name, Content: string(b)})
	}
	return out, nil
}
