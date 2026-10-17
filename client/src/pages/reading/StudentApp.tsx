import { LogOut, UserRound } from 'lucide-react';
import type { AccountView } from '@shared/api.interface';
import { logout } from '../../api/auth';
import ReadingPage from './index';

export default function StudentApp({ account, onLogout }: { account: AccountView; onLogout: () => void }) {
  const signOut = async () => { await logout(); onLogout(); };
  return <>
    <div className="student-session">
      <UserRound size={15}/><span>{account.displayName}</span>
      <button onClick={signOut} aria-label="退出登录" title="退出登录"><LogOut size={15}/></button>
    </div>
    <ReadingPage />
  </>;
}
