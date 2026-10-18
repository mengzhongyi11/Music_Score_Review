package services

import "sync"

// VerificationCode 一条验证码记录。
type VerificationCode struct {
	Code string
	Time int64 // Unix 毫秒，与 JS Date.now() 对齐
}

// CodeStore 是验证码的内存存储。
//
// Node 版用模块级对象 `const codeStore: Record<string, {code, time}>`，
// Go 侧改为带锁的结构体并注入，避免包级全局。
//
// ⚠ 与 Node 同源的问题：进程内存存储，多实例部署时互相看不见，
// 重启即丢失。Node 注释里也写了「生产环境用 Redis」，此处保持一致。
type CodeStore struct {
	mu    sync.Mutex
	codes map[string]VerificationCode
}

// NewCodeStore 创建验证码存储。
func NewCodeStore() *CodeStore {
	return &CodeStore{codes: make(map[string]VerificationCode)}
}

// Set 写入验证码。
func (s *CodeStore) Set(phone string, entry VerificationCode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.codes[phone] = entry
}

// Get 读取验证码。
func (s *CodeStore) Get(phone string) (VerificationCode, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.codes[phone]
	return v, ok
}

// Delete 消费验证码。
func (s *CodeStore) Delete(phone string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.codes, phone)
}
