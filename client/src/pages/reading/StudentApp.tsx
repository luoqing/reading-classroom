import { useState } from 'react';
import { KeyRound, LogIn, LogOut, UserRound, X } from 'lucide-react';
import type { AccountView } from '@shared/api.interface';
import { changePassword, logout } from '../../api/auth';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import ReadingPage from './index';
import './student-account.css';

interface StudentAppProps {
  account: AccountView | null;
  onLogout?: () => void;
  onLogin?: () => void;
}

export default function StudentApp({ account, onLogout, onLogin }: StudentAppProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const signOut = async () => { await logout(); onLogout?.(); };
  const savePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage('两次输入的新密码不一致');
      return;
    }
    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setMessage('密码修改成功');
      window.setTimeout(() => window.location.reload(), 500);
    } catch {
      setMessage('密码修改失败，请检查当前密码和新密码长度');
    } finally {
      setSaving(false);
    }
  };
  return <>
    <div className={`student-session${account ? '' : ' guest'}`}>
      <UserRound size={15}/><span>{account?.displayName || '匿名试用'}</span>
      {account
        ? <><button onClick={() => setShowPassword(true)} aria-label="修改密码" title="修改密码"><KeyRound size={15}/></button><button onClick={signOut} aria-label="退出登录" title="退出登录"><LogOut size={15}/></button></>
        : <button onClick={onLogin} aria-label="登录并保存练习"><LogIn size={14}/><span>登录</span></button>}
    </div>
    {account?.mustChangePassword && <button className="student-password-reminder" onClick={() => setShowPassword(true)}><KeyRound size={15} />这是初始密码，建议修改后再继续使用</button>}
    <ReadingPage persistent={Boolean(account)} />
    {showPassword && <div className="student-password-backdrop"><section className="student-password-dialog"><button className="student-password-close" onClick={() => setShowPassword(false)} aria-label="关闭修改密码"><X /></button><span>账号安全</span><h2>修改登录密码</h2><p>密码需要 8–128 位。修改后请使用新密码登录。</p><label>当前密码<Input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label><label>新密码<Input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label><label>再次输入新密码<Input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} /></label>{message && <p className="student-password-message">{message}</p>}<Button onClick={() => void savePassword()} disabled={saving}>{saving ? '正在保存…' : '保存新密码'}</Button></section></div>}
  </>;
}
