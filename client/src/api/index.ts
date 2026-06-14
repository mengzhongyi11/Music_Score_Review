/* ═══════════════════════════════════════════
   谱审 (Score Review) — API 客户端
   所有后端 RESTful 接口的封装层
   ═══════════════════════════════════════════ */

const BASE = '/api';

/* ── 类型辅助 ── */
interface ApiOptions {
  params?: Record<string, string | number | undefined>;
}

async function request<T>(url: string, options?: RequestInit & ApiOptions): Promise<T> {
  let finalUrl = `${BASE}${url}`;

  if (options?.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined) searchParams.set(key, String(value));
    }
    const qs = searchParams.toString();
    if (qs) finalUrl += `?${qs}`;
  }

  const res = await fetch(finalUrl, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: '网络请求失败' }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

/* ════════════════════════════════
   类型定义（匹配数据库字段）
   ════════════════════════════════ */

export interface ScoreRow {
  id: number;
  name: string;
  composer: string;
  description: string | null;
  owner_id: number | null;
  is_public: boolean | number;
  review_status?: 'pending' | 'working' | 'approved' | 'rejected';
  reviewed_by?: number | null;
  review_comment?: string | null;
  reviewed_at?: string | null;
  owner_name?: string;
  owner_avatar?: string;
  comment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SectionRow {
  id: number;
  score_id: number;
  parent_id: number | null;
  name: string;
  path: string;
  type: 'folder' | 'section';
  content: string | null;
  tempo: string | null;
  key_signature: string | null;
  time_signature: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // 来自 fullscore 查询的扩展字段
  version_count?: number;
  prev_content?: string | null;
  prev_name?: string | null;
}

export interface CommentRow {
  id: number;
  section_id: number;
  user_id: number;
  author: string;
  avatar: string | null;
  content: string;
  status: 'open' | 'resolved';
  measure_ref: string | null;
  created_at: string;
  // 来自 JOIN 的扩展字段
  user_role?: string;
  user_title?: string;
  // AI 初审结果（新评论创建时返回）
  ai_suggestion?: {
    id: number;
    suggestionType: 'auto_accept' | 'auto_reject' | 'discuss' | 'info';
    priority: 'P0' | 'P1' | 'P2';
    layer: 'rule' | 'rag' | 'ai';
    reason: string;
  } | null;
}

export interface UserRow {
  id: number;
  name: string;
  avatar: string | null;
  role: 'admin' | 'reviewer' | 'contributor';
  title: string | null;
  bio: string | null;
  created_at: string;
  // 来自 profile 的扩展字段
  stats?: {
    myScores: number;
    collaborations: number;
    comments: number;
  };
}

export interface CollaboratorRow {
  id: number;
  score_id: number;
  user_id: number;
  role: 'reviewer' | 'contributor';
  invited_by: number | null;
  created_at: string;
  // JOIN 字段
  name: string;
  avatar: string | null;
  user_role: string;
  invited_by_name?: string;
}

export interface VersionRow {
  id: number;
  section_id: number;
  name: string;
  content: string | null;
  tempo: string | null;
  key_signature: string | null;
  time_signature: string | null;
  created_at: string;
}

export interface BranchRow {
  id: number;
  score_id: number;
  name: string;
  status: 'active' | 'merged' | 'closed';
  created_by: number | null;
  created_at: string;
  // JOIN 字段
  created_by_name?: string;
  created_by_avatar?: string;
  changes_count?: number;
}

export interface BranchOverrideRow {
  id: number;
  branch_id: number;
  section_id: number;
  name: string | null;
  content: string | null;
  tempo: string | null;
  key_signature: string | null;
  time_signature: string | null;
  created_at: string;
  // JOIN 字段（diff查询）
  main_name?: string;
  main_content?: string | null;
  main_tempo?: string | null;
  main_key?: string | null;
  main_time?: string | null;
}

export interface TagRow {
  id: number;
  name: string;
  color: string;
}

export interface FeedItem {
  type: 'comment' | 'merge' | 'version';
  time: string;
  user_name?: string;
  avatar?: string;
  summary: string;
  score_name: string;
  score_id: number;
  section_name?: string;
  ref_status?: string | null;
  ref_measure?: string | null;
}

export interface StatsRow {
  myScores: number;
  myCollaborators: number;
  pendingReviews: number;
  activeBranches: number;
  totalSections: number;
  todayEdits: number;
}

export interface DashboardData {
  activity: { day: string; type: string; count: number }[];
  topContributors: { id: number; name: string; avatar: string; role: string; comment_count: number }[];
  tagDistribution: { name: string; color: string; score_count: number }[];
}

export interface FullScore {
  score: ScoreRow;
  sections: SectionRow[];
  comments: CommentRow[];
}

/* ════════════════════════════════
   Scores（乐谱）
   ════════════════════════════════ */

export const scoresApi = {
  list: (params?: { owner_id?: number; tag?: string }) =>
    request<ScoreRow[]>('/scores', { params: params as any }),

  get: (id: number) =>
    request<ScoreRow>(`/scores/${id}`),

  create: (data: { name: string; composer: string; description?: string; owner_id?: number; is_public?: boolean }) =>
    request<{ id: number; message: string }>('/scores', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  search: (keyword: string) =>
    request<ScoreRow[]>(`/scores/search/${encodeURIComponent(keyword)}`),

  transfer: (id: number, newOwnerId: number) =>
    request<{ message: string }>(`/scores/${id}/transfer`, {
      method: 'PUT',
      body: JSON.stringify({ new_owner_id: newOwnerId }),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/scores/${id}`, { method: 'DELETE' }),

  fullScore: (id: number) =>
    request<FullScore>(`/scores/${id}/full-score`),
};

/* ════════════════════════════════
   Sections（乐段）
   ════════════════════════════════ */

export const sectionsApi = {
  getRoots: (scoreId: number) =>
    request<SectionRow[]>(`/sections/score/${scoreId}`),

  getTree: (scoreId: number) =>
    request<SectionRow[]>(`/sections/score/${scoreId}/tree`),

  get: (id: number) =>
    request<SectionRow>(`/sections/${id}`),

  getChildren: (id: number) =>
    request<SectionRow[]>(`/sections/${id}/children`),

  create: (data: { score_id: number; parent_id?: number; name: string; path: string; type?: string; content?: string; sort_order?: number }) =>
    request<{ id: number; message: string }>('/sections', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { name?: string; content?: string; tempo?: string; key_signature?: string; time_signature?: string }) =>
    request<{ message: string }>(`/sections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getVersions: (id: number) =>
    request<VersionRow[]>(`/sections/${id}/versions`),

  delete: (id: number) =>
    request<{ message: string }>(`/sections/${id}`, { method: 'DELETE' }),
};

/* ════════════════════════════════
   Comments（评论 / 批注）
   ════════════════════════════════ */

export const commentsApi = {
  getAll: () =>
    request<any[]>('/comments/by-score'),

  getBySection: (sectionId: number) =>
    request<CommentRow[]>(`/comments/section/${sectionId}`),

  create: (data: { section_id: number; user_id: number; content: string; measure_ref?: string }) =>
    request<CommentRow & { message: string }>('/comments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, status: 'open' | 'resolved') =>
    request<{ message: string }>(`/comments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  delete: (id: number) =>
    request<{ message: string }>(`/comments/${id}`, { method: 'DELETE' }),
};

/* ════════════════════════════════
   Users（用户）
   ════════════════════════════════ */

export const usersApi = {
  list: () => request<UserRow[]>('/users'),

  get: (id: number) => request<UserRow>(`/users/${id}`),

  getProfile: (id: number) =>
    request<UserRow & { stats: { myScores: number; collaborations: number; comments: number } }>(`/users/${id}/profile`),

  getScores: (id: number) => request<ScoreRow[]>(`/users/${id}/scores`),

  getCollaborations: (id: number) =>
    request<(ScoreRow & { collab_role: string })[]>(`/users/${id}/collaborations`),

  getActivity: (id: number, limit = 20) =>
    request<{ type: string; time: string; summary: string; score_name: string; score_id: number }[]>(
      `/users/${id}/activity`, { params: { limit: String(limit) } }
    ),
};

/* ════════════════════════════════
   Versions（版本）
   ════════════════════════════════ */

export const versionsApi = {
  get: (id: number) => request<VersionRow>(`/versions/${id}`),

  rollback: (id: number) =>
    request<{ message: string; section_id: number; restored: any }>(`/versions/${id}/rollback`, {
      method: 'POST',
    }),
};

/* ════════════════════════════════
   Branches（分支）
   ════════════════════════════════ */

export const branchesApi = {
  getByScore: (scoreId: number) => request<BranchRow[]>(`/branches/score/${scoreId}`),

  create: (data: { score_id: number; name: string; created_by: number }) =>
    request<{ id: number; name: string; message: string }>('/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSection: (branchId: number, sectionId: number, data: { name?: string; content?: string; tempo?: string; key_signature?: string; time_signature?: string }) =>
    request<{ message: string }>(`/branches/${branchId}/sections/${sectionId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getDiff: (branchId: number) =>
    request<{ branch: BranchRow; diffs: BranchOverrideRow[] }>(`/branches/${branchId}/diff`),

  merge: (branchId: number, actorId?: number) =>
    request<{ message: string; mergedCount: number }>(`/branches/${branchId}/merge`, {
      method: 'POST',
      body: JSON.stringify({ actor_id: actorId || 1 }),
    }),

  updateStatus: (branchId: number, status: string) =>
    request<{ message: string }>(`/branches/${branchId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
};

/* ════════════════════════════════
   Collaborators（协作者）
   ════════════════════════════════ */

export const collaboratorsApi = {
  getByScore: (scoreId: number) => request<CollaboratorRow[]>(`/collaborators/score/${scoreId}`),

  invite: (data: { score_id: number; user_id: number; role: string; invited_by?: number }) =>
    request<{ id: number; message: string }>('/collaborators', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRole: (id: number, role: string) =>
    request<{ message: string }>(`/collaborators/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),

  remove: (id: number) =>
    request<{ message: string }>(`/collaborators/${id}`, { method: 'DELETE' }),
};

/* ════════════════════════════════
   Stats / Dashboard / Feed / Tags
   ════════════════════════════════ */

export const statsApi = {
  get: (userId?: number) =>
    request<StatsRow>('/stats', { params: userId ? { user_id: String(userId) } : undefined }),
};

export const dashboardApi = {
  get: () => request<DashboardData>('/dashboard'),
};

export const feedApi = {
  get: (limit = 20) =>
    request<FeedItem[]>('/feed', { params: { limit: String(limit) } }),
};

export const tagsApi = {
  list: () => request<TagRow[]>('/tags'),

  getByScore: (scoreId: number) => request<TagRow[]>(`/tags/score/${scoreId}`),

  setByScore: (scoreId: number, tagIds: number[]) =>
    request<{ message: string }>(`/tags/score/${scoreId}`, {
      method: 'PUT',
      body: JSON.stringify({ tag_ids: tagIds }),
    }),
};

/* ════════════════════════════════
   辅助：通用健康检查
   ════════════════════════════════ */

export async function healthCheck(): Promise<{ status: string; message: string }> {
  return request('/health');
}

/* ════════════════════════════════
   Reviews（审阅）
   ════════════════════════════════ */

export interface ReviewRow {
  id: number;
  score_id: number;
  reviewer_id: number;
  status: 'pending' | 'approved' | 'rejected';
  comment: string | null;
  created_at: string;
  reviewer_name?: string;
}

export const reviewsApi = {
  submit: (scoreId: number, data: { status: string; comment?: string; reviewer_id: number }) =>
    request<{ message: string; reviewId: number }>(`/reviews/${scoreId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getHistory: (scoreId: number) =>
    request<ReviewRow[]>(`/reviews/${scoreId}`),
};

/* ════════════════════════════════
   Invitations（邀请/申请）
   ════════════════════════════════ */

export interface InvitationRow {
  id: number;
  score_id: number;
  user_id: number;
  invited_by: number | null;
  type: 'invite' | 'apply';
  status: 'pending' | 'accepted' | 'rejected';
  message: string | null;
  created_at: string;
  score_name?: string;
  inviter_name?: string;
  user_name?: string;
}

export const invitationsApi = {
  getUserInvitations: (userId: number) =>
    request<InvitationRow[]>(`/invitations/user/${userId}`),

  getScoreApplications: (scoreId: number) =>
    request<InvitationRow[]>(`/invitations/score/${scoreId}`),

  create: (data: { score_id: number; user_id: number; invited_by?: number; type?: string; message?: string }) =>
    request<{ id: number; message: string }>('/invitations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  respond: (id: number, status: 'accepted' | 'rejected') =>
    request<{ message: string }>(`/invitations/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
};

/* ════════════════════════════════
   AI 审阅
   ════════════════════════════════ */

export interface ReviewSuggestionRow {
  id: number;
  score_id: number;
  branch_id: number | null;
  section_id: number | null;
  layer: 'rule' | 'rag' | 'ai';
  suggestion_type: 'auto_accept' | 'auto_reject' | 'discuss' | 'info';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  content: string | null;
  reason: string | null;
  rag_context: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'dismissed';
  created_by: number | null;
  reviewed_by: number | null;
  reviewed_by_name?: string;
  reviewed_at: string | null;
  created_at: string;
}

export const aiReviewApi = {
  analyze: (data: { score_id: number; section_id?: number; branch_id?: number; content: string; title?: string; user_id?: number }) =>
    request<{ suggestion: ReviewSuggestionRow & { id: number } }>('/ai-review/analyze', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  analyzeBranch: (branchId: number, userId?: number) =>
    request<{ suggestions: (ReviewSuggestionRow & { section_name?: string })[] }>(`/ai-review/branch/${branchId}`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  getSuggestions: (scoreId: number, params?: { status?: string; priority?: string }) =>
    request<{ suggestions: ReviewSuggestionRow[] }>(`/ai-review/suggestions/${scoreId}`, {
      params: params as any,
    }),

  updateStatus: (id: number, status: string, reviewedBy?: number) =>
    request<{ message: string }>(`/ai-review/suggestions/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reviewed_by: reviewedBy }),
    }),
};

/* ── 通知类型 ── */
export interface NotificationRow {
  id: number;
  user_id: number;
  type: 'merge' | 'review' | 'member_join' | 'invite' | 'invite_rejected';
  score_id: number | null;
  actor_id: number | null;
  actor_name?: string;
  score_name?: string;
  message: string;
  is_read: boolean | number;
  created_at: string;
}

/* ════════════════════════════════
   Notifications（通知）
   ════════════════════════════════ */

export const notificationsApi = {
  list: (userId: number) =>
    request<NotificationRow[]>(`/notifications/${userId}`),

  unreadCount: (userId: number) =>
    request<{ count: number }>(`/notifications/${userId}/unread-count`),

  markRead: (id: number) =>
    request<{ message: string }>(`/notifications/${id}/read`, { method: 'PUT' }),

  markAllRead: (userId: number) =>
    request<{ message: string }>(`/notifications/read-all/${userId}`, { method: 'PUT' }),
};

/* ════════════════════════════════
   Merge（冲突检测）
   ════════════════════════════════ */

export interface ConflictRow {
  id: number;
  branch_id: number;
  score_id: number;
  section_id: number;
  section_name?: string;
  conflict_type: 'note_content' | 'tempo' | 'key_signature' | 'time_signature' | 'metadata';
  conflict_detail: string | null;
  merge_suggestion: string | null;
  mainValue?: string;
  branchValue?: string;
  measureIndex?: number;
  noteIndex?: number;
  status: string;
  created_at: string;
}

export const mergeApi = {
  getConflicts: (branchId: number) =>
    request<{ conflicts: ConflictRow[]; summary: { total: number; noteConflicts: number; otherConflicts: number } }>(`/merge/conflicts/${branchId}`),

  resolveConflict: (id: number, data: { resolution: 'accept_main' | 'accept_branch' | 'custom'; custom_content?: string; resolved_by?: number }) =>
    request<{ message: string }>(`/merge/conflicts/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

/* ════════════════════════════════
   Impact（影响分析）
   ════════════════════════════════ */

export interface ImpactItem {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface ImpactResult {
  sectionId: string;
  sectionName: string;
  overallRisk: 'high' | 'medium' | 'low';
  impacts: ImpactItem[];
}

export const impactApi = {
  analyzeSection: (data: { score_id: number; section_name?: string; new_content: string; old_content?: string }) =>
    request<{ analysis: ImpactResult }>('/impact/analyze-section', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  analyzeBranch: (branchId: number) =>
    request<{ analyses: ImpactResult[] }>(`/impact/analyze-branch/${branchId}`, {
      method: 'POST',
    }),

  getSummary: (scoreId: number) =>
    request<{ summary: { high: number; medium: number; low: number; total: number } }>(`/impact/summary/${scoreId}`),
};

/* ════════════════════════════════
   Preferences（偏好学习）
   ════════════════════════════════ */

export interface ReviewStatsData {
  stats: {
    totalProcessed: number;
    acceptanceRate: number;
    rejectionRate: number;
    aiAccuracy: number;
  };
  preferences: any[];
}

export const preferencesApi = {
  getStats: (userId: number) =>
    request<ReviewStatsData>(`/preferences/${userId}/stats`),

  updatePreferences: (userId: number, preferences: { key: string; value: any; weight?: number }[]) =>
    request<{ message: string }>(`/preferences/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ preferences }),
    }),

  checkReject: (content: string, userId?: number) =>
    request<{ matched: boolean; patterns: string[] }>('/preferences/check-reject', {
      method: 'POST',
      body: JSON.stringify({ content, user_id: userId }),
    }),

  getGlobalStats: () =>
    request<{ globalStats: any }>('/preferences/ai-stats'),
};

/* ════════════════════════════════
   Import（MusicXML 导入）
   ════════════════════════════════ */

export const importApi = {
  upload: (xml: string, scoreId?: number, userId?: number) =>
    request<{ message: string; scoreId?: number; branchId?: number; title: string }>('/import', {
      method: 'POST',
      body: JSON.stringify({ xml, scoreId, userId }),
    }),
};

export default {
  scores: scoresApi,
  sections: sectionsApi,
  comments: commentsApi,
  users: usersApi,
  versions: versionsApi,
  branches: branchesApi,
  collaborators: collaboratorsApi,
  stats: statsApi,
  dashboard: dashboardApi,
  feed: feedApi,
  tags: tagsApi,
  healthCheck,
};
