import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { ReviewWorkbench } from '@/pages/ReviewWorkbench';
import { ProjectKanban } from '@/pages/ProjectKanban';
import { DiffPage } from '@/pages/DiffPage';
import { ActivityFeed } from '@/pages/ActivityFeed';
import { ScoreSettings } from '@/pages/ScoreSettings';
import { FullScoreView } from '@/pages/FullScoreView';
import { PublicScores } from '@/pages/PublicScores';
import { LoginPage } from '@/pages/LoginPage';

/* 获取当前登录用户 */
export function getCurrentUser(): { id: number; name: string; role: string; title: string | null } | null {
  try {
    const raw = localStorage.getItem('current_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token');
}

/* 受保护的路由 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

/* 带 Layout 的受保护路由 */
function ProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录页（无 Layout） */}
        <Route path="/login" element={<LoginPage />} />

        {/* 受保护页面（带 Layout） */}
        <Route path="/projects" element={<ProtectedLayout><ProjectKanban /></ProtectedLayout>} />
        <Route path="/review" element={<ProtectedLayout><ReviewWorkbench /></ProtectedLayout>} />
        <Route path="/diff" element={<ProtectedLayout><DiffPage /></ProtectedLayout>} />
        <Route path="/activity" element={<ProtectedLayout><ActivityFeed /></ProtectedLayout>} />
        <Route path="/settings/:scoreId" element={<ProtectedLayout><ScoreSettings /></ProtectedLayout>} />
        <Route path="/full-score/:scoreId" element={<ProtectedLayout><FullScoreView /></ProtectedLayout>} />
        <Route path="/public" element={<ProtectedLayout><PublicScores /></ProtectedLayout>} />

        {/* 默认 */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
