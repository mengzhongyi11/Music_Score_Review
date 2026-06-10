import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取完整乐谱（含每段的版本状态和评论）
router.get('/scores/:id/full-score', async (req: Request, res: Response) => {
  try {
    const scoreId = req.params.id;

    // 获取乐谱信息
    const [scoreRows] = await pool.query('SELECT * FROM scores WHERE id = ?', [scoreId]);
    const scores = scoreRows as any[];
    if (scores.length === 0) return res.status(404).json({ message: '未找到该乐谱' });
    const score = scores[0];

    // 获取所有乐段（含版本数量）
    const [sectionRows] = await pool.query(
      `SELECT s.*,
         (SELECT COUNT(*) FROM section_versions sv WHERE sv.section_id = s.id) as version_count,
         (SELECT content FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_content,
         (SELECT name FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_name,
         (SELECT tempo FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_tempo,
         (SELECT key_signature FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_key_signature,
         (SELECT time_signature FROM section_versions sv WHERE sv.section_id = s.id ORDER BY sv.created_at DESC LIMIT 1) as prev_time_signature
       FROM sections s
       WHERE s.score_id = ?
       ORDER BY s.sort_order, s.id`,
      [scoreId]
    );

    // 获取所有相关评论
    const [commentRows] = await pool.query(
      `SELECT c.*, u.avatar, u.role as user_role
       FROM comments c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.section_id IN (SELECT id FROM sections WHERE score_id = ?)
       ORDER BY c.created_at DESC`,
      [scoreId]
    );

    res.json({
      score,
      sections: sectionRows,
      comments: commentRows,
    });
  } catch (err) {
    console.error('查询完整乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
