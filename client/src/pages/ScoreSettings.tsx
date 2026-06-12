import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/shared/Button';
import { Badge } from '@/components/shared/Badge';
import { Loading, ErrorMessage } from '@/components/shared/Loading';
import { useScoresStore, useUsersStore } from '@/api/apiStore';
import { collaboratorsApi, scoresApi, invitationsApi } from '@/api';
import type { InvitationRow } from '@/api';
import styles from './ScoreSettings.module.css';

export function ScoreSettings() {
  const { scoreId } = useParams();
  const navigate = useNavigate();
  const scoresAPI = useScoresStore();
  const usersAPI = useUsersStore();

  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [collabLoading, setCollabLoading] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<'reviewer' | 'contributor'>('contributor');
  const [inviteMessage, setInviteMessage] = useState('');
  const [newOwnerId, setNewOwnerId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [applications, setApplications] = useState<InvitationRow[]>([]);

  const score = scoresAPI.list.data.find((s) => s.id === Number(scoreId));

  useEffect(() => {
    if (scoreId) {
      scoresAPI.fetchOne(Number(scoreId));
      usersAPI.fetchList();
      loadCollaborators();
      loadApplications();
    }
  }, [scoreId]);

  const loadCollaborators = async () => {
    if (!scoreId) return;
    setCollabLoading(true);
    try {
      const data = await collaboratorsApi.getByScore(Number(scoreId));
      setCollaborators(data);
    } catch {}
    setCollabLoading(false);
  };

  const loadApplications = async () => {
    if (!scoreId) return;
    try {
      const data = await invitationsApi.getScoreApplications(Number(scoreId));
      setApplications(data);
    } catch {}
  };

  const handleInvite = async () => {
    if (!inviteUserId || !scoreId) return;
    try {
      await invitationsApi.create({
        score_id: Number(scoreId),
        user_id: Number(inviteUserId),
        invited_by: 1,
        type: 'invite',
        message: inviteMessage || undefined,
      });
      setInviteUserId('');
      setInviteMessage('');
      alert('邀请已发送，等待对方同意');
    } catch (err: any) {
      alert('邀请失败: ' + err.message);
    }
  };

  const handleRemoveCollaborator = async (collabId: number) => {
    try {
      await collaboratorsApi.remove(collabId);
      await loadCollaborators();
    } catch (err: any) {
      alert('移除失败: ' + err.message);
    }
  };

  const handleRespond = async (inviteId: number, status: 'accepted' | 'rejected') => {
    try {
      await invitationsApi.respond(inviteId, status);
      await loadApplications();
      await loadCollaborators();
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  };

  const handleTransfer = async () => {
    if (!newOwnerId || !scoreId) return;
    try {
      await scoresApi.transfer(Number(scoreId), Number(newOwnerId));
      alert('♩ 所有权已转让');
      setNewOwnerId('');
      scoresAPI.fetchList();
    } catch (err: any) {
      alert('转让失败: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!scoreId || deleteConfirm !== score?.name) return;
    try {
      await scoresApi.delete(Number(scoreId));
      alert('♩ 乐谱已删除');
      navigate('/projects');
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    }
  };

  if (!score) return <Loading text="加载乐谱信息…" />;

  const isOwner = score.owner_id === 1; // 假设当前用户 ID=1
  const availableUsers = usersAPI.list.data.filter((u) => u.id !== score.owner_id);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🎛️ 乐谱设置</h1>
          <p className={styles.subtitle}>{score.name} · {score.composer}</p>
        </div>
        <Button variant="secondary" size="md" onClick={() => navigate('/projects')}>← 返回看板</Button>
      </div>

      <div className={styles.grid}>
        {/* ── 基本信息 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>基本信息</h2>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>乐谱名称</span>
            <span className={styles.infoValue}>{score.name}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>作曲者</span>
            <span className={styles.infoValue}>{score.composer}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>所有者</span>
            <span className={styles.infoValue}>{score.owner_name || `用户 #${score.owner_id}`}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>创建时间</span>
            <span className={styles.infoValue}>{new Date(score.created_at).toLocaleDateString('zh-CN')}</span>
          </div>
        </div>

        {/* ── 成员管理 ── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            成员管理
            <Badge variant="default" label={`${collaborators.length + 1} 人`} />
          </h2>

          <div className={styles.memberList}>
            <div className={styles.memberItem}>
              <span className={styles.memberDot} style={{ background: '#58A6FF' }} />
              <span className={styles.memberName}>{score.owner_name || `用户 #${score.owner_id}`}</span>
              <Badge variant="success" label="所有者" />
            </div>
            {collaborators.map((c) => (
              <div key={c.id} className={styles.memberItem}>
                <span className={styles.memberDot} style={{ background: '#3FB950' }} />
                <span className={styles.memberName}>{c.name}</span>
                <Badge variant={c.role === 'reviewer' ? 'info' : 'default'} label={c.role === 'reviewer' ? '审阅人' : '贡献者'} />
                {isOwner && (
                  <button className={styles.removeBtn} onClick={() => handleRemoveCollaborator(c.id)}>✕</button>
                )}
              </div>
            ))}
          </div>

          {/* 待处理的申请 */}
          {applications.length > 0 && (
            <div className={styles.inviteForm}>
              <h3 className={styles.formTitle}>待处理的申请</h3>
              {applications.map((a) => (
                <div key={a.id} className={styles.inviteRow}>
                  <span>{a.user_name || '用户'}</span>
                  <span className={styles.inviteMsg}>{a.message || '申请加入协作'}</span>
                  <Button variant="primary" size="sm" onClick={() => handleRespond(a.id, 'accepted')}>同意</Button>
                  <Button variant="secondary" size="sm" onClick={() => handleRespond(a.id, 'rejected')}>拒绝</Button>
                </div>
              ))}
            </div>
          )}

          {isOwner && (
            <div className={styles.inviteForm}>
              <h3 className={styles.formTitle}>邀请成员</h3>
              <div className={styles.inviteRow}>
                <select className={styles.select} value={inviteUserId} onChange={(e) => setInviteUserId(e.target.value)}>
                  <option value="">选择用户…</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                  ))}
                </select>
                <select className={styles.select} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as any)}>
                  <option value="contributor">贡献者</option>
                  <option value="reviewer">审阅人</option>
                </select>
              </div>
              <div className={styles.inviteRow} style={{ marginTop: 8 }}>
                <input className={styles.inviteMsgInput} placeholder="附言（可选）…" value={inviteMessage} onChange={(e) => setInviteMessage(e.target.value)} />
                <Button variant="primary" size="sm" onClick={handleInvite} disabled={!inviteUserId}>发送邀请</Button>
              </div>
            </div>
          )}
        </div>

        {/* ── 权限管理 ── */}
        {isOwner && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>权限管理</h2>

            <div className={styles.transferSection}>
              <h3 className={styles.formTitle}>转让所有权</h3>
              <p className={styles.formDesc}>将乐谱所有者权限转让给其他用户。转让后您将变为协作者。</p>
              <div className={styles.inviteRow}>
                <select className={styles.select} value={newOwnerId} onChange={(e) => setNewOwnerId(e.target.value)}>
                  <option value="">选择新所有者…</option>
                  {collaborators.filter((c: any) => c.user_id !== score.owner_id).map((c: any) => (
                    <option key={c.user_id} value={c.user_id}>{c.name}</option>
                  ))}
                </select>
                <Button variant="danger" size="sm" onClick={handleTransfer} disabled={!newOwnerId}>转让</Button>
              </div>
            </div>

            <div className={styles.deleteSection}>
              <h3 className={styles.formTitle} style={{ color: 'var(--color-danger-text)' }}>删除乐谱</h3>
              <p className={styles.formDesc}>此操作不可撤销，所有乐段、批注、版本将永久删除。</p>
              <div className={styles.deleteRow}>
                <input
                  className={styles.deleteInput}
                  placeholder={`输入 "${score.name}" 确认删除`}
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleteConfirm !== score.name}>
                  永久删除
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
