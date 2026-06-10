import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取乐谱的顶级乐段（根节点）
router.get('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL ORDER BY sort_order',
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询顶级乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 递归获取乐谱的完整树形结构
router.get('/score/:scoreId/tree', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `WITH RECURSIVE section_tree AS (
        SELECT * FROM sections WHERE score_id = ? AND parent_id IS NULL
        UNION ALL
        SELECT s.* FROM sections s
        JOIN section_tree st ON s.parent_id = st.id
      )
      SELECT * FROM section_tree ORDER BY sort_order`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询乐段树失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取乐段的子乐段
router.get('/:id/children', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM sections WHERE parent_id = ? ORDER BY sort_order',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询子乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取单个乐段
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM sections WHERE id = ?',
      [req.params.id]
    );
    const sections = rows as any[];
    if (sections.length === 0) {
      return res.status(404).json({ message: '未找到该乐段' });
    }
    res.json(sections[0]);
  } catch (err) {
    console.error('查询乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 新增乐段
router.post('/', async (req: Request, res: Response) => {
  try {
    const { score_id, parent_id, name, path, type, content, sort_order } = req.body;
    const [result] = await pool.query(
      'INSERT INTO sections (score_id, parent_id, name, path, type, content, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [score_id, parent_id || null, name, path, type || 'section', content || null, sort_order || 0]
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, message: '创建成功' });
  } catch (err) {
    console.error('新增乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 更新乐段（自动保存版本历史）
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, content, tempo, key_signature, time_signature } = req.body;
    const sectionId = req.params.id;

    // 先保存当前数据为历史版本
    const [current] = await pool.query('SELECT * FROM sections WHERE id = ?', [sectionId]);
    const cur = (current as any[])[0];
    if (cur) {
      await pool.query(
        `INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sectionId, cur.name, cur.content, cur.tempo, cur.key_signature, cur.time_signature]
      );
    }

    // 再更新
    await pool.query(
      'UPDATE sections SET name = ?, content = ?, tempo = ?, key_signature = ?, time_signature = ? WHERE id = ?',
      [name, content, tempo, key_signature, time_signature, sectionId]
    );
    res.json({ message: '更新成功' });
  } catch (err) {
    console.error('更新乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取乐段的版本历史
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM section_versions WHERE section_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询版本历史失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 删除乐段（级联删除子乐段）
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM sections WHERE id = ?', [req.params.id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    console.error('删除乐段失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
