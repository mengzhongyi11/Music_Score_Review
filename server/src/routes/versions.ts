import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取单个版本详情
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM section_versions WHERE id = ?', [req.params.id]);
    const versions = rows as any[];
    if (versions.length === 0) return res.status(404).json({ message: '未找到该版本' });
    res.json(versions[0]);
  } catch (err) {
    console.error('查询版本失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 回溯到指定版本
router.post('/:id/rollback', async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 获取要回溯到的版本
    const [verRows] = await connection.query('SELECT * FROM section_versions WHERE id = ?', [req.params.id]);
    const versions = verRows as any[];
    if (versions.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: '未找到该版本' });
    }
    const version = versions[0];

    // 获取当前乐段内容
    const [curRows] = await connection.query('SELECT * FROM sections WHERE id = ?', [version.section_id]);
    const current = (curRows as any[])[0];
    if (!current) {
      await connection.rollback();
      return res.status(404).json({ message: '未找到对应的乐段' });
    }

    // 保存当前内容为版本（便于再次回溯）
    await connection.query(
      `INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [current.id, current.name, current.content, current.tempo, current.key_signature, current.time_signature]
    );

    // 恢复为历史版本的内容
    await connection.query(
      'UPDATE sections SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE id=?',
      [version.name, version.content, version.tempo, version.key_signature, version.time_signature, version.section_id]
    );

    await connection.commit();
    res.json({
      message: '已回溯到历史版本',
      section_id: version.section_id,
      restored: {
        name: version.name,
        content: version.content,
        tempo: version.tempo,
        key_signature: version.key_signature,
        time_signature: version.time_signature,
      },
    });
  } catch (err) {
    await connection.rollback();
    console.error('回溯版本失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  } finally {
    connection.release();
  }
});

export default router;
