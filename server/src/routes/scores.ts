import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取所有乐谱（支持按所有者/标签筛选）
router.get('/', async (req: Request, res: Response) => {
  try {
    const { owner_id, tag } = req.query;
    let query = `SELECT DISTINCT s.*, u.name as owner_name, u.avatar as owner_avatar,
                  (SELECT COUNT(*) FROM comments c JOIN sections sec ON c.section_id = sec.id WHERE sec.score_id = s.id) as comment_count
                 FROM scores s
                 LEFT JOIN users u ON s.owner_id = u.id`;
    const params: any[] = [];
    const conditions: string[] = [];

    if (tag) {
      query += ' JOIN score_tags st ON s.id = st.score_id JOIN tags t ON st.tag_id = t.id';
      conditions.push('t.name = ?');
      params.push(tag);
    }
    if (owner_id) {
      conditions.push('s.owner_id = ?');
      params.push(Number(owner_id));
    }
    // 已通过/已驳回的超过一周自动隐藏
    conditions.push("(s.review_status NOT IN ('approved','rejected') OR s.reviewed_at IS NULL OR s.reviewed_at >= NOW() - INTERVAL 7 DAY)");
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY s.updated_at DESC';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('查询乐谱列表失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取单个乐谱（含所有者信息）
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
       FROM scores s
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.id = ?`,
      [req.params.id]
    );
    const scores = rows as any[];
    if (scores.length === 0) {
      return res.status(404).json({ message: '未找到该乐谱' });
    }
    res.json(scores[0]);
  } catch (err) {
    console.error('查询乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 创建乐谱
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, composer, description, owner_id, is_public } = req.body;
    if (!name || !composer) {
      return res.status(400).json({ message: '乐谱名称和作曲者不能为空' });
    }
    const [result] = await pool.query(
      'INSERT INTO scores (name, composer, description, owner_id, is_public) VALUES (?, ?, ?, ?, ?)',
      [name, composer, description || null, owner_id || null, is_public ? 1 : 0]
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, message: '乐谱创建成功' });
  } catch (err) {
    console.error('创建乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 搜索乐谱
router.get('/search/:keyword', async (req: Request, res: Response) => {
  try {
    const keyword = `%${req.params.keyword}%`;
    const [rows] = await pool.query(
      `SELECT s.*, u.name as owner_name, u.avatar as owner_avatar
       FROM scores s
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.name LIKE ? OR s.composer LIKE ?
       ORDER BY s.updated_at DESC`,
      [keyword, keyword]
    );
    res.json(rows);
  } catch (err) {
    console.error('搜索乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 转让乐谱所有权
router.put('/:id/transfer', async (req: Request, res: Response) => {
  try {
    const { new_owner_id } = req.body;
    await pool.query('UPDATE scores SET owner_id = ? WHERE id = ?', [new_owner_id, req.params.id]);
    res.json({ message: '所有权已转让' });
  } catch (err) {
    console.error('转让乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 删除乐谱（仅所有者）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM scores WHERE id = ?', [req.params.id]);
    res.json({ message: '乐谱已删除' });
  } catch (err) {
    console.error('删除乐谱失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
