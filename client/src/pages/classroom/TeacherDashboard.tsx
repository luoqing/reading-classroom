import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronRight, CircleHelp, Headphones, KeyRound, Leaf, LogOut, Plus, RefreshCw, Search, UsersRound, X } from 'lucide-react';
import type { AccountView, AdminDashboardResult, AdminStudentSummary, ReadingHistoryItem, StudentCredential } from '@shared/api.interface';
import { createStudents, getDashboard, getStudentAttempts, resetStudentPassword, setStudentStatus } from '../../api/classroom';
import { logout } from '../../api/auth';
import './teacher-dashboard.css';

const stars = (value: number | null) => value === null ? '—' : '★'.repeat(value) + '☆'.repeat(3 - value);
const dateText = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '还未练习';

export default function TeacherDashboard({ account, onLogout }: { account: AccountView; onLogout: () => void }) {
  const [data, setData] = useState<AdminDashboardResult | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'help'|'unpracticed'>('all');
  const [selected, setSelected] = useState<AdminStudentSummary | null>(null);
  const [attempts, setAttempts] = useState<ReadingHistoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [credential, setCredential] = useState<StudentCredential[] | null>(null);
  const [rows, setRows] = useState('student001,王小明,001,一年级1班');
  const [message, setMessage] = useState('');

  const refresh = async () => { try { setData(await getDashboard()); setMessage(''); } catch { setMessage('后台数据暂时无法加载'); } };
  useEffect(() => { void refresh(); }, []);
  const visible = useMemo(() => (data?.students || []).filter(student => {
    const text = `${student.displayName} ${student.username} ${student.studentNo || ''} ${student.className || ''}`.toLowerCase();
    const matches = text.includes(query.toLowerCase());
    const needsHelp = [student.accuracyStars,student.naturalStars,student.deliveryStars].some(value => value !== null && value < 2) || (student.issueCount || 0) > 0;
    return matches && (filter === 'all' || filter === 'help' && needsHelp || filter === 'unpracticed' && !student.lastPracticedAt);
  }), [data, query, filter]);

  const openStudent = async (student: AdminStudentSummary) => {
    setSelected(student); setAttempts([]);
    try { setAttempts(await getStudentAttempts(student.id)); } catch { setMessage('练习历史暂时无法加载'); }
  };
  const submitStudents = async () => {
    const students = rows.split(/\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [username, displayName, studentNo, className] = line.split(/[,，\t]/).map(value => value.trim());
      return { username, displayName, studentNo, className };
    });
    try { setCredential(await createStudents(students)); setShowCreate(false); await refresh(); } catch (error: any) { setMessage(error?.response?.data?.error?.message || '创建账号失败'); }
  };
  const signOut = async () => { await logout(); onLogout(); };

  return <div className="teacher-app">
    <aside className="teacher-nav">
      <div className="teacher-brand"><span><Leaf size={18}/></span><div><strong>朗读小屋</strong><small>TEACHER DESK</small></div></div>
      <nav><button className="active"><UsersRound size={18}/>学生朗读</button><button><BookOpen size={18}/>课文管理</button></nav>
      <div className="teacher-account"><span>{account.displayName.slice(0,1)}</span><div><strong>{account.displayName}</strong><small>admin 管理员</small></div><button onClick={signOut} title="退出"><LogOut size={17}/></button></div>
    </aside>
    <main className="teacher-main">
      <header className="teacher-header"><div><span className="teacher-kicker">课堂朗读观察台</span><h1>今天，谁需要帮助？</h1><p>先看三个维度的薄弱点，再回听孩子的原声。</p></div><button className="teacher-primary" onClick={() => setShowCreate(true)}><Plus size={18}/>批量建号</button></header>
      <section className="teacher-metrics">
        <article><span><UsersRound/></span><div><small>学生账号</small><strong>{data?.totals.studentCount ?? '—'}</strong></div></article>
        <article><span><Headphones/></span><div><small>已开口练习</small><strong>{data?.totals.practicedCount ?? '—'}</strong></div></article>
        <article className="attention"><span><CircleHelp/></span><div><small>建议优先关注</small><strong>{data?.totals.needsHelpCount ?? '—'}</strong></div></article>
      </section>
      <section className="teacher-board">
        <div className="teacher-toolbar"><div className="teacher-search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜姓名、账号、学号或班级" /></div><div className="teacher-filters">{([['all','全部'],['help','需帮助'],['unpracticed','未练习']] as const).map(([value,label])=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div><button className="icon-button" onClick={refresh} title="刷新"><RefreshCw size={17}/></button></div>
        {message && <p className="teacher-message">{message}</p>}
        <div className="teacher-table-head"><span>学生</span><span>最新课文</span><span>读准确</span><span>读自然</span><span>读到位</span><span>问题数</span><span></span></div>
        <div className="student-list">{visible.map(student => <button className="student-row" key={student.id} onClick={() => void openStudent(student)}>
          <span className="student-name"><i>{student.displayName.slice(0,1)}</i><b>{student.displayName}<small>{student.studentNo || student.username} · {student.className || '未分班'}</small></b></span>
          <span><b>{student.lessonTitle || '还未开始'}</b><small>{dateText(student.lastPracticedAt)} · {student.attemptCount} 次</small></span>
          <span className="dimension-stars">{stars(student.accuracyStars)}</span><span className="dimension-stars">{stars(student.naturalStars)}</span><span className="dimension-stars">{stars(student.deliveryStars)}</span>
          <span className={(student.issueCount||0)>0?'issue-count active':'issue-count'}>{student.issueCount ?? '—'}</span><ChevronRight size={18}/>
        </button>)}</div>
        {data && !visible.length && <div className="teacher-empty"><Leaf size={34}/><strong>暂无匹配的学生</strong><span>可以换个条件，或先批量建号。</span></div>}
      </section>
    </main>
    {selected && <div className="student-drawer-backdrop" onMouseDown={event => { if(event.target===event.currentTarget)setSelected(null); }}><aside className="student-drawer">
      <button className="drawer-close" onClick={()=>setSelected(null)}><X/></button><span className="teacher-kicker">学生档案</span><h2>{selected.displayName}</h2><p>{selected.username} · {selected.className || '未分班'}</p>
      <div className="drawer-actions"><button onClick={async()=>{const result=await resetStudentPassword(selected.id);setCredential([result]);}}><KeyRound size={16}/>重置密码</button><button onClick={async()=>{await setStudentStatus(selected.id,selected.status==='active'?'disabled':'active');setSelected(null);await refresh();}}>{selected.status==='active'?'停用账号':'恢复账号'}</button></div>
      <h3>练习记录</h3>{attempts.map(item=><article className="attempt-card" key={item.attemptId}><div><strong>{item.lessonTitle}</strong><span>{dateText(item.recordedAt)}</span></div><p>读准确 {stars(item.accuracyStars)} · 读自然 {stars(item.naturalStars)} · 读到位 {stars(item.deliveryStars)}</p>{item.teacherComment&&<blockquote>{item.teacherComment}</blockquote>}{item.audioUrl&&<audio controls preload="none" src={item.audioUrl}/>}</article>)}
      {!attempts.length&&<p className="drawer-empty">还没有朗读记录。</p>}
    </aside></div>}
    {showCreate && <div className="student-drawer-backdrop"><section className="create-dialog"><button className="drawer-close" onClick={()=>setShowCreate(false)}><X/></button><span className="teacher-kicker">批量建号</span><h2>粘贴学生名单</h2><p>每行一个学生：账号，姓名，学号，班级。系统会生成随机初始密码。</p><textarea rows={9} value={rows} onChange={event=>setRows(event.target.value)}/><button className="teacher-primary" onClick={()=>void submitStudents()}>创建账号</button></section></div>}
    {credential && <div className="student-drawer-backdrop"><section className="create-dialog credentials"><button className="drawer-close" onClick={()=>setCredential(null)}><X/></button><span className="teacher-kicker">仅显示这一次</span><h2>账号已准备好</h2><p>请现在复制并安全发给学生。系统不保存明文密码。</p>{credential.map(item=><div className="credential-row" key={item.account.id}><b>{item.account.displayName}</b><code>{item.account.username}</code><code>{item.initialPassword}</code></div>)}</section></div>}
  </div>;
}
