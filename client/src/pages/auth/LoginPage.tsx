import { useState } from 'react';
import { ArrowLeft, BookOpenText, KeyRound, Leaf, LogIn } from 'lucide-react';
import { isAxiosError } from 'axios';
import type { LoginResult } from '@shared/api.interface';
import { login } from '../../api/auth';
import './login.css';

export default function LoginPage({ onLogin, onCancel }: { onLogin: (result: LoginResult) => void; onCancel: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      onLogin(await login({ username, password }));
    } catch (error) {
      setMessage(isAxiosError(error) ? error.response?.data?.error?.message || '账号或密码不正确' : '暂时无法登录，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return <main className="login-page">
    <div className="login-leaf login-leaf-one">🍂</div>
    <div className="login-leaf login-leaf-two">🍁</div>
    <section className="login-story" aria-label="产品介绍">
      <div className="login-brand"><span><Leaf size={21} /></span>朗读小屋</div>
      <div className="login-kicker">READ · LISTEN · GROW</div>
      <h1>让每一次朗读<br />都有迹可循</h1>
      <p>孩子开口读，小秋按“读流利、读准确”给出鼓励和练习建议；老师在一个页面里看到谁需要帮助。</p>
      <div className="login-book">
        <BookOpenText size={25} />
        <div><strong>一年级语文 · 秋天</strong><span>录音、评测、回放和进步记录</span></div>
      </div>
    </section>
    <section className="login-panel">
      <form onSubmit={submit}>
        <button className="login-back" type="button" onClick={onCancel}><ArrowLeft size={16} />返回匿名试用</button>
        <span className="login-mark"><KeyRound size={24} /></span>
        <div className="login-eyebrow">账号登录</div>
        <h2>欢迎回来</h2>
        <p className="login-help">老师使用固定 admin 账号；学生使用老师发放的账号和初始密码。</p>
        <label>账号<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} placeholder="输入账号" required /></label>
        <label>密码<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="输入密码" required /></label>
        {message && <p className="login-error" role="alert">{message}</p>}
        <button className="login-submit" disabled={busy} type="submit"><LogIn size={18} />{busy ? '正在登录…' : '进入朗读小屋'}</button>
        <p className="login-footnote">这里不提供自助注册，学生账号由老师统一管理。</p>
      </form>
    </section>
  </main>;
}
