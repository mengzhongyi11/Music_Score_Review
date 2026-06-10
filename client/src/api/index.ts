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
  owner_name?: string;
  owner_avatar?: string;
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

  create: (data: { name: string; composer: string; description?: string; owner_id?: number }) =>
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

  merge: (branchId: number) =>
    request<{ message: string; mergedCount: number }>(`/branches/${branchId}/merge`, {
      method: 'POST',
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
