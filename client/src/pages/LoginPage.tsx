import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // 验证码倒计时
  useEffect(() => {
    if (codeCountdown > 0) {
      const t = setTimeout(() => setCodeCountdown(codeCountdown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [codeCountdown]);

  const handleSendCode = async () => {
    if (!phone || phone.length < 7) { setError('请输入正确的手机号'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }
      setCodeSent(true);
      setCodeCountdown(60);
      setError(null); // 清除错误，显示成功消息
      alert(data.message + '\n\n⚠️ 演示说明：当前为演示环境，无法对接真实短信网关。\n验证码固定为 123456，可直接填写。\n手机号仅用于身份验证，不会被其他用户看到。');
    } catch (err: any) {
      setError('网络错误: ' + err.message);
    } finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !password.trim()) { setError('用户名和密码不能为空'); return; }
    if (mode === 'register' && !nickname.trim()) { setError('请输入昵称'); return; }
    setLoading(true);
    setError(null);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body: any = mode === 'login'
        ? { name: name.trim(), password }
        : { name: name.trim(), password, nickname: nickname.trim(), phone, code };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message); return; }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('current_user', JSON.stringify(data.user));
      navigate('/projects');
    } catch (err: any) {
      setError('网络错误: ' + err.message);
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.musicNotes}>
        <span className={styles.note}>♩</span><span className={styles.note}>♪</span>
        <span className={styles.note}>♫</span><span className={styles.note}>♬</span>
        <span className={styles.note}>🎵</span><span className={styles.note}>🎶</span>
        <span className={styles.note}>𝄞</span><span className={styles.note}>♩</span>
        <span className={styles.note}>♪</span><span className={styles.note}>♫</span>
        <span className={styles.note}>♬</span><span className={styles.note}>🎵</span>
      </div>
      <div className={styles.staffDecoration} />
      <div className={styles.card}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>谱</span>
          <span className={styles.logoText}>谱审</span>
        </div>
        <p className={styles.tagline}>乐谱版本管理与协作审阅平台</p>

        <div className={styles.tabs}>
          <button className={`${styles.tab} ${mode === 'login' ? styles.tabActive : ''}`}
            onClick={() => { setMode('login'); setError(null); }}>
            登录
          </button>
          <button className={`${styles.tab} ${mode === 'register' ? styles.tabActive : ''}`}
            onClick={() => { setMode('register'); setError(null); }}>
            注册
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>用户名</label>
            <input className={styles.input} placeholder="输入用户名" value={name}
              onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>密码</label>
            <input className={styles.input} type="password" placeholder="输入密码" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>

          {mode === 'register' && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>昵称</label>
                <input className={styles.input} placeholder="输入昵称（可后续修改）" value={nickname}
                  onChange={(e) => setNickname(e.target.value)} />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>手机号</label>
                <div className={styles.phoneRow}>
                  <input className={styles.input} placeholder="输入手机号" value={phone}
                    onChange={(e) => setPhone(e.target.value)} />
                  <button className={styles.codeBtn} onClick={handleSendCode}
                    disabled={codeCountdown > 0 || loading}>
                    {codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码'}
                  </button>
                </div>
                <p className={styles.phoneHint}>
                  手机号仅用于身份验证，不会公开显示。
                  当前为演示模式，验证码固定为 <strong>123456</strong>
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label}>验证码</label>
                <input className={styles.input} placeholder="输入验证码" value={code}
                  onChange={(e) => setCode(e.target.value)} />
              </div>
            </>
          )}

          {error && <div className={styles.error}>! {error}</div>}

          <button className={styles.submitBtn} onClick={handleSubmit}
            disabled={loading || !name.trim() || !password.trim()}>
            {loading ? '处理中…' : (mode === 'login' ? '🎵 登录' : '🎶 注册并进入')}
          </button>
        </div>
      </div>
    </div>
  );
}
