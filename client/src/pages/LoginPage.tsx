import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LoginPage.module.css';

interface AuthUser {
  id: number;
  name: string;
  role: string;
  title: string | null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 检查是否已登录
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          if (data.user) {
            localStorage.setItem('current_user', JSON.stringify(data.user));
            navigate('/projects');
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) { setError('请输入用户名'); return; }
    setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { name: name.trim() }
        : { name: name.trim(), role: 'contributor', title: title.trim() || null };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || '操作失败');
        return;
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
      navigate('/projects');
    } catch (err: any) {
      setError('网络错误: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className={styles.page}>
      {/* 浮动音乐符号背景 */}
      <div className={styles.musicNotes}>
        <span className={styles.note}>♩</span>
        <span className={styles.note}>♪</span>
        <span className={styles.note}>♫</span>
        <span className={styles.note}>♬</span>
        <span className={styles.note}>🎵</span>
        <span className={styles.note}>🎶</span>
        <span className={styles.note}>𝄞</span>
        <span className={styles.note}>♩</span>
        <span className={styles.note}>♪</span>
        <span className={styles.note}>♫</span>
        <span className={styles.note}>♬</span>
        <span className={styles.note}>🎵</span>
      </div>
      {/* 底部五线谱装饰 */}
      <div className={styles.staffDecoration} />
      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logo}>
          <span className={styles.logoIcon}>谱</span>
          <span className={styles.logoText}>谱审</span>
        </div>
        <p className={styles.tagline}>乐谱版本管理与协作审阅平台</p>

        {/* 模式切换 */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setMode('login'); setError(null); }}
          >
            登录
          </button>
          <button
            className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setMode('register'); setError(null); }}
          >
            注册
          </button>
        </div>

        {/* 表单 */}
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>用户名</label>
            <input
              className={styles.input}
              placeholder="输入用户名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>

          {mode === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>身份 / 职称（可选）</label>
              <input
                className={styles.input}
                placeholder="例：作曲系研究生"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
          )}

          {error && <div className={styles.error}>! {error}</div>}

          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
          >
            {loading ? '处理中…' : (mode === 'login' ? '🎵 进入谱审' : '🎶 注册并进入')}
          </button>

        </div>
      </div>
    </div>
  );
}
