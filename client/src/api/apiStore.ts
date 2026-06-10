/* ═══════════════════════════════════════════
   谱审 — API 驱动的 Zustand 状态管理层
   对接后端全部接口，统一管理 loading / error
   ═══════════════════════════════════════════ */

import { create } from 'zustand';
import type {
  ScoreRow, SectionRow, CommentRow, UserRow,
  CollaboratorRow, VersionRow, BranchRow, TagRow,
  FeedItem, StatsRow, DashboardData, FullScore,
} from './index';
import {
  scoresApi, sectionsApi, commentsApi, usersApi,
  versionsApi, branchesApi, collaboratorsApi,
  statsApi, dashboardApi, feedApi, tagsApi,
} from './index';

/* ── Loading / Error 基础类型 ── */
interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

function initialAsync<T>(defaultData: T): AsyncState<T> {
  return { data: defaultData, loading: false, error: null };
}

/* ═════════════════════════════════
   Scores Store
   ═════════════════════════════════ */

interface ScoresStore {
  list: AsyncState<ScoreRow[]>;
  current: AsyncState<ScoreRow | null>;
  fullScore: AsyncState<FullScore | null>;
  fetchList: (params?: { owner_id?: number; tag?: string }) => Promise<void>;
  fetchOne: (id: number) => Promise<void>;
  fetchFullScore: (id: number) => Promise<void>;
  createScore: (data: { name: string; composer: string; description?: string; owner_id?: number }) => Promise<number>;
  searchScores: (keyword: string) => Promise<void>;
  deleteScore: (id: number) => Promise<void>;
}

export const useScoresStore = create<ScoresStore>((set, get) => ({
  list: initialAsync<ScoreRow[]>([]),
  current: initialAsync<ScoreRow | null>(null),
  fullScore: initialAsync<FullScore | null>(null),

  fetchList: async (params) => {
    set({ list: { ...get().list, loading: true, error: null } });
    try {
      const data = await scoresApi.list(params as any);
      set({ list: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ list: { ...get().list, loading: false, error: err.message } });
    }
  },

  fetchOne: async (id) => {
    set({ current: { ...get().current, loading: true, error: null } });
    try {
      const data = await scoresApi.get(id);
      set({ current: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ current: { ...get().current, loading: false, error: err.message } });
    }
  },

  fetchFullScore: async (id) => {
    set({ fullScore: { ...get().fullScore, loading: true, error: null } });
    try {
      const data = await scoresApi.fullScore(id);
      set({ fullScore: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ fullScore: { ...get().fullScore, loading: false, error: err.message } });
    }
  },

  createScore: async (data) => {
    const res = await scoresApi.create(data);
    await get().fetchList();
    return res.id;
  },

  searchScores: async (keyword) => {
    set({ list: { ...get().list, loading: true, error: null } });
    try {
      const data = await scoresApi.search(keyword);
      set({ list: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ list: { ...get().list, loading: false, error: err.message } });
    }
  },

  deleteScore: async (id) => {
    await scoresApi.delete(id);
    await get().fetchList();
  },
}));

/* ═════════════════════════════════
   Sections Store
   ═════════════════════════════════ */

interface SectionsStore {
  tree: AsyncState<SectionRow[]>;
  current: AsyncState<SectionRow | null>;
  children: AsyncState<SectionRow[]>;
  versions: AsyncState<VersionRow[]>;
  fetchTree: (scoreId: number) => Promise<void>;
  fetchOne: (id: number) => Promise<void>;
  fetchChildren: (id: number) => Promise<void>;
  fetchVersions: (id: number) => Promise<void>;
  updateSection: (id: number, data: Partial<SectionRow>) => Promise<void>;
}

export const useSectionsStore = create<SectionsStore>((set, get) => ({
  tree: initialAsync<SectionRow[]>([]),
  current: initialAsync<SectionRow | null>(null),
  children: initialAsync<SectionRow[]>([]),
  versions: initialAsync<VersionRow[]>([]),

  fetchTree: async (scoreId) => {
    set({ tree: { ...get().tree, loading: true, error: null } });
    try {
      const data = await sectionsApi.getTree(scoreId);
      set({ tree: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ tree: { ...get().tree, loading: false, error: err.message } });
    }
  },

  fetchOne: async (id) => {
    set({ current: { ...get().current, loading: true, error: null } });
    try {
      const data = await sectionsApi.get(id);
      set({ current: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ current: { ...get().current, loading: false, error: err.message } });
    }
  },

  fetchChildren: async (id) => {
    set({ children: { ...get().children, loading: true, error: null } });
    try {
      const data = await sectionsApi.getChildren(id);
      set({ children: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ children: { ...get().children, loading: false, error: err.message } });
    }
  },

  fetchVersions: async (id) => {
    set({ versions: { ...get().versions, loading: true, error: null } });
    try {
      const data = await sectionsApi.getVersions(id);
      set({ versions: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ versions: { ...get().versions, loading: false, error: err.message } });
    }
  },

  updateSection: async (id, data) => {
    await sectionsApi.update(id, data as any);
    await get().fetchOne(id);
  },
}));

/* ═════════════════════════════════
   Comments Store
   ═════════════════════════════════ */

interface CommentsStore {
  list: AsyncState<CommentRow[]>;
  fetchBySection: (sectionId: number) => Promise<void>;
  createComment: (data: { section_id: number; user_id: number; content: string; measure_ref?: string }) => Promise<void>;
  resolveComment: (id: number) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
}

export const useCommentsStore = create<CommentsStore>((set, get) => ({
  list: initialAsync<CommentRow[]>([]),

  fetchBySection: async (sectionId) => {
    set({ list: { ...get().list, loading: true, error: null } });
    try {
      const data = await commentsApi.getBySection(sectionId);
      set({ list: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ list: { ...get().list, loading: false, error: err.message } });
    }
  },

  createComment: async (data) => {
    await commentsApi.create(data);
    await get().fetchBySection(data.section_id);
  },

  resolveComment: async (id) => {
    await commentsApi.updateStatus(id, 'resolved');
    set((state) => ({
      list: {
        ...state.list,
        data: state.list.data.map((c) =>
          c.id === id ? { ...c, status: 'resolved' as const } : c
        ),
      },
    }));
  },

  deleteComment: async (id) => {
    const target = get().list.data.find((c) => c.id === id);
    await commentsApi.delete(id);
    if (target) await get().fetchBySection(target.section_id);
  },
}));

/* ═════════════════════════════════
   Users Store
   ═════════════════════════════════ */

interface UsersStore {
  list: AsyncState<UserRow[]>;
  current: AsyncState<UserRow | null>;
  collaborators: AsyncState<CollaboratorRow[]>;
  fetchList: () => Promise<void>;
  fetchOne: (id: number) => Promise<void>;
  fetchCollaborators: (scoreId: number) => Promise<void>;
}

export const useUsersStore = create<UsersStore>((set, get) => ({
  list: initialAsync<UserRow[]>([]),
  current: initialAsync<UserRow | null>(null),
  collaborators: initialAsync<CollaboratorRow[]>([]),

  fetchList: async () => {
    set({ list: { ...get().list, loading: true, error: null } });
    try {
      const data = await usersApi.list();
      set({ list: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ list: { ...get().list, loading: false, error: err.message } });
    }
  },

  fetchOne: async (id) => {
    set({ current: { ...get().current, loading: true, error: null } });
    try {
      const data = await usersApi.get(id);
      set({ current: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ current: { ...get().current, loading: false, error: err.message } });
    }
  },

  fetchCollaborators: async (scoreId) => {
    set({ collaborators: { ...get().collaborators, loading: true, error: null } });
    try {
      const data = await collaboratorsApi.getByScore(scoreId);
      set({ collaborators: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ collaborators: { ...get().collaborators, loading: false, error: err.message } });
    }
  },
}));

/* ═════════════════════════════════
   Branches Store
   ═════════════════════════════════ */

interface BranchesStore {
  list: AsyncState<BranchRow[]>;
  diff: AsyncState<{ branch: BranchRow; diffs: any[] } | null>;
  fetchByScore: (scoreId: number) => Promise<void>;
  fetchDiff: (branchId: number) => Promise<void>;
  createBranch: (data: { score_id: number; name: string; created_by: number }) => Promise<void>;
  mergeBranch: (branchId: number) => Promise<void>;
}

export const useBranchesStore = create<BranchesStore>((set, get) => ({
  list: initialAsync<BranchRow[]>([]),
  diff: initialAsync<{ branch: BranchRow; diffs: any[] } | null>(null),

  fetchByScore: async (scoreId) => {
    set({ list: { ...get().list, loading: true, error: null } });
    try {
      const data = await branchesApi.getByScore(scoreId);
      set({ list: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ list: { ...get().list, loading: false, error: err.message } });
    }
  },

  fetchDiff: async (branchId) => {
    set({ diff: { ...get().diff, loading: true, error: null } });
    try {
      const data = await branchesApi.getDiff(branchId);
      set({ diff: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ diff: { ...get().diff, loading: false, error: err.message } });
    }
  },

  createBranch: async (data) => {
    await branchesApi.create(data);
    await get().fetchByScore(data.score_id);
  },

  mergeBranch: async (branchId) => {
    await branchesApi.merge(branchId);
    await get().fetchByScore((get().list.data.find((b) => b.id === branchId) as BranchRow).score_id);
  },
}));

/* ═════════════════════════════════
   Dashboard / Stats / Feed / Tags
   ═════════════════════════════════ */

interface DashboardStore {
  data: AsyncState<DashboardData | null>;
  stats: AsyncState<StatsRow | null>;
  feed: AsyncState<FeedItem[]>;
  tags: AsyncState<TagRow[]>;
  fetchDashboard: () => Promise<void>;
  fetchStats: (userId?: number) => Promise<void>;
  fetchFeed: (limit?: number) => Promise<void>;
  fetchTags: () => Promise<void>;
}

export const useDashboardStore = create<DashboardStore>((set, get) => ({
  data: initialAsync<DashboardData | null>(null),
  stats: initialAsync<StatsRow | null>(null),
  feed: initialAsync<FeedItem[]>([]),
  tags: initialAsync<TagRow[]>([]),

  fetchDashboard: async () => {
    set({ data: { ...get().data, loading: true, error: null } });
    try {
      const data = await dashboardApi.get();
      set({ data: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ data: { ...get().data, loading: false, error: err.message } });
    }
  },

  fetchStats: async (userId) => {
    set({ stats: { ...get().stats, loading: true, error: null } });
    try {
      const data = await statsApi.get(userId);
      set({ stats: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ stats: { ...get().stats, loading: false, error: err.message } });
    }
  },

  fetchFeed: async (limit = 20) => {
    set({ feed: { ...get().feed, loading: true, error: null } });
    try {
      const data = await feedApi.get(limit);
      set({ feed: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ feed: { ...get().feed, loading: false, error: err.message } });
    }
  },

  fetchTags: async () => {
    set({ tags: { ...get().tags, loading: true, error: null } });
    try {
      const data = await tagsApi.list();
      set({ tags: { data, loading: false, error: null } });
    } catch (err: any) {
      set({ tags: { ...get().tags, loading: false, error: err.message } });
    }
  },
}));
