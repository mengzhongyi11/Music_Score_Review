import { Router, Request, Response } from 'express';
import pool from '../db';
import { createNotification } from './notifications';

const router = Router();

// 查看用户的待处理邀请/申请
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, s.name as score_name, u.name as inviter_name
       FROM invitations i
       JOIN scores s ON i.score_id = s.id
       LEFT JOIN users u ON i.invited_by = u.id
       WHERE i.user_id = ? AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询邀请失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 查看乐谱的待处理申请（建库人可见）
router.get('/score/:scoreId', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.*, u.name as user_name
       FROM invitations i
       JOIN users u ON i.user_id = u.id
       WHERE i.score_id = ? AND i.status = 'pending'
       ORDER BY i.created_at DESC`,
      [req.params.scoreId]
    );
    res.json(rows);
  } catch (err) {
    console.error('查询申请失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 创建邀请或申请
router.post('/', async (req: Request, res: Response) => {
  try {
    const { score_id, user_id, invited_by, type, message } = req.body;
    if (!score_id || !user_id) {
      return res.status(400).json({ message: '参数不完整' });
    }

    // 检查是否已是协作者
    const [exist] = await pool.query(
      'SELECT id FROM score_collaborators WHERE score_id = ? AND user_id = ?',
      [score_id, user_id]
    );
    if ((exist as any[]).length > 0) {
      return res.status(400).json({ message: '该用户已是协作者' });
    }

    // 检查是否有待处理的邀请/申请
    const [pending] = await pool.query(
      'SELECT id FROM invitations WHERE score_id = ? AND user_id = ? AND status = "pending"',
      [score_id, user_id]
    );
    if ((pending as any[]).length > 0) {
      return res.status(400).json({ message: '已有待处理的邀请/申请' });
    }

    const [result] = await pool.query(
      'INSERT INTO invitations (score_id, user_id, invited_by, type, message) VALUES (?, ?, ?, ?, ?)',
      [score_id, user_id, invited_by || null, type || 'invite', message || null]
    );

    // 邀请通知：通知被邀请人
    if (type !== 'apply' && invited_by) {
      try {
        const [sRows] = await pool.query('SELECT name FROM scores WHERE id = ?', [score_id]);
        const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [invited_by]);
        const scoreName = (sRows as any[])[0]?.name || '乐谱';
        const inviterName = (uRows as any[])[0]?.name || '用户';
        await createNotification({ userId: user_id, type: 'invite', scoreId: score_id, actorId: invited_by, message: `${inviterName} 邀请你协作「${scoreName}」` });
      } catch (_) {}
    }

    res.status(201).json({ id: (result as any).insertId, message: type === 'apply' ? '已提交申请' : '已发送邀请' });
  } catch (err) {
    console.error('创建邀请失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

// 同意/拒绝邀请或申请
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { status } = req.body; // 'accepted' | 'rejected'
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: '状态值无效' });
    }

    const [invRows] = await pool.query('SELECT * FROM invitations WHERE id = ?', [req.params.id]);
    const inv = (invRows as any[])[0];
    if (!inv) return res.status(404).json({ message: '未找到该记录' });

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query('UPDATE invitations SET status = ? WHERE id = ?', [status, req.params.id]);

      if (status === 'accepted') {
        // 自动添加协作者
        const role = inv.type === 'apply' ? 'contributor' : 'reviewer';
        await connection.query(
          'INSERT IGNORE INTO score_collaborators (score_id, user_id, role, invited_by) VALUES (?, ?, ?, ?)',
          [inv.score_id, inv.user_id, role, inv.invited_by]
        );
      }

      await connection.commit();

      // 加入/拒绝通知
      try {
        const [sRows] = await pool.query('SELECT name, owner_id FROM scores WHERE id = ?', [inv.score_id]);
        const [uRows] = await pool.query('SELECT name FROM users WHERE id = ?', [inv.user_id]);
        const scoreInfo = (sRows as any[])[0];
        const userName = (uRows as any[])[0]?.name || '用户';
        if (status === 'accepted') {
          const msg = `${userName} 已加入「${scoreInfo?.name}」协作`;
          // 通知乐谱主人
          if (scoreInfo?.owner_id && scoreInfo.owner_id !== inv.user_id) {
            await createNotification({ userId: scoreInfo.owner_id, type: 'member_join', scoreId: inv.score_id, actorId: inv.user_id, message: msg });
          }
          // 通知邀请人
          if (inv.invited_by && inv.invited_by !== inv.user_id && inv.invited_by !== scoreInfo?.owner_id) {
            await createNotification({ userId: inv.invited_by, type: 'member_join', scoreId: inv.score_id, actorId: inv.user_id, message: msg });
          }
        } else if (status === 'rejected' && inv.invited_by) {
          await createNotification({ userId: inv.invited_by, type: 'invite_rejected', scoreId: inv.score_id, actorId: inv.user_id, message: `${userName} 拒绝了你的协作邀请` });
        }
      } catch (_) {}

      res.json({ message: status === 'accepted' ? '已同意' : '已拒绝' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('处理邀请失败:', err);
    res.status(500).json({ message: '服务器繁忙' });
  }
});

export default router;
