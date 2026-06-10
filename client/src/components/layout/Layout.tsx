import { TopNav } from './TopNav';
import { Sidebar } from './Sidebar';
import { useSidebarStore } from '@/store';
import styles from './Layout.module.css';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { collapsed } = useSidebarStore();

  return (
    <div className={styles.layout}>
      <TopNav />
      <Sidebar />
      <main className={`${styles.main} ${collapsed ? styles.expanded : ''}`}>
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
