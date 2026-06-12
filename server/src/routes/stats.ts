import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.user_id ? Number(req.query.user_id) : null;

    // 我的乐谱数
    const [myScores] = userId
      ? await pool.query('SELECT COUNT(*) as count FROM scores WHERE owner_id = ?', [userId])
      : await pool.query('SELECT COUNT(*) as count FROM scores');

    // 我的协作者总数（在我拥有的乐谱中）
    const [myCollaborators] = userId
      ? await pool.query(
          'SELECT COUNT(DISTINCT sc.user_id) as count FROM score_collaborators sc JOIN scores s ON sc.score_id = s.id WHERE s.owner_id = ?',
          [userId]
        )
      : [{ count: 0 }];

    // 待处理评论（在我拥有的乐谱中）
    const [pendingReviews] = userId
      ? await pool.query(
          `SELECT COUNT(*) as count FROM comments c
           JOIN sections sec ON c.section_id = sec.id
           JOIN scores s ON sec.score_id = s.id
           WHERE s.owner_id = ? AND c.status = 'open'`,
          [userId]
        )
      : await pool.query("SELECT COUNT(*) as count FROM comments WHERE status = 'open'");

    // 活跃分支（在我拥有的乐谱中）
    const [activeBranches] = userId
      ? await pool.query(
          'SELECT COUNT(*) as count FROM branches WHERE score_id IN (SELECT id FROM scores WHERE owner_id = ?) AND status = ?',
          [userId, 'active']
        )
      : await pool.query("SELECT COUNT(*) as count FROM branches WHERE status = 'active'");

    // 总乐段数
    const [totalSections] = userId
      ? await pool.query(
          "SELECT COUNT(*) as count FROM sections WHERE type = 'section' AND score_id IN (SELECT id FROM scores WHERE owner_id = ?)",
          [userId]
        )
      : await pool.query("SELECT COUNT(*) as count FROM sections WHERE type = 'section'");

    // 今日修改次数
    const [todayEdits] = userId
      ? await pool.query(
          `SELECT COUNT(*) as count FROM section_versions sv
           JOIN sections sec ON sv.section_id = sec.id
           WHERE sec.score_id IN (SELECT id FROM scores WHERE owner_id = ?)
           AND DATE(sv.created_at) = CURDATE()`,
          [userId]
        )
      : [{ count: 0 }];

    res.json({
      myScores: (myScores as any[])[0].count,
      myCollaborators: (myCollaborators as any[])[0]?.count || 0,
      pendingReviews: (pendingReviews as any[])[0].count,
      activeBranches: (activeBranches as any[])[0].count,
      totalSections: (totalSections as any[])[0].count,
      todayEdits: (todayEdits as any[])[0]?.count || 0,
    });
  } catch (err) {
    console.error('查询统计失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
