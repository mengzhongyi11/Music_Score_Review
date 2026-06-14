import { Router, Request, Response } from 'express';
import pool from '../db';
import { analyzeSectionImpact } from '../services/impactAnalyzer';

const router = Router();

// 分析单乐段修改影响
router.post('/analyze-section', async (req: Request, res: Response) => {
  try {
    const { score_id, section_id, section_name, new_content, old_content } = req.body;
    if (!new_content) {
      return res.status(400).json({ message: '缺少 new_content' });
    }

    const result = analyzeSectionImpact({
      sectionId: String(section_id || ''),
      sectionName: section_name || '未知乐段',
      mainContent: old_content || '',
      branchContent: new_content,
    });

    res.json({ analysis: result });
  } catch (err) {
    console.error('影响分析失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 分析分支全量影响
router.post('/analyze-branch/:branchId', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;

    const [overrideRows] = await pool.query(
      `SELECT bo.*, s.name as section_name, s.content as main_content, s.score_id
       FROM branch_overrides bo
       JOIN sections s ON bo.section_id = s.id
       WHERE bo.branch_id = ?`,
      [branchId]
    );
    const items = (overrideRows || []) as any[];
    if (!items.length) {
      return res.json({ analyses: [] });
    }

    const analyses = items.map((item: any) => analyzeSectionImpact({
      sectionId: String(item.section_id),
      sectionName: item.section_name || `乐段 #${item.section_id}`,
      mainContent: item.main_content || '',
      branchContent: item.content || '',
    }));

    res.json({ analyses });
  } catch (err) {
    console.error('分支影响分析失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 获取乐谱影响汇总
router.get('/summary/:scoreId', async (req: Request, res: Response) => {
  try {
    const { scoreId } = req.params;

    // 统计该乐谱所有分支修改的影响
    const [branchRows] = await pool.query(
      `SELECT bo.*, s.name as section_name, s.content as main_content
       FROM branch_overrides bo
       JOIN sections s ON bo.section_id = s.id
       WHERE s.score_id = ?`,
      [scoreId]
    );
    const items = (branchRows || []) as any[];

    const allAnalyses = items.map((item: any) => analyzeSectionImpact({
      sectionId: String(item.section_id),
      sectionName: item.section_name || '',
      mainContent: item.main_content || '',
      branchContent: item.content || '',
    }));

    const high = allAnalyses.filter(a => a.overallRisk === 'high').length;
    const medium = allAnalyses.filter(a => a.overallRisk === 'medium').length;
    const low = allAnalyses.filter(a => a.overallRisk === 'low').length;

    res.json({ summary: { high, medium, low, total: allAnalyses.length } });
  } catch (err) {
    console.error('查询影响汇总失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
