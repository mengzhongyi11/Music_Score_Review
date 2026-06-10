import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取所有用户
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('查询用户列表失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取单个用户
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const users = rows as any[];
    if (users.length === 0) return res.status(404).json({ message: '未找到该用户' });
    res.json(users[0]);
  } catch (err) {
    console.error('查询用户失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取用户个人资料 + 统计
router.get('/:id/profile', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const users = userRows as any[];
    if (users.length === 0) return res.status(404).json({ message: '未找到该用户' });
    const user = users[0];

    const [myScores] = await pool.query('SELECT COUNT(*) as count FROM scores WHERE owner_id = ?', [userId]);
    const [collabScores] = await pool.query('SELECT COUNT(DISTINCT score_id) as count FROM score_collaborators WHERE user_id = ?', [userId]);
    const [comments] = await pool.query('SELECT COUNT(*) as count FROM comments WHERE user_id = ?', [userId]);

    res.json({
      ...user,
      stats: {
        myScores: (myScores as any[])[0].count,
        collaborations: (collabScores as any[])[0].count,
        comments: (comments as any[])[0].count,
      },
    });
  } catch (err) {
    console.error('查询用户资料失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取用户拥有的乐谱
router.get('/:id/scores', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
       FROM scores s LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.owner_id = ? ORDER BY s.updated_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询用户乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取用户协作的乐谱
router.get('/:id/collaborations', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.name as owner_name, u.avatar as owner_avatar, sc.role as collab_role
       FROM score_collaborators sc
       JOIN scores s ON sc.score_id = s.id
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE sc.user_id = ?
       ORDER BY s.updated_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询协作乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取用户最近活动
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const userId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const [rows] = await pool.query(
      `SELECT * FROM (
        (SELECT 'comment' as type, c.created_at as time, c.content as summary,
                sc.name as score_name, sc.id as score_id
         FROM comments c
         JOIN sections s ON c.section_id = s.id
         JOIN scores sc ON s.score_id = sc.id
         WHERE c.user_id = ?)

        UNION ALL

        (SELECT 'create_score' as type, s.created_at as time,
                CONCAT('创建了乐谱「', s.name, '」') as summary,
                s.name as score_name, s.id as score_id
         FROM scores s WHERE s.owner_id = ?)
      ) AS activity
      ORDER BY time DESC LIMIT ?`,
      [userId, userId, limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询用户活动失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
