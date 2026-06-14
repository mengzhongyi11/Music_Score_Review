import { Router, Request, Response } from 'express';
import pool from '../db';
import { detectConflicts } from '../services/conflictDetector';

const router = Router();

// 读取分支冲突列表（从已存储的冲突记录 + 状态）
router.get('/conflicts/:branchId', async (req: Request, res: Response) => {
  try {
    const { branchId } = req.params;

    // 先查已有冲突记录
    const [existing] = await pool.query(
      `SELECT mc.*, s.name as section_name
       FROM merge_conflicts mc
       LEFT JOIN sections s ON mc.section_id = s.id
       WHERE mc.branch_id = ?
       ORDER BY FIELD(mc.status, 'pending', 'resolved', 'accepted', 'overridden'), mc.id`,
      [branchId]
    );
    const existingConflicts = (existing || []) as any[];

    // 如果有 pending 冲突，直接返回
    if (existingConflicts.some(c => c.status === 'pending')) {
      return res.json({
        conflicts: existingConflicts,
        summary: {
          total: existingConflicts.length,
          pending: existingConflicts.filter(c => c.status === 'pending').length,
        },
      });
    }

    // 无 pending 冲突 → 重新检测（分支可能新增了 overrides）
    const [overrideRows] = await pool.query(
      `SELECT bo.*, s.name as section_name, s.content as main_content,
              s.tempo as main_tempo, s.key_signature as main_key, s.time_signature as main_time,
              s.score_id
       FROM branch_overrides bo
       JOIN sections s ON bo.section_id = s.id
       WHERE bo.branch_id = ?`,
      [branchId]
    );
    const items = (overrideRows || []) as any[];
    if (!items.length) {
      return res.json({ conflicts: [], summary: { total: 0, pending: 0 } });
    }

    // 清除旧的已解决记录
    await pool.query('DELETE FROM merge_conflicts WHERE branch_id = ? AND status = "pending"', [branchId]);

    const newConflicts: any[] = [];
    for (const item of items) {
      const result = detectConflicts({
        mainContent: item.main_content || '',
        branchContent: item.content || '',
        mainTempo: item.main_tempo,
        branchTempo: item.tempo,
        mainKey: item.main_key,
        branchKey: item.key_signature,
        mainTime: item.main_time,
        branchTime: item.time_signature,
      });

      if (!result.hasConflict) continue;

      for (const c of result.conflicts) {
        const [ins] = await pool.query(
          `INSERT INTO merge_conflicts (branch_id, score_id, section_id, conflict_type, main_content, branch_content, conflict_detail, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [Number(branchId), item.score_id, item.section_id, c.type, c.mainValue, c.branchValue, c.description]
        );
        newConflicts.push({
          id: (ins as any).insertId,
          branch_id: Number(branchId),
          score_id: item.score_id,
          section_id: item.section_id,
          section_name: item.section_name,
          conflict_type: c.type,
          conflict_detail: c.description,
          mainValue: c.mainValue,
          branchValue: c.branchValue,
          measureIndex: c.measureIndex,
          noteIndex: c.noteIndex,
          merge_suggestion: null as string | null,
          status: 'pending',
        });
      }
    }

    res.json({
      conflicts: newConflicts,
      summary: { total: newConflicts.length, pending: newConflicts.filter(c => c.status === 'pending').length },
    });
  } catch (err) {
    console.error('冲突查询失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 解决冲突
router.post('/conflicts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution } = req.body;

    if (!['accept_main', 'accept_branch', 'custom'].includes(resolution)) {
      return res.status(400).json({ message: 'resolution 无效' });
    }

    const statusMap: Record<string, string> = {
      accept_main: 'resolved',
      accept_branch: 'accepted',
      custom: 'overridden',
    };

    await pool.query(
      'UPDATE merge_conflicts SET status = ?, resolved_at = NOW() WHERE id = ?',
      [statusMap[resolution], id]
    );

    res.json({ message: '冲突已解决' });
  } catch (err) {
    console.error('解决冲突失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
