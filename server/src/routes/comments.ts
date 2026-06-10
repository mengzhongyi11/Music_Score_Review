import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取乐段的所有评论（关联用户信息）
router.get('/section/:sectionId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, u.avatar, u.role as user_role, u.title as user_title
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.section_id = ?
       ORDER BY c.created_at DESC`,
      [req.params.sectionId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询评论失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 新增评论（关联用户）
router.post('/', async (req: Request, res: Response) => {
  try {
    const { section_id, user_id, content, measure_ref } = req.body;
    if (!section_id || !user_id || !content) {
      return res.status(400).json({ message: '请求参数有误，请检查输入' });
    }
    // 先查用户姓名
    const [users] = await pool.query('SELECT name, avatar, role, title FROM users WHERE id = ?', [user_id]);
    const userList = users as any[];
    if (userList.length === 0) {
      return res.status(400).json({ message: '用户不存在' });
    }
    const user = userList[0];
    const [result] = await pool.query(
      'INSERT INTO comments (section_id, user_id, author, content, status, measure_ref) VALUES (?, ?, ?, ?, ?, ?)',
      [section_id, user_id, user.name, content, 'open', measure_ref || null]
    );
    const insertResult = result as any;
    // 返回完整评论数据
    res.status(201).json({
      id: insertResult.insertId,
      section_id,
      user_id,
      author: user.name,
      avatar: user.avatar,
      user_role: user.role,
      user_title: user.title,
      content,
      status: 'open',
      measure_ref: measure_ref || null,
      created_at: new Date().toISOString(),
      message: '评论发表成功',
    });
  } catch (err) {
    console.error('新增评论失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 更新评论状态
router.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!['open', 'resolved'].includes(status)) {
      return res.status(400).json({ message: '状态值无效' });
    }
    await pool.query('UPDATE comments SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: '状态更新成功' });
  } catch (err) {
    console.error('更新评论状态失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 删除评论
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM comments WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除评论失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
