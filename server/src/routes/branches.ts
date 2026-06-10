import { Router, Request, Response } from 'express';
import pool from '../db';

const router = Router();

// 获取乐谱的所有分支
router.get('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name as created_by_name, u.avatar as created_by_avatar,
        (SELECT COUNT(*) FROM branch_overrides bo WHERE bo.branch_id = b.id) as changes_count
       FROM branches b
       LEFT JOIN users u ON b.created_by = u.id
       WHERE b.score_id = ?
       ORDER BY b.created_at DESC`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询分支列表失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 创建分支
router.post('/', async (req: Request, res: Response) => {
  try {
    const { score_id, name, created_by } = req.body;
    if (!score_id || !name || !created_by) {
      return res.status(400).json({ message: '请求参数有误' });
    }
    const [result] = await pool.query(
      'INSERT INTO branches (score_id, name, created_by) VALUES (?, ?, ?)',
      [score_id, name, created_by]
    );
    const insertResult = result as any;
    res.status(201).json({ id: insertResult.insertId, name, message: '分支创建成功' });
  } catch (err) {
    console.error('创建分支失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 在分支上修改乐段
router.put('/:branchId/sections/:sectionId', async (req: Request, res: Response) => {
  try {
    const { branchId, sectionId } = req.params;
    const { name, content, tempo, key_signature, time_signature } = req.body;

    // upsert: 如果已有就更新，没有就插入
    const [existing] = await pool.query(
      'SELECT id FROM branch_overrides WHERE branch_id = ? AND section_id = ?',
      [branchId, sectionId]
    );
    const rows = existing as any[];

    if (rows.length > 0) {
      await pool.query(
        'UPDATE branch_overrides SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE branch_id=? AND section_id=?',
        [name, content, tempo, key_signature, time_signature, branchId, sectionId]
      );
    } else {
      await pool.query(
        'INSERT INTO branch_overrides (branch_id, section_id, name, content, tempo, key_signature, time_signature) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [branchId, sectionId, name, content, tempo, key_signature, time_signature]
      );
    }
    res.json({ message: '分支修改已保存' });
  } catch (err) {
    console.error('保存分支修改失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 获取分支 Diff（对比 main）
router.get('/:branchId/diff', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;

    // 获取分支信息和所有 override
    const [branchRows] = await pool.query('SELECT * FROM branches WHERE id = ?', [branchId]);
    const branches = branchRows as any[];
    if (branches.length === 0) return res.status(404).json({ message: '分支不存在' });

    const [overrideRows] = await pool.query(
      `SELECT bo.*, s.name as main_name, s.content as main_content,
              s.tempo as main_tempo, s.key_signature as main_key, s.time_signature as main_time
       FROM branch_overrides bo
       JOIN sections s ON bo.section_id = s.id
       WHERE bo.branch_id = ?`,
      [branchId]
    );

    res.json({
      branch: branches[0],
      diffs: overrideRows,
    });
  } catch (err) {
    console.error('查询分支 Diff 失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

// 合并分支到 main
router.post('/:branchId/merge', async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const { branchId } = req.params;
    await connection.beginTransaction();

    // 获取所有 override
    const [overrides] = await connection.query(
      'SELECT * FROM branch_overrides WHERE branch_id = ?',
      [branchId]
    );
    const overrideList = overrides as any[];

    // 获取分支名
    const [branchRows] = await connection.query('SELECT name FROM branches WHERE id = ?', [branchId]);
    const branchName = (branchRows as any[])[0]?.name || '未知分支';

    // 逐条合并到 main 的 sections（先保存版本再覆盖）
    for (const ov of overrideList) {
      // 先查当前主分支的内容
      const [current] = await connection.query('SELECT * FROM sections WHERE id = ?', [ov.section_id]);
      const cur = (current as any[])[0];
      if (cur) {
        // 保存当前内容到版本历史
        await connection.query(
          `INSERT INTO section_versions (section_id, name, content, tempo, key_signature, time_signature)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ov.section_id, cur.name, cur.content, cur.tempo, cur.key_signature, cur.time_signature]
        );
      }
      // 再用分支内容覆盖
      await connection.query(
        `UPDATE sections SET name=?, content=?, tempo=?, key_signature=?, time_signature=? WHERE id=?`,
        [ov.name, ov.content, ov.tempo, ov.key_signature, ov.time_signature, ov.section_id]
      );
    }

    // 标记分支为已合并
    await connection.query('UPDATE branches SET status = ? WHERE id = ?', ['merged', branchId]);

    await connection.commit();
    res.json({
      message: `合并成功，共合并 ${overrideList.length} 处修改`,
      mergedCount: overrideList.length,
    });
  } catch (err) {
    await connection.rollback();
    console.error('合并分支失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  } finally {
    connection.release();
  }
});

// 关闭分支
router.put('/:branchId/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    await pool.query('UPDATE branches SET status = ? WHERE id = ?', [status, req.params.branchId]);
    res.json({ message: '分支状态已更新' });
  } catch (err) {
    console.error('更新分支状态失败:', err);
    res.status(500).json({ message: '服务器繁忙，请稍后重试' });
  }
});

export default router;
