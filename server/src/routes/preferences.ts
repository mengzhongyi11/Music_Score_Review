import { Router, Request, Response } from 'express';
import pool from '../db';
import { calculateStats, shouldAutoReject } from '../services/preferenceLearner';

const router = Router();

// 获取用户审阅统计
router.get('/:userId/stats', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // 统计审阅建议处理情况
    const [suggestRows] = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
         SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed,
         SUM(CASE WHEN status = 'accepted' AND layer = 'ai' THEN 1 ELSE 0 END) as ai_accepted,
         SUM(CASE WHEN layer = 'ai' THEN 1 ELSE 0 END) as ai_total
       FROM review_suggestions
       WHERE reviewed_by = ? OR created_by = ?`,
      [userId, userId]
    );
    const row = (suggestRows as any[])[0] || { total: 0, accepted: 0, rejected: 0, dismissed: 0, ai_accepted: 0, ai_total: 0 };

    const stats = calculateStats({
      total: row.total || 0,
      accepted: row.accepted || 0,
      rejected: row.rejected || 0,
      dismissed: row.dismissed || 0,
      aiSuggestions: row.ai_total || 0,
      aiAccepted: row.ai_accepted || 0,
    });

    // 获取用户偏好模式
    const [prefRows] = await pool.query(
      'SELECT preference_key, preference_value FROM user_preferences WHERE user_id = ?',
      [userId]
    );
    const preferences = (prefRows || []) as any[];

    res.json({ stats, preferences });
  } catch (err) {
    console.error('查询统计失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 更新偏好权重
router.put('/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { preferences } = req.body;

    if (!Array.isArray(preferences)) {
      return res.status(400).json({ message: 'preferences 需为数组' });
    }

    for (const pref of preferences) {
      await pool.query(
        `INSERT INTO user_preferences (user_id, preference_key, preference_value, weight)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE preference_value = VALUES(preference_value), weight = VALUES(weight)`,
        [userId, pref.key, JSON.stringify(pref.value), pref.weight || 1.0]
      );
    }

    res.json({ message: '偏好已更新' });
  } catch (err) {
    console.error('更新偏好失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 检测内容是否匹配用户已驳回的模式
router.post('/check-reject', async (req: Request, res: Response) => {
  try {
    const { content, user_id } = req.body;
    if (!content) {
      return res.status(400).json({ message: '缺少 content' });
    }

    const [prefRows] = await pool.query(
      "SELECT preference_value FROM user_preferences WHERE user_id = ? AND preference_key = 'rejected_patterns'",
      [user_id || 1]
    );
    const rows = prefRows as any[];
    let patterns: string[] = [];
    if (rows.length > 0) {
      const val = rows[0].preference_value;
      patterns = typeof val === 'string' ? JSON.parse(val) : val;
    }

    const matched = shouldAutoReject(content, patterns);
    res.json({ matched, patterns });
  } catch (err) {
    console.error('检查驳回模式失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// AI 全局统计（跨用户）
router.get('/ai-stats', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN layer = 'rule' THEN 1 ELSE 0 END) as rule_count,
         SUM(CASE WHEN layer = 'rag' THEN 1 ELSE 0 END) as rag_count,
         SUM(CASE WHEN layer = 'ai' THEN 1 ELSE 0 END) as ai_count,
         SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_count
       FROM review_suggestions`
    );

    res.json({ globalStats: (rows as any[])[0] });
  } catch (err) {
    console.error('查询全局统计失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
