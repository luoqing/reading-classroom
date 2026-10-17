import { LogIn, LogOut, UserRound } from 'lucide-react';
import type { AccountView } from '@shared/api.interface';
import { logout } from '../../api/auth';
import ReadingPage from './index';

interface StudentAppProps {
  account: AccountView | null;
  onLogout?: () => void;
  onLogin?: () => void;
}

export default function StudentApp({ account, onLogout, onLogin }: StudentAppProps) {
  const signOut = async () => { await logout(); onLogout?.(); };
  return <>
    <div className={`student-session${account ? '' : ' guest'}`}>
      <UserRound size={15}/><span>{account?.displayName || '匿名试用'}</span>
      {account
        ? <button onClick={signOut} aria-label="退出登录" title="退出登录"><LogOut size={15}/></button>
        : <button onClick={onLogin} aria-label="登录并保存练习"><LogIn size={14}/><span>登录</span></button>}
    </div>
    <ReadingPage persistent={Boolean(account)} />
  </>;
}
