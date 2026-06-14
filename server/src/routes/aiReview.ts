import { Router, Request, Response } from 'express';
import pool from '../db';
import { analyzeSubmission, saveSuggestion } from '../services/aiReviewService';

const router = Router();

// 分析单条提交（三层过滤）
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { score_id, section_id, branch_id, content, title, user_id } = req.body;
    if (!score_id || !content) {
      return res.status(400).json({ message: '参数不完整（需要 score_id 和 content）' });
    }

    const result = await analyzeSubmission({
      scoreId: score_id,
      sectionId: section_id,
      branchId: branch_id,
      content,
      title,
      userId: user_id || 1,
    });

    // 保存到数据库
    const suggestionId = await saveSuggestion(
      { scoreId: score_id, sectionId: section_id, branchId: branch_id, content, title, userId: user_id || 1 },
      result,
    );

    res.json({ suggestion: { ...result, id: suggestionId } });
  } catch (err) {
    console.error('AI 分析失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 分析分支全部改动
router.post('/branch/:branchId', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;
    const userId = req.body.user_id || 1;

    // 获取分支的所有修改
    const [overrides] = await pool.query(
      `SELECT bo.*, s.name as section_name, s.score_id
       FROM branch_overrides bo
       JOIN sections s ON bo.section_id = s.id
       WHERE bo.branch_id = ?`,
      [branchId],
    );
    const items = overrides as any[];
    if (!items.length) {
      return res.json({ suggestions: [], message: '该分支无修改记录' });
    }

    const suggestions = [];
    for (const item of items) {
      const content = item.content || '';
      if (!content.trim()) continue;

      const result = await analyzeSubmission({
        scoreId: item.score_id,
        branchId: Number(branchId),
        sectionId: item.section_id,
        content,
        title: `乐段「${item.section_name}」修改分析`,
        userId,
      });

      const id = await saveSuggestion(
        { scoreId: item.score_id, branchId: Number(branchId), sectionId: item.section_id, content, title: `乐段「${item.section_name}」修改分析`, userId },
        result,
      );

      suggestions.push({ ...result, id, section_id: item.section_id, section_name: item.section_name });
    }

    res.json({ suggestions });
  } catch (err) {
    console.error('分支分析失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 查看乐谱的审阅建议列表
router.get('/suggestions/:scoreId', async (req: Request, res: Response) => {
  try {
    const { scoreId } = req.params;
    const { status, priority } = req.query;

    let sql = `SELECT rs.*, u.name as reviewed_by_name
               FROM review_suggestions rs
               LEFT JOIN users u ON rs.reviewed_by = u.id
               WHERE rs.score_id = ?`;
    const params: any[] = [scoreId];

    if (status && status !== 'all') {
      sql += ' AND rs.status = ?';
      params.push(status);
    }
    if (priority && priority !== 'all') {
      sql += ' AND rs.priority = ?';
      params.push(priority);
    }

    sql += ' ORDER BY FIELD(rs.priority, "P0", "P1", "P2"), rs.created_at DESC';

    const [rows] = await pool.query(sql, params);
    res.json({ suggestions: rows });
  } catch (err) {
    console.error('查询建议失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 更新建议状态（接受/驳回/忽略）
router.put('/suggestions/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reviewed_by } = req.body;

    if (!['accepted', 'rejected', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: '状态值无效（accepted/rejected/dismissed）' });
    }

    await pool.query(
      'UPDATE review_suggestions SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
      [status, reviewed_by || null, id],
    );

    // 如果建议是 auto_accept 且用户接受了，更新偏好学习
    if (status === 'accepted') {
      try {
        await pool.query(
          `INSERT INTO user_preferences (user_id, preference_key, preference_value, weight)
           VALUES (?, ?, ?, 1.0)
           ON DUPLICATE KEY UPDATE weight = weight + 0.1`,
          [reviewed_by || 1, 'accepted_patterns', JSON.stringify({ pattern: 'user_accepted', count: 1 })],
        );
      } catch { /* 偏好记录失败不阻塞 */ }
    }

    res.json({ message: '审阅状态已更新' });
  } catch (err) {
    console.error('更新建议状态失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
