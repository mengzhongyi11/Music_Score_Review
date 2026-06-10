import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    // 分别获取三类动态
    const [comments] = await pool.query(
      `SELECT 'comment' as type, c.created_at as time, u.name as user_name, u.avatar,
              c.content as summary, sc.name as score_name, sc.id as score_id,
              s.name as section_name, c.status as ref_status, c.measure_ref as ref_measure
       FROM comments c
       JOIN users u ON c.user_id = u.id
       JOIN sections s ON c.section_id = s.id
       JOIN scores sc ON s.score_id = sc.id`
    );

    const [merges] = await pool.query(
      `SELECT 'merge' as type, b.created_at as time, u.name as user_name, u.avatar,
              b.name as branch_name, sc.name as score_name, sc.id as score_id
       FROM branches b
       JOIN users u ON b.created_by = u.id
       JOIN scores sc ON b.score_id = sc.id
       WHERE b.status = 'merged'`
    );

    const [versions] = await pool.query(
      `SELECT 'version' as type, sv.created_at as time, s.name as section_name,
              sc.name as score_name, sc.id as score_id
       FROM section_versions sv
       JOIN sections s ON sv.section_id = s.id
       JOIN scores sc ON s.score_id = sc.id`
    );

    // 统一格式
    const feed: any[] = [];

    for (const c of comments as any[]) {
      feed.push({
        type: 'comment',
        time: c.time,
        user_name: c.user_name,
        avatar: c.avatar,
        summary: c.summary,
        score_name: c.score_name,
        score_id: c.score_id,
        section_name: c.section_name,
        ref_status: c.ref_status,
        ref_measure: c.ref_measure,
      });
    }

    for (const m of merges as any[]) {
      feed.push({
        type: 'merge',
        time: m.time,
        user_name: m.user_name,
        avatar: m.avatar,
        summary: `${m.branch_name} 已合并到主分支`,
        score_name: m.score_name,
        score_id: m.score_id,
        section_name: '',
        ref_status: null,
        ref_measure: null,
      });
    }

    for (const v of versions as any[]) {
      feed.push({
        type: 'version',
        time: v.time,
        user_name: '系统',
        avatar: '',
        summary: `「${v.section_name}」已保存版本`,
        score_name: v.score_name,
        score_id: v.score_id,
        section_name: v.section_name,
        ref_status: null,
        ref_measure: null,
      });
    }

    // 按时间排序
    feed.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    res.json(feed.slice(0, limit));
  } catch (err) {
    console.error('查询动态失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
