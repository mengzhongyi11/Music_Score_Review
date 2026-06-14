import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取用户的通知列表
router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT n.*, u.name as actor_name, s.name as score_name
       FROM notifications n
       LEFT JOIN users u ON n.actor_id = u.id
       LEFT JOIN scores s ON n.score_id = s.id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询通知失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 未读通知数
router.get('/:userId/unread-count', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.params.userId]
    );
    res.json((rows as any[])[0]);
  } catch (err) {
    console.error('查询未读数失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 标记单条已读
router.put('/:id/read', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = ?', [req.params.id]);
    res.json({ message: '已标记已读' });
  } catch (err) {
    console.error('标记已读失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 全部标记已读
router.put('/read-all/:userId', async (req: Request, res: Response) => {
  try {
    await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.params.userId]);
    res.json({ message: '全部已读' });
  } catch (err) {
    console.error('全部标记已读失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

/**
 * 创建通知（内部使用，不对外暴露路由）
 * 在各业务路由中调用此函数
 */
export async function createNotification(params: {
  userId: number;
  type: 'merge' | 'review' | 'member_join' | 'invite' | 'invite_rejected';
  scoreId?: number;
  actorId?: number;
  message: string;
}): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, score_id, actor_id, message) VALUES (?, ?, ?, ?, ?)',
      [params.userId, params.type, params.scoreId || null, params.actorId || null, params.message]
    );
  } catch (err) {
    console.error('创建通知失败:', err);
    // 通知创建失败不阻塞主流程
  }
}

export default router;
