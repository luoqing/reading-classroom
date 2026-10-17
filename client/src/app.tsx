import { useEffect, useState } from 'react';
import type { LoginResult } from '@shared/api.interface';
import { getSession } from './api/auth';
import LoginPage from './pages/auth/LoginPage';
import TeacherDashboard from './pages/classroom/TeacherDashboard';
import StudentApp from './pages/reading/StudentApp';

export default function App() {
  const [session, setSession] = useState<LoginResult | null | undefined>(undefined);
  const [showLogin, setShowLogin] = useState(false);
  useEffect(() => { void getSession().then(setSession).catch(() => setSession(null)); }, []);
  if (session === undefined) return <div className="app-loading"><span>叶</span><p>正在打开朗读小屋…</p></div>;
  if (!session && showLogin) return <LoginPage onLogin={result => { setSession(result); setShowLogin(false); }} onCancel={() => setShowLogin(false)} />;
  if (!session) return <StudentApp account={null} onLogin={() => setShowLogin(true)} />;
  const leave = () => { setSession(null); setShowLogin(false); };
  return session.account.role === 'admin'
    ? <TeacherDashboard account={session.account} onLogout={leave} />
    : <StudentApp account={session.account} onLogout={leave} />;
}
