import { Router, Request, Response } from 'express';
import pool from '../db';
import { createNotification } from './notifications';

const router = Router();

// 提交审阅（仅管理员）
router.post('/:scoreId', async (req: Request, res: Response) => {
  try {
    const { status, comment, reviewer_id } = req.body;
    if (!reviewer_id || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: '参数不完整' });
    }

    // 验证管理员权限
    const [userRows] = await pool.query('SELECT role FROM users WHERE id = ?', [reviewer_id]);
    const users = userRows as any[];
    if (users.length === 0 || users[0].role !== 'admin') {
      return res.status(403).json({ message: '仅管理员可审阅' });
    }

    const scoreId = req.params.scoreId;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 更新乐谱审阅状态
      await connection.query(
        'UPDATE scores SET review_status = ?, reviewed_by = ?, review_comment = ?, reviewed_at = NOW() WHERE id = ?',
        [status === 'approved' ? 'approved' : 'rejected', reviewer_id, comment || null, scoreId]
      );

      // 记录审阅历史
      const [result] = await connection.query(
        'INSERT INTO reviews (score_id, reviewer_id, status, comment) VALUES (?, ?, ?, ?)',
        [scoreId, reviewer_id, status, comment || null]
      );

      await connection.commit();

      // 审阅通知：通知乐谱主人
      try {
        const [sRows] = await pool.query('SELECT name, owner_id FROM scores WHERE id = ?', [scoreId]);
        const sc = (sRows as any[])[0];
        if (sc && sc.owner_id && sc.owner_id !== reviewer_id) {
          const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [reviewer_id]);
          const reviewerName = (uRows as any[])[0]?.name || '管理员';
          const st = status === 'approved' ? '已通过' : '未通过';
          await createNotification({ userId: sc.owner_id, type: 'review', scoreId: Number(scoreId), actorId: reviewer_id, message: `${reviewerName} 审阅了「${sc.name}」：${st}` });
        }
      } catch (_) {}

      res.json({
        message: status === 'approved' ? '♩ 审阅已通过' : '审阅未通过',
        reviewId: (result as any).insertId,
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('审阅提交失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 获取审阅历史
router.get('/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, u.name as reviewer_name
       FROM reviews r
       LEFT JOIN users u ON r.reviewer_id = u.id
       WHERE r.score_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询审阅历史失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
