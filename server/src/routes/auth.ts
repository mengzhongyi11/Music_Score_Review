import { Router, Request, Response } from 'express';
import pool from '../db';
import crypto from 'crypto';

const router = Router();

// 简单密码哈希（明文存于演示环境）
function hash(pw: string): string {
  return crypto.createHash('sha256').update(pw).digest('hex').slice(0, 20);
}

// 验证码存储（生产环境用 Redis）
const codeStore: Record<string, { code: string; time: number }> = {};

// ── 注册 ──
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, password, nickname, phone, code } = req.body;
    if (!name || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
    if (name.length < 2) return res.status(400).json({ message: '用户名至少2个字符' });
    if (password.length < 4) return res.status(400).json({ message: '密码至少4个字符' });

    // 验证码校验
    if (phone) {
      const stored = codeStore[phone];
      if (!stored || stored.code !== code || Date.now() - stored.time > 300000) {
        return res.status(400).json({ message: '验证码错误或已过期（演示模式：验证码为 123456）' });
      }
      delete codeStore[phone];
    }

    const [exist] = await pool.query('SELECT id FROM users WHERE name = ?', [name]);
    if ((exist as any[]).length > 0) return res.status(400).json({ message: '用户名已存在' });

    const [result] = await pool.query(
      'INSERT INTO users (name, password, nickname, phone, phone_verified, role) VALUES (?, ?, ?, ?, ?, ?)',
      [name, hash(password), nickname || name, phone || '', phone ? true : false, 'contributor']
    );
    const insertResult = result as any;
    res.status(201).json({
      user: { id: insertResult.insertId, name, nickname: nickname || name, role: 'contributor' },
      token: `token_${insertResult.insertId}`,
    });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// ── 登录 ──
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) return res.status(400).json({ message: '请输入用户名和密码' });

    const [rows] = await pool.query('SELECT * FROM users WHERE name = ?', [name]);
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ message: '用户不存在' });
    if (users[0].password && users[0].password !== hash(password)) {
      return res.status(401).json({ message: '密码错误' });
    }
    const u = users[0];
    res.json({
      user: { id: u.id, name: u.name, nickname: u.nickname || u.name, role: u.role, phone_verified: !!u.phone_verified },
      token: `token_${u.id}`,
    });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// ── 发送验证码（演示模拟） ──
router.post('/send-code', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: '请输入手机号' });

    // 演示环境：固定验证码 123456
    const code = '123456';
    codeStore[phone] = { code, time: Date.now() };

    console.log(`[验证码] 手机 ${phone} → 验证码: ${code}`);
    res.json({
      message: `验证码已发送到 ${phone.slice(0, 3)}****${phone.slice(-4)}（演示模式，验证码固定为 123456）`,
    });
  } catch (err) {
    console.error('发送验证码失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// ── 修改密码（需手机验证） ──
router.put('/password', async (req: Request, res: Response) => {
  try {
    const { userId, oldPassword, newPassword, phone, code } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ message: '参数不完整' });

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ message: '用户不存在' });

    // 手机号验证
    if (phone && users[0].phone === phone) {
      const stored = codeStore[phone];
      if (!stored || stored.code !== code || Date.now() - stored.time > 300000) {
        return res.status(400).json({ message: '验证码错误（演示模式：123456）' });
      }
      delete codeStore[phone];
    } else if (users[0].password && users[0].password !== hash(oldPassword || '')) {
      return res.status(401).json({ message: '原密码错误' });
    }

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash(newPassword), userId]);
    res.json({ message: '密码修改成功' });
  } catch (err) {
    console.error('修改密码失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// ── 修改昵称 ──
router.put('/nickname', async (req: Request, res: Response) => {
  try {
    const { userId, nickname } = req.body;
    if (!userId || !nickname) return res.status(400).json({ message: '参数不完整' });
    await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, userId]);
    res.json({ message: '昵称已更新' });
  } catch (err) {
    console.error('修改昵称失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// ── 获取当前用户 ──
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: '未登录' });
    const token = authHeader.replace('Bearer ', '');
    const userId = parseInt(token.replace('token_', ''));
    if (!userId) return res.status(401).json({ message: '无效的 token' });

    const [rows] = await pool.query(
      'SELECT id, name, nickname, role, title, bio, avatar, phone_verified, created_at FROM users WHERE id = ?',
      [userId]
    );
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ message: '用户不存在' });
    res.json({ user: users[0] });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
