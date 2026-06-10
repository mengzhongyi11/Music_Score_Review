import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    // 近 7 天每日活动数
    const [activity] = await pool.query(
      `SELECT DATE(time) as day, type, COUNT(*) as count FROM (
        SELECT created_at as time, 'comment' as type FROM comments
        UNION ALL
        SELECT created_at as time, 'version' as type FROM section_versions
        UNION ALL
        SELECT created_at as time, 'merge' as type FROM branches WHERE status = 'merged'
      ) AS all_activity
      WHERE time >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(time), type
      ORDER BY day`
    );

    // 贡献者排行（按评论数）
    const [topContributors] = await pool.query(
      `SELECT u.id, u.name, u.avatar, u.role, COUNT(c.id) as comment_count
       FROM comments c
       JOIN users u ON c.user_id = u.id
       GROUP BY u.id, u.name, u.avatar, u.role
       ORDER BY comment_count DESC
       LIMIT 10`
    );

    // 标签分布
    const [tagDistribution] = await pool.query(
      `SELECT t.name, t.color, COUNT(st.score_id) as score_count
       FROM tags t
       LEFT JOIN score_tags st ON t.id = st.tag_id
       GROUP BY t.id, t.name, t.color
       ORDER BY score_count DESC`
    );

    res.json({ activity, topContributors, tagDistribution });
  } catch (err) {
    console.error('查询看板数据失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
