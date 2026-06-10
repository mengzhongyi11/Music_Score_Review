import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取所有标签
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tags ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('查询标签失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取乐谱的标签
router.get('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.* FROM tags t
       JOIN score_tags st ON t.id = st.tag_id
       WHERE st.score_id = ?
       ORDER BY t.name`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询乐谱标签失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 为乐谱设置标签（替换所有）
router.put('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const { tag_ids } = req.body; // 标签 ID 数组
    const scoreId = req.params.scoreId;
    await pool.query('DELETE FROM score_tags WHERE score_id = ?', [scoreId]);
    if (tag_ids && tag_ids.length > 0) {
      const values = tag_ids.map((tagId: number) => [scoreId, tagId]);
      await pool.query('INSERT INTO score_tags (score_id, tag_id) VALUES ?', [values]);
    }
    res.json({ message: '标签已更新' });
  } catch (err) {
    console.error('更新标签失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
