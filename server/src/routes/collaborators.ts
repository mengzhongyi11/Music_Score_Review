import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取乐谱的协作者列表
router.get('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT sc.*, u.name, u.avatar, u.role as user_role, u.title,
              inv.name as invited_by_name
       FROM score_collaborators sc
       JOIN users u ON sc.user_id = u.id
       LEFT JOIN users inv ON sc.invited_by = inv.id
       WHERE sc.score_id = ?
       ORDER BY sc.created_at`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询协作者失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 邀请协作者
router.post('/', async (req: Request, res: Response) => {
  try {
    const { score_id, user_id, role, invited_by } = req.body;
    if (!score_id || !user_id || !role) {
      return res.status(400).json({ message: '请求参数有误' });
    }
    if (!['reviewer', 'contributor'].includes(role)) {
      return res.status(400).json({ message: '角色无效' });
    }
    // 检查是否已是协作者
    const [exist] = await pool.query(
      'SELECT id FROM score_collaborators WHERE score_id = ? AND user_id = ?',
      [score_id, user_id]
    );
    if ((exist as any[]).length > 0) {
      return res.status(400).json({ message: '该用户已是协作者' });
    }
    const [result] = await pool.query(
      'INSERT INTO score_collaborators (score_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
      [score_id, user_id, role, invited_by || null]
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, message: '邀请成功' });
  } catch (err) {
    console.error('邀请协作者失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 更新协作者角色
router.put('/:id/role', async (req: Request, res: Response) => {
  try {
    const { role } = req.body;
    await pool.query('UPDATE score_collaborators SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: '角色已更新' });
  } catch (err) {
    console.error('更新角色失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 移除协作者
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM score_collaborators WHERE id = ?', [req.params.id]);
    res.json({ message: '已移除协作者' });
  } catch (err) {
    console.error('移除协作者失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
