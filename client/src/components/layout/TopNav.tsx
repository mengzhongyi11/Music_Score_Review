import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useNotificationStore, useSidebarStore, useThemeStore } from '@/store';
import { useUsersStore } from '@/api/apiStore';
import { getCurrentUser } from '@/App';
import styles from './TopNav.module.css';

const navItems = [
  { path: '/projects', label: '项目看板', icon: '🎼' },
  { path: '/review', label: '审阅工作台', icon: '🎵' },
  { path: '/public', label: '公共乐谱库', icon: '🎶' },
  { path: '/diff', label: '分支管理', icon: '♪' },
  { path: '/activity', label: '活动动态', icon: '♩' },
];

export function TopNav() {
  const { unreadCount, notifications, markRead } = useNotificationStore();
  const { collapsed, toggleCollapsed } = useSidebarStore();
  const { theme, toggleTheme } = useThemeStore();
  const usersAPI = useUsersStore();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // 加载用户
  useEffect(() => {
    if (usersAPI.list.data.length === 0) usersAPI.fetchList();
  }, []);

  // 从 Auth 获取当前用户
  const currentUser = getCurrentUser() || { id: 1, name: '用户', role: 'contributor', title: '' };

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowUserMenu(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifPanel(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <nav className={styles.nav}>
      {/* 左侧 */}
      <div className={styles.left}>
        <button className={styles.menuBtn} onClick={toggleCollapsed} aria-label="切换侧边栏">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <div className={styles.logo} onClick={() => navigate('/projects')} style={{ cursor: 'pointer' }}>
          <span className={styles.logoIcon}>谱</span>
          <span className={styles.logoText}>谱审</span>
        </div>
        <div className={styles.navLinks}>
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`${styles.navLink} ${currentPath.startsWith(item.path) ? styles.active : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* 右侧 */}
      <div className={styles.right}>
        {/* 通知铃铛 */}
        <div className={styles.notifWrapper} ref={notifRef}>
          <button className={styles.iconBtn} onClick={() => { setShowNotifPanel(!showNotifPanel); setShowUserMenu(false); }} aria-label="通知">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1.5a5.5 5.5 0 00-5.5 5.5v3.5L2 12.5v1h14v-1l-1.5-2V7A5.5 5.5 0 009 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M6.5 13.5a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {unreadCount > 0 && <span className={styles.notifDot}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {/* 通知面板 */}
          {showNotifPanel && (
            <div className={styles.notifPanel}>
              <div className={styles.notifPanelHeader}>
                <span className={styles.notifPanelTitle}>通知</span>
                <span className={styles.notifPanelCount}>{notifications.length}</span>
              </div>
              <div className={styles.notifList}>
                {notifications.length === 0 && (
                  <div className={styles.notifEmpty}>暂无通知</div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`${styles.notifItem} ${!n.read ? styles.notifUnread : ''}`}
                    onClick={() => { markRead(n.id); }}
                  >
                    <div className={styles.notifType}>
                      {n.type === 'annotation' ? '🎵' : n.type === 'review' ? '🎶' : '♪'}
                    </div>
                    <div className={styles.notifBody}>
                      <p className={styles.notifMsg}>{n.message}</p>
                      <span className={styles.notifTime}>
                        {new Date(n.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {!n.read && <span className={styles.notifUnreadDot} />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 主题切换 */}
        <button className={styles.iconBtn} onClick={toggleTheme} aria-label="切换主题">
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M3.3 14.7l1.4-1.4M13.3 4.7l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1a7 7 0 000 14A6 6 0 019 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        {/* 用户头像 */}
        <div className={styles.avatarWrapper} ref={menuRef}>
          <div className={styles.avatar} onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifPanel(false); }}>
            <div className={styles.avatarImg}>{currentUser.name[0]}</div>
            <span className={styles.onlineDot} />
          </div>

          {/* 用户菜单 */}
          {showUserMenu && (
            <div className={styles.userMenu}>
              <div className={styles.userMenuHeader}>
                <div className={styles.userMenuAvatar}>{currentUser.name[0]}</div>
                <div>
                  <div className={styles.userMenuName}>{currentUser.name}</div>
                  <div className={styles.userMenuRole}>{currentUser.title || currentUser.role}</div>
                </div>
              </div>

              <div className={styles.userMenuStats}>
                <div className={styles.userStat}>
                  <span className={styles.userStatVal}>{usersAPI.list.data.length}</span>
                  <span className={styles.userStatLbl}>用户</span>
                </div>
                <div className={styles.userStat}>
                  <span className={styles.userStatVal}>{notifications.filter((n) => !n.read).length}</span>
                  <span className={styles.userStatLbl}>未读</span>
                </div>
              </div>

              <div className={styles.userMenuItems}>
                <button className={styles.userMenuItem} onClick={() => { navigate('/projects'); setShowUserMenu(false); }}>
                  🎼 我的工作台
                </button>
                <button className={styles.userMenuItem} onClick={() => { navigate('/public'); setShowUserMenu(false); }}>
                  🎶 公共乐谱库
                </button>
                <button className={styles.userMenuItem} onClick={() => { navigate(`/settings/1`); setShowUserMenu(false); }}>
                  🎛️ 设置
                </button>
                <div className={styles.userMenuDivider} />
                <button className={styles.userMenuItem} onClick={() => {
                  localStorage.removeItem('auth_token');
                  localStorage.removeItem('current_user');
                  navigate('/login');
                }} style={{ color: 'var(--color-danger-text)' }}>
                  🎵 退出登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
