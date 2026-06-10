import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 登录
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: '请输入用户名' });

    const [rows] = await pool.query('SELECT * FROM users WHERE name = ?', [name]);
    const users = rows as any[];
    if (users.length === 0) {
      return res.status(404).json({ message: '用户不存在，请先注册' });
    }
    res.json({ user: users[0], token: `token_${users[0].id}` });
  } catch (err) {
    console.error('登录失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 注册
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, role, title } = req.body;
    if (!name) return res.status(400).json({ message: '请输入用户名' });

    // 检查是否已存在
    const [exist] = await pool.query('SELECT id FROM users WHERE name = ?', [name]);
    if ((exist as any[]).length > 0) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    const [result] = await pool.query(
      'INSERT INTO users (name, role, title) VALUES (?, ?, ?)',
      [name, role || 'contributor', title || null]
    );
    const insertResult = result as any;
    const newUser = { id: insertResult.insertId, name, role: role || 'contributor', title: title || null };
    res.status(201).json({ user: newUser, token: `token_${newUser.id}` });
  } catch (err) {
    console.error('注册失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 获取当前用户（根据 token）
router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: '未登录' });

    const token = authHeader.replace('Bearer ', '');
    const userId = parseInt(token.replace('token_', ''));
    if (!userId) return res.status(401).json({ message: '无效的 token' });

    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ message: '用户不存在' });

    res.json({ user: users[0] });
  } catch (err) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
