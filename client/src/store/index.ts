import { create } from 'zustand';
import type { User, Annotation, Version, KanbanCard, ReviewStatus } from '@/types';
import type { NotificationRow } from '@/api';
import { notificationsApi } from '@/api';

/* ── 用户状态 ── */
interface UserState {
  currentUser: User;
  collaborators: User[];
  setCollaborators: (users: User[]) => void;
  updateCursor: (userId: string, position: User['cursorPosition']) => void;
}

export const useUserStore = create<UserState>((set) => ({
  currentUser: {
    id: 'u1',
    name: '张三',
    avatar: '',
    online: true,
    cursorColor: '#58A6FF',
  },
  collaborators: [
    { id: 'u2', name: '李四', avatar: '', online: true, cursorColor: '#3FB950' },
    { id: 'u3', name: '王五', avatar: '', online: false, cursorColor: '#D29922' },
  ],
  setCollaborators: (collaborators) => set({ collaborators }),
  updateCursor: (userId, position) =>
    set((state) => ({
      collaborators: state.collaborators.map((u) =>
        u.id === userId ? { ...u, cursorPosition: position } : u
      ),
    })),
}));

/* ── 审阅状态 ── */
interface ReviewState {
  activeSectionId: string | null;
  scoreType: 'staff' | 'jianpu';
  activeVersionId: string | null;
  annotations: Annotation[];
  setActiveSection: (id: string) => void;
  setScoreType: (type: 'staff' | 'jianpu') => void;
  setActiveVersion: (id: string) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotation: (annotation: Annotation) => void;
  resolveAnnotation: (id: string) => void;
}

export const useReviewStore = create<ReviewState>((set) => ({
  activeSectionId: null,
  scoreType: 'staff',
  activeVersionId: null,
  annotations: [],
  setActiveSection: (id) => set({ activeSectionId: id }),
  setScoreType: (type) => set({ scoreType: type }),
  setActiveVersion: (id) => set({ activeVersionId: id }),
  setAnnotations: (annotations) => set({ annotations }),
  addAnnotation: (annotation) =>
    set((state) => ({ annotations: [...state.annotations, annotation] })),
  resolveAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, status: 'resolved' as const } : a
      ),
    })),
}));

/* ── 侧边栏状态 ── */
interface SidebarState {
  collapsed: boolean;
  activeFilter: ReviewStatus | 'all';
  toggleCollapsed: () => void;
  setActiveFilter: (filter: ReviewStatus | 'all') => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  activeFilter: 'all',
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setActiveFilter: (filter) => set({ activeFilter: filter }),
}));

/* ── 通知状态（API 驱动） ── */
interface NotificationState {
  notifications: NotificationRow[];
  unreadCount: number;
  loading: boolean;
  fetchList: (userId?: number) => Promise<void>;
  fetchUnreadCount: (userId?: number) => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: (userId?: number) => Promise<void>;
}

const DEFAULT_USER_ID = 1;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchList: async (userId = DEFAULT_USER_ID) => {
    set({ loading: true });
    try {
      const data = await notificationsApi.list(userId);
      const active = data.filter(n => !n.is_read);
      set({ notifications: data, unreadCount: active.length, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchUnreadCount: async (userId = DEFAULT_USER_ID) => {
    try {
      const { count } = await notificationsApi.unreadCount(userId);
      set({ unreadCount: count });
    } catch {}
  },

  markRead: async (id) => {
    // 乐观更新
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true as const } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    }));
    try {
      await notificationsApi.markRead(id);
    } catch {}
  },

  markAllRead: async (userId = DEFAULT_USER_ID) => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, is_read: true as const })),
      unreadCount: 0,
    }));
    try {
      await notificationsApi.markAllRead(userId);
    } catch {}
  },
}));

// 定时的未读轮询 + 合并事件触发刷新
if (typeof window !== 'undefined') {
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      useNotificationStore.getState().fetchUnreadCount();
    }, 15000); // 15 秒轮询
  }
  // 页面可见时启动
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      useNotificationStore.getState().fetchUnreadCount();
      startPoll();
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
  // 初始加载
  useNotificationStore.getState().fetchList();
  startPoll();

  // 监听合并通知事件，触发重新获取
  window.addEventListener('merge-notification', (() => {
    useNotificationStore.getState().fetchUnreadCount();
  }) as EventListener);
}

/* ── Kanban 状态 ── */
interface KanbanState {
  columns: Record<ReviewStatus, KanbanCard[]>;
  moveCard: (cardId: string, toStatus: ReviewStatus) => void;
  setCards: (status: ReviewStatus, cards: KanbanCard[]) => void;
}

export const useKanbanStore = create<KanbanState>((set) => ({
  columns: {
    pending: [
      { id: 'k1', score: { id: 's1', name: '月光变奏曲', composer: '贝多芬', type: 'staff', createdAt: '', updatedAt: '' }, submitter: { id: 'u2', name: '李四', avatar: '', online: true }, submittedAt: '2024-01-16T10:00:00', annotationCount: 5, status: 'pending' },
      { id: 'k2', score: { id: 's2', name: '胡笳十八拍', composer: '蔡文姬', type: 'staff', createdAt: '', updatedAt: '' }, submitter: { id: 'u3', name: '王五', avatar: '', online: false }, submittedAt: '2024-01-15T14:00:00', annotationCount: 3, status: 'pending' },
    ],
    working: [
      { id: 'k3', score: { id: 's3', name: '春江花月夜', composer: '古曲', type: 'jianpu', createdAt: '', updatedAt: '' }, submitter: { id: 'u2', name: '李四', avatar: '', online: true }, submittedAt: '2024-01-15T09:00:00', annotationCount: 12, status: 'working' },
    ],
    approved: [
      { id: 'k4', score: { id: 's4', name: '广陵散', composer: '嵇康', type: 'staff', createdAt: '', updatedAt: '' }, submitter: { id: 'u1', name: '张三', avatar: '', online: true }, submittedAt: '2024-01-14T16:00:00', annotationCount: 3, status: 'approved' },
    ],
    rejected: [
      { id: 'k5', score: { id: 's5', name: '梅花三弄', composer: '古曲', type: 'jianpu', createdAt: '', updatedAt: '' }, submitter: { id: 'u4', name: '赵六', avatar: '', online: false }, submittedAt: '2024-01-13T11:00:00', annotationCount: 8, status: 'rejected' },
    ],
  },
  moveCard: (cardId, toStatus) =>
    set((state) => {
      const newColumns = { ...state.columns };
      let card: KanbanCard | undefined;
      for (const [status, cards] of Object.entries(newColumns)) {
        const idx = cards.findIndex((c) => c.id === cardId);
        if (idx !== -1) {
          card = cards[idx];
          newColumns[status as ReviewStatus] = cards.filter((c) => c.id !== cardId);
          break;
        }
      }
      if (card) {
        card.status = toStatus;
        newColumns[toStatus] = [...newColumns[toStatus], card];
      }
      return { columns: newColumns };
    }),
  setCards: (status, cards) =>
    set((state) => ({ columns: { ...state.columns, [status]: cards } })),
}));

/* ── 版本状态 ── */
interface VersionState {
  versions: Version[];
  setVersions: (versions: Version[]) => void;
  setCurrentVersion: (id: string) => void;
}

/* ── 主题状态 ── */
type Theme = 'dark' | 'light';
interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

/** 获取初始主题：优先读取 localStorage，无则默认 light */
function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  // 默认浅色
  document.documentElement.setAttribute('data-theme', 'light');
  return 'light';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      return { theme: next };
    }),
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    set({ theme });
  },
}));

export const useVersionStore = create<VersionState>((set) => ({
  versions: [
    { id: 'v1', scoreId: 's1', version: 1, label: '初稿', author: { id: 'u1', name: '张三', avatar: '', online: true }, createdAt: '2024-01-10T10:00:00', message: '初始版本', annotationCount: 0, isCurrent: false },
    { id: 'v2', scoreId: 's1', version: 2, label: '修订版', author: { id: 'u2', name: '李四', avatar: '', online: true }, createdAt: '2024-01-12T14:00:00', message: '调整第二乐章速度', annotationCount: 2, isCurrent: false },
    { id: 'v3', scoreId: 's1', version: 3, label: '终稿', author: { id: 'u1', name: '张三', avatar: '', online: true }, createdAt: '2024-01-15T09:00:00', message: '根据审阅意见修改', annotationCount: 3, isCurrent: true },
    { id: 'v4', scoreId: 's1', version: 4, label: 'v4', author: { id: 'u3', name: '王五', avatar: '', online: false }, createdAt: '2024-01-16T11:00:00', message: '校对错音', annotationCount: 1, isCurrent: false },
  ],
  setVersions: (versions) => set({ versions }),
  setCurrentVersion: (id) =>
    set((state) => ({
      versions: state.versions.map((v) => ({ ...v, isCurrent: v.id === id })),
    })),
}));
