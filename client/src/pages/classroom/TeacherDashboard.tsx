import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  FileText,
  Headphones,
  KeyRound,
  Leaf,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react';
import type {
  AccountView,
  AdminDashboardRange,
  AdminDashboardResult,
  AdminDimensionSummary,
  AdminLessonSummary,
  AdminStudentSummary,
  ReadingHistoryItem,
  StudentCredential,
} from '@shared/api.interface';
import {
  createStudents,
  getDashboard,
  getStudentAttempts,
  resetStudentPassword,
  setStudentStatus,
} from '../../api/classroom';
import { logout } from '../../api/auth';
import LessonEditor from './LessonEditor';
import { Input } from '../../components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import './teacher-dashboard.css';
import './lesson-editor.css';

type DashboardView = 'overview' | 'students' | 'lessons' | 'accounts';
type StudentFilter = 'all' | 'help' | 'unpracticed';

const DASHBOARD_RANGES: Array<{ value: AdminDashboardRange; label: string }> = [
  { value: 'week', label: '本周' },
  { value: '7d', label: '最近 7 天' },
  { value: '30d', label: '最近 30 天' },
  { value: 'all', label: '全部时间' },
];

const stars = (value: number | null) => value === null
  ? '—'
  : '★'.repeat(value) + '☆'.repeat(3 - value);

const dateTimeText = (value: string | null) => value
  ? new Date(value).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  : '尚未录音';

const fullDateText = (value: Date) => value.toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});

const needsHelp = (student: AdminStudentSummary) => (
  [student.accuracyStars, student.naturalStars]
    .some((value: number | null) => value !== null && value < 2)
  || (student.issueCount || 0) > 0
);

const weakestDimension = (student: AdminStudentSummary) => {
  const dimensions: Array<{ label: string; value: number | null }> = [
    { label: '读流利', value: student.naturalStars },
    { label: '读准确', value: student.accuracyStars },
  ];
  const rated = dimensions.filter(
    (item): item is { label: string; value: number } => item.value !== null,
  );
  if (!rated.length) return '等待首次评测';
  rated.sort((left, right) => left.value - right.value);
  return rated[0].value < 2 ? `${rated[0].label}需练习` : '有具体朗读问题';
};

const lessonCorrectnessText = (lesson: AdminLessonSummary) => {
  const rubric = lesson.rubric;
  const accuracy = rubric.accuracyTargets?.length
    ? rubric.accuracyTargets.map(target => `${target.char}（${target.reading}）`).join('、')
    : '按正文检查字音、漏读、添读和替换';
  const pronunciationTargets = rubric.delivery?.pronunciationTargets?.length
    ? rubric.delivery.pronunciationTargets.map(target => `${target.phrase}中的“${target.char}”读${target.reading}`)
    : (rubric.delivery?.yiTargets || []).map(target => `${target.label}读${target.reading}`);
  const contextualPronunciation = pronunciationTargets.length
    ? pronunciationTargets.join('；')
    : rubric.delivery?.description || '多音字与变调按本课要求读准确';
  const neutralTargets = rubric.natural?.neutralTargets?.length
    ? rubric.natural.neutralTargets
    : lesson.slug === 'autumn' ? ['凉了', '黄了', '来了'] : [];
  const neutralTone = neutralTargets.length
    ? `${neutralTargets.join('、')}中的“了”读得轻、短`
    : rubric.natural?.description || '轻声按本课要求读准确';
  return `重点字：${accuracy}。多音字与变调：${contextualPronunciation}。轻声字词：${neutralTone}。`;
};

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
};

function InlineAudio({ src, compact = false }: { src: string | null; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => () => audioRef.current?.pause(), []);
  if (!src) return <span className="inline-audio-empty">暂无</span>;

  const toggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try { await audio.play(); } catch { setPlaying(false); }
    } else {
      audio.pause();
    }
  };

  return <span className={`inline-audio${compact ? ' compact' : ''}`} onClick={event => event.stopPropagation()}>
    <audio
      ref={audioRef}
      src={src}
      preload="none"
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)}
    />
    <button
      type="button"
      onClick={toggle}
      aria-label={playing ? '暂停学生最新录音' : '播放学生最新录音'}
    >
      {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
      {!compact && <span>{playing ? '暂停' : '播放'}</span>}
    </button>
  </span>;
}

function DimensionBar({
  label,
  summary,
}: {
  label: string;
  summary: AdminDimensionSummary;
}) {
  const width = summary.averageStars === null ? 0 : summary.averageStars / 3 * 100;
  return <div className="dimension-bar">
    <div><span>{label}</span><strong>{summary.averageStars === null ? '—' : summary.averageStars.toFixed(1)} / 3</strong></div>
    <span className="dimension-track"><i style={{ width: `${width}%` }} /></span>
    <small>{summary.ratedCount ? `${summary.ratedCount} 人已有评测` : '暂无评测数据'}</small>
  </div>;
}

function StudentScore({ label, value }: { label: string; value: number | null }) {
  return <div className="student-score">
    <span>{label}</span>
    <i><span style={{ width: `${(value || 0) / 3 * 100}%` }} /></i>
    <strong>{value === null ? '—' : `${value}★`}</strong>
  </div>;
}

function StudentIdentity({ student }: { student: AdminStudentSummary }) {
  return <span className="student-name">
    <i>{student.displayName.slice(0, 1)}</i>
    <b>{student.displayName}<small>{student.studentNo || student.username} · {student.className || '未分班'}</small></b>
  </span>;
}

export default function TeacherDashboard({
  account,
  onLogout,
}: {
  account: AccountView;
  onLogout: () => void;
}) {
  const [view, setView] = useState<DashboardView>('overview');
  const [data, setData] = useState<AdminDashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all');
  const [className, setClassName] = useState('all');
  const [lessonId, setLessonId] = useState('all');
  const [range, setRange] = useState<AdminDashboardRange>('week');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<ReadingHistoryItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [credential, setCredential] = useState<StudentCredential[] | null>(null);
  const [rows, setRows] = useState('student001,王小明,001,一年级1班,');
  const [defaultPassword, setDefaultPassword] = useState('student123654');
  const [resetTarget, setResetTarget] = useState<AdminStudentSummary | null>(null);
  const [resetValue, setResetValue] = useState('');
  const [message, setMessage] = useState('');
  const [selectedLesson, setSelectedLesson] = useState<AdminLessonSummary | null>(null);
  const [editingLesson, setEditingLesson] = useState<AdminLessonSummary | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getDashboard({
        className: className === 'all' ? undefined : className,
        lessonId: lessonId === 'all' ? undefined : lessonId,
        range,
      });
      setData(result);
      setMessage('');
    } catch {
      setMessage('后台数据暂时无法加载');
    } finally {
      setLoading(false);
    }
  }, [className, lessonId, range]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visible = useMemo(() => (data?.students || []).filter((student: AdminStudentSummary) => {
    const text = `${student.displayName} ${student.username} ${student.studentNo || ''} ${student.className || ''}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesStatus = studentFilter === 'all'
      || studentFilter === 'help' && needsHelp(student)
      || studentFilter === 'unpracticed' && !student.latestRecordedAt;
    return matchesQuery && matchesStatus;
  }), [data, query, studentFilter]);

  const overviewStudents = useMemo(
    () => visible.filter((student: AdminStudentSummary) => student.status === 'active'),
    [visible],
  );
  const focusStudents = useMemo(
    () => overviewStudents.filter(needsHelp).slice(0, 5),
    [overviewStudents],
  );
  const selected = data?.students.find((student: AdminStudentSummary) => student.id === selectedId)
    || focusStudents[0]
    || overviewStudents.find((student: AdminStudentSummary) => student.latestRecordedAt)
    || overviewStudents[0]
    || null;

  useEffect(() => {
    if (!selectedId) {
      setAttempts([]);
      return;
    }
    setAttempts([]);
    void getStudentAttempts(selectedId)
      .then(setAttempts)
      .catch(() => setMessage('练习历史暂时无法加载'));
  }, [selectedId]);

  const submitStudents = async () => {
    const students = rows.split(/\n/u).map(line => line.trim()).filter(Boolean).map(line => {
      const [username, displayName, studentNo, itemClassName, rowPassword] = line
        .split(/[,，\t]/u)
        .map(value => value.trim());
      return {
        username,
        displayName,
        studentNo,
        className: itemClassName,
        initialPassword: rowPassword || defaultPassword || undefined,
      };
    });
    try {
      setCredential(await createStudents(students));
      setShowCreate(false);
      await refresh();
    } catch {
      setMessage('创建账号失败，请检查账号格式或是否重复');
    }
  };

  const changeStudentStatus = async (student: AdminStudentSummary) => {
    try {
      await setStudentStatus(student.id, student.status === 'active' ? 'disabled' : 'active');
      await refresh();
    } catch {
      setMessage('账号状态修改失败');
    }
  };

  const resetPassword = async (student: AdminStudentSummary, newPassword?: string) => {
    try {
      setCredential([await resetStudentPassword(student.id, newPassword)]);
      setResetTarget(null);
      setResetValue('');
      await refresh();
    } catch {
      setMessage('密码重置失败');
    }
  };

  const exportReport = () => {
    const header = ['学生', '账号', '学号', '班级', '最新课文', '读流利', '读准确', '问题数', '最近录音时间'];
    const body = overviewStudents.map((student: AdminStudentSummary) => [
      student.displayName,
      student.username,
      student.studentNo || '',
      student.className || '',
      student.lessonTitle || '',
      student.naturalStars ?? '',
      student.accuracyStars ?? '',
      student.issueCount ?? '',
      student.latestRecordedAt ? new Date(student.latestRecordedAt).toLocaleString('zh-CN') : '',
    ]);
    const csv = [header, ...body].map(row => row.map(value => (
      `"${String(value).replace(/"/gu, '""')}"`
    )).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `朗读小屋-${data?.period.label || '练习'}记录.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('记录已导出');
  };

  const signOut = async () => { await logout(); onLogout(); };

  const navItems: Array<{ key: DashboardView; label: string; icon: typeof BarChart3 }> = [
    { key: 'overview', label: '学情总览', icon: BarChart3 },
    { key: 'students', label: '学生档案', icon: UsersRound },
    { key: 'lessons', label: '课文管理', icon: BookOpen },
    { key: 'accounts', label: '账号管理', icon: KeyRound },
  ];

  const titleByView: Record<DashboardView, string> = {
    overview: '学情总览',
    students: '学生档案',
    lessons: '课文管理',
    accounts: '账号管理',
  };

  return <div className="teacher-app">
    <aside className="teacher-nav">
      <div className="teacher-brand"><span>叶</span><div><strong>朗读小屋</strong><small>TEACHER DESK</small></div></div>
      <div className="teacher-workspace"><strong>教学版 · 老师工作台</strong><span>登录后展示真实学生数据</span></div>
      <nav aria-label="老师工作台导航">{navItems.map(item => {
        const Icon = item.icon;
        return <button
          key={item.key}
          className={view === item.key ? 'active' : ''}
          onClick={() => setView(item.key)}
        ><Icon size={18} />{item.label}</button>;
      })}</nav>
      <p className="teacher-nav-note">先看谁需要帮助，再点进学生详情听原声，不用逐条翻记录。</p>
      <div className="teacher-account">
        <span>师</span>
        <div><strong>老师</strong><small>管理员账号</small></div>
        <button onClick={signOut} title="退出" aria-label="退出老师账号"><LogOut size={17} /></button>
      </div>
    </aside>

    <main className="teacher-main">
      <header className="teacher-topbar">
        <div><span className="teacher-kicker">朗读教学概览</span><h1>{greeting()}，老师</h1></div>
        <div className="teacher-top-actions"><span><CalendarDays size={15} />{fullDateText(new Date())}</span><button onClick={() => setShowCreate(true)}><Plus size={17} />添加学生</button><button className="teacher-logout-button" onClick={signOut}><LogOut size={16} />退出</button></div>
      </header>

      {message && <p className="teacher-message" role="status">{message}</p>}

      {view === 'overview' && data && <>
        <section className="teacher-hero">
          <div><span className="teacher-kicker">{data.period.label}朗读观察</span><h2>先看需要帮助的孩子</h2><p>完成率、两项表现和原声回放放在同一屏，优先处理最需要指导的学生。</p></div>
          <div className="completion-card">
            <span className="completion-ring" style={{ background: `conic-gradient(#cc7a2b ${data.totals.completionRate * 3.6}deg, #eee6d4 0deg)` }}><i>{data.totals.completionRate}%</i></span>
            <div><strong>{data.period.label}练习完成率</strong><p>{data.totals.completedStudentCount} / {data.totals.studentCount} 人已提交</p><small>{data.totals.needsHelpCount} 人建议优先关注</small></div>
          </div>
        </section>

        <section className="teacher-filterbar">
          <label className="teacher-search"><Search size={17} /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索学生姓名、账号或学号" /></label>
          <Select value={className} onValueChange={setClassName}><SelectTrigger className="teacher-select"><SelectValue placeholder="全部班级" /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem>{data.options.classNames.map(value => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select>
          <Select value={lessonId} onValueChange={setLessonId}><SelectTrigger className="teacher-select"><SelectValue placeholder="全部课文" /></SelectTrigger><SelectContent><SelectItem value="all">全部课文</SelectItem>{data.options.lessons.map(item => <SelectItem value={item.id} key={item.id}>{item.title}</SelectItem>)}</SelectContent></Select>
          <Select value={range} onValueChange={value => setRange(value as AdminDashboardRange)}><SelectTrigger className="teacher-select"><SelectValue /></SelectTrigger><SelectContent>{DASHBOARD_RANGES.map(item => <SelectItem value={item.value} key={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <button className="icon-button" onClick={() => void refresh()} title="刷新" aria-label="刷新学情数据"><RefreshCw size={17} /></button>
        </section>

        <section className="teacher-metrics" data-ai-section-type="card-stat">
          <article><span><UsersRound /></span><div><small>在册学生</small><strong>{data.totals.studentCount}<em>人</em></strong></div></article>
          <article><span><ShieldCheck /></span><div><small>{data.period.label}已练</small><strong>{data.totals.completedStudentCount}<em>人</em></strong></div></article>
          <article><span><Headphones /></span><div><small>平均练习次数</small><strong>{data.totals.averageAttempts}<em>次 / 人</em></strong></div></article>
          <article className="attention"><span><CircleHelp /></span><div><small>建议重点关注</small><strong>{data.totals.needsHelpCount}<em>人</em></strong></div></article>
        </section>

        <div className="teacher-overview-grid">
          <section className="teacher-board">
            <div className="board-heading"><div><h2>学生朗读情况</h2><p>按当前筛选结果展示每位学生最近一次评测</p></div><button onClick={exportReport}><Download size={15} />导出当前记录</button></div>
            <div className="dimension-summary">
              <DimensionBar label="读流利" summary={data.dimensions.natural} />
              <DimensionBar label="读准确" summary={data.dimensions.accuracy} />
            </div>
            <div className="student-filter-tabs">{([['all', '全部'], ['help', '需帮助'], ['unpracticed', '未练习']] as const).map(([value, label]) => <button key={value} className={studentFilter === value ? 'active' : ''} onClick={() => setStudentFilter(value)}>{label}</button>)}</div>
            <div className="teacher-table-head"><span>学生</span><span>最新课文</span><span>读流利</span><span>读准确</span><span>最近录音</span><span>原声</span></div>
            <div className="student-list">{overviewStudents.map(student => <div className={`student-row${selected?.id === student.id ? ' selected' : ''}`} key={student.id}>
              <button className="student-row-open" type="button" aria-label={`查看${student.displayName}的练习详情`} onClick={() => setSelectedId(student.id)} />
              <StudentIdentity student={student} />
              <span className="lesson-summary"><b>{student.lessonTitle || '还未开始'}</b><small>{student.periodAttemptCount ? `${data.period.label} ${student.periodAttemptCount} 次` : '当前范围内未练习'}</small></span>
              <span className="dimension-stars">{stars(student.naturalStars)}</span>
              <span className="dimension-stars">{stars(student.accuracyStars)}</span>
              <span className="recorded-time"><Clock3 size={13} />{dateTimeText(student.latestRecordedAt)}</span>
              <InlineAudio src={student.audioUrl} compact />
            </div>)}</div>
            {!overviewStudents.length && <div className="teacher-empty"><Leaf size={34} /><strong>暂无匹配的学生</strong><span>可以更换筛选条件查看。</span></div>}
          </section>

          <aside className="teacher-insights">
            <section className="student-spotlight">
              {selected ? <>
                <div className="spotlight-head"><StudentIdentity student={selected} />{needsHelp(selected) && <span>建议关注</span>}</div>
                <div className="spotlight-meta"><strong>{selected.lessonTitle || '尚未练习课文'}</strong><span>{dateTimeText(selected.latestRecordedAt)} · {data.period.label} {selected.periodAttemptCount} 次</span></div>
                <div className="spotlight-scores">
                  <StudentScore label="读流利" value={selected.naturalStars} />
                  <StudentScore label="读准确" value={selected.accuracyStars} />
                </div>
                <blockquote><strong>这次最值得再练</strong>{selected.teacherComment || (selected.latestRecordedAt ? '这次还没有生成老师评语。' : '完成一次朗读后，这里会显示两项评语和练习建议。')}</blockquote>
                <div className="spotlight-actions"><InlineAudio src={selected.audioUrl} /><button onClick={() => { setSelectedId(selected.id); setView('students'); }}>查看完整档案</button></div>
              </> : <div className="insight-empty"><UsersRound /><strong>暂无学生</strong><span>添加学生后即可查看学情。</span></div>}
            </section>
            <section className="focus-list"><div className="focus-title"><div><h3>{data.period.label}需关注</h3><p>优先查看薄弱维度和具体问题</p></div><button onClick={() => setStudentFilter('help')}>查看全部</button></div>{focusStudents.length ? focusStudents.map(student => <button key={student.id} onClick={() => setSelectedId(student.id)}><i>{student.displayName.slice(0, 1)}</i><span><strong>{student.displayName}</strong><small>{student.lessonTitle || '尚未练习'}</small></span><em>{weakestDimension(student)}</em></button>) : <div className="focus-clear"><Sparkles size={19} />当前筛选下暂无重点关注学生</div>}</section>
          </aside>
        </div>
      </>}

      {view === 'students' && data && <section className="teacher-section-page">
        <div className="section-page-heading"><div><span className="teacher-kicker">学生学习档案</span><h2>{titleByView[view]}</h2><p>集中查看账号、累计练习、最近录音和两项表现。</p></div><button className="teacher-primary" onClick={() => setShowCreate(true)}><Plus size={17} />添加学生</button></div>
        <div className="teacher-filterbar compact"><label className="teacher-search"><Search size={17} /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索学生" /></label><Select value={className} onValueChange={setClassName}><SelectTrigger className="teacher-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">全部班级</SelectItem>{data.options.classNames.map(value => <SelectItem value={value} key={value}>{value}</SelectItem>)}</SelectContent></Select></div>
        <div className="archive-grid">{visible.map(student => <article key={student.id} className="archive-card"><div className="archive-card-head"><StudentIdentity student={student} /><span className={student.status}>{student.status === 'active' ? '正常' : '已停用'}</span></div><div className="archive-facts"><span><small>累计练习</small><strong>{student.attemptCount} 次</strong></span><span><small>最新课文</small><strong>{student.lessonTitle || '暂无'}</strong></span><span><small>最近录音</small><strong>{dateTimeText(student.latestRecordedAt)}</strong></span></div><div className="archive-stars"><span>流利 {stars(student.naturalStars)}</span><span>准确 {stars(student.accuracyStars)}</span></div><button onClick={() => setSelectedId(student.id)}>打开学生档案<ChevronRight size={16} /></button></article>)}</div>
      </section>}

      {view === 'lessons' && data && <section className="teacher-section-page">
        <div className="section-page-heading"><div><span className="teacher-kicker">课程素材与练习数据</span><h2>{titleByView[view]}</h2><p>拍照识别课文，校对正文与拼音，设置教学重点并逐张生成插画。</p></div><button className="teacher-primary" onClick={() => setEditingLesson(null)}><Sparkles size={17} />拍照录入课文</button></div>
        <div className="lesson-admin-grid">{data.lessons.map(item => <article key={item.id} className="lesson-admin-card"><div className="lesson-admin-top"><span><BookOpen /></span><em>{item.status === 'published' ? '已发布' : '草稿'}</em></div><h3>{item.title}</h3><p>{item.gradeLabel || '小学语文'} · 第 {item.revision} 版</p><dl><div><dt>插画/正文页</dt><dd>{item.pageCount}</dd></div><div><dt>累计录音</dt><dd>{item.attemptCount}</dd></div><div><dt>练习学生</dt><dd>{item.completedStudentCount}</dd></div></dl><small>最近录音：{dateTimeText(item.latestRecordedAt)}</small><div className="lesson-card-actions"><button onClick={() => setSelectedLesson(item)}>查看课文数据<ChevronRight size={16} /></button><button onClick={() => setEditingLesson(item)}>编辑课文</button></div></article>)}</div>
      </section>}

      {view === 'accounts' && data && <section className="teacher-section-page">
        <div className="section-page-heading"><div><span className="teacher-kicker">学生登录与权限</span><h2>{titleByView[view]}</h2><p>创建学生账号、重置初始密码并管理账号状态。</p></div><button className="teacher-primary" onClick={() => setShowCreate(true)}><Plus size={17} />批量建号</button></div>
        <div className="account-board"><div className="account-table-head"><span>学生</span><span>登录账号</span><span>最近登录</span><span>状态</span><span>操作</span></div>{visible.map(student => <div className="account-row" key={student.id}><StudentIdentity student={student} /><code>{student.username}</code><span>{dateTimeText(student.lastLoginAt)}</span><span className={`account-status ${student.status}`}>{student.status === 'active' ? (student.mustChangePassword ? '待改初始密码' : '正常') : '已停用'}</span><div><button onClick={() => setResetTarget(student)}><KeyRound size={14} />重置密码</button><button onClick={() => void changeStudentStatus(student)}>{student.status === 'active' ? '停用' : '恢复'}</button></div></div>)}</div>
      </section>}

      {loading && <div className="teacher-loading"><RefreshCw /><span>正在刷新真实学情数据…</span></div>}
    </main>

    {view === 'students' && selectedId && selected && <div className="student-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="student-drawer">
      <button className="drawer-close" onClick={() => setSelectedId(null)} aria-label="关闭学生档案"><X /></button><span className="teacher-kicker">学生档案</span><h2>{selected.displayName}</h2><p>{selected.username} · {selected.className || '未分班'} · 最近录音 {dateTimeText(selected.latestRecordedAt)}</p>
      <div className="drawer-actions"><button onClick={() => setResetTarget(selected)}><KeyRound size={16} />重置密码</button><button onClick={() => void changeStudentStatus(selected)}>{selected.status === 'active' ? '停用账号' : '恢复账号'}</button></div>
      <h3>练习记录</h3>{attempts.map(item => <article className="attempt-card" key={item.attemptId}><div><strong>{item.lessonTitle}</strong><span>{dateTimeText(item.recordedAt)}</span></div><p>读流利 {stars(item.naturalStars)} · 读准确 {stars(item.accuracyStars)}</p>{item.teacherComment && <blockquote>{item.teacherComment}</blockquote>}{item.audioUrl && <audio controls preload="none" src={item.audioUrl} />}</article>)}
      {!attempts.length && <p className="drawer-empty">还没有朗读记录。</p>}
    </aside></div>}

    {selectedLesson && <div className="student-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedLesson(null); }}><aside className="student-drawer lesson-drawer"><button className="drawer-close" onClick={() => setSelectedLesson(null)} aria-label="关闭课文数据"><X /></button><span className="teacher-kicker">课文数据</span><h2>{selectedLesson.title}</h2><p>{selectedLesson.gradeLabel || '小学语文'} · 第 {selectedLesson.revision} 版 · {selectedLesson.status === 'published' ? '已发布' : selectedLesson.status}</p><div className="lesson-detail-stats"><article><FileText /><small>正文与插画页</small><strong>{selectedLesson.pageCount}</strong></article><article><Headphones /><small>累计录音</small><strong>{selectedLesson.attemptCount}</strong></article><article><UsersRound /><small>练习学生</small><strong>{selectedLesson.completedStudentCount}</strong></article></div><p className="lesson-last-record">最近录音：{dateTimeText(selectedLesson.latestRecordedAt)}</p>
      <section className="lesson-content-section"><h3>课文正文</h3><div className="lesson-copy-block">{selectedLesson.coverUrl && <img src={selectedLesson.coverUrl} alt={`${selectedLesson.title}封面`} />}<p className="lesson-full-text">{selectedLesson.fullText}</p></div>{selectedLesson.fullDemoUrl && <div className="lesson-demo-audio"><span>完整示范朗读</span><audio controls preload="none" src={selectedLesson.fullDemoUrl} /></div>}</section>
      <section className="lesson-content-section"><h3>逐页课文与插画</h3><div className="lesson-page-list">{selectedLesson.pages.map(page => <article className="lesson-material-page" key={page.id}>{page.illustrationUrl ? <img src={page.illustrationUrl} alt={`${selectedLesson.title}${page.pageType === 'cover' ? '封面' : `第 ${page.pageNo} 页`}插画`} /> : <div className="lesson-image-empty">暂无插画</div>}<div><small>{page.pageType === 'cover' ? '封面' : `第 ${page.pageNo} 页`}</small>{page.pinyin.length > 0 && <p className="lesson-page-pinyin">{page.pinyin.map((token, index) => <span key={`${page.id}-${index}`}>{token.pinyin}</span>)}</p>}<p>{page.text || '本页没有正文'}</p>{page.demoAudioUrl && <audio controls preload="none" src={page.demoAudioUrl} />}</div></article>)}</div></section>
      <section className="lesson-content-section"><h3>评判规则</h3><div className="lesson-rubric-grid"><article><strong>读流利</strong><p>{selectedLesson.rubric.natural?.description || '自然段之间有合适的停顿，句子读得完整、连贯。'}</p></article><article><strong>读准确</strong><p>{lessonCorrectnessText(selectedLesson)}</p></article></div>{selectedLesson.rubric.thresholds && <p className="lesson-thresholds">普通字音问题达到 {selectedLesson.rubric.thresholds.normalPhoneLevel ?? 3} 级提示，重点字达到 {selectedLesson.rubric.thresholds.targetPhoneLevel ?? 3} 级复核。</p>}</section>
    </aside></div>}

    {showCreate && <div className="student-drawer-backdrop"><section className="create-dialog"><button className="drawer-close" onClick={() => setShowCreate(false)} aria-label="关闭批量建号"><X /></button><span className="teacher-kicker">批量建号</span><h2>粘贴学生名单</h2><p>每行：账号，姓名，学号，班级，单独密码。第五列留空时使用下面的统一初始密码；统一密码也留空时才随机生成。</p><label className="create-password-field">统一初始密码<Input type="text" value={defaultPassword} placeholder="留空则随机生成" onChange={event => setDefaultPassword(event.target.value)} /></label><textarea rows={9} value={rows} onChange={event => setRows(event.target.value)} /><small>示例：student260401，林晓秋，260401，一年级4班，lxq260401</small><button className="teacher-primary" onClick={() => void submitStudents()}>创建账号</button></section></div>}

    {resetTarget && <div className="student-drawer-backdrop"><section className="create-dialog"><button className="drawer-close" onClick={() => setResetTarget(null)} aria-label="关闭密码重置"><X /></button><span className="teacher-kicker">密码重置</span><h2>重置 {resetTarget.displayName} 的密码</h2><p>老师可以直接设置新密码；留空则由系统随机生成。学生登录后会看到修改密码提醒。</p><label className="create-password-field">新密码<Input type="text" value={resetValue} placeholder="至少 8 位；留空随机生成" onChange={event => setResetValue(event.target.value)} /></label><button className="teacher-primary" onClick={() => void resetPassword(resetTarget, resetValue || undefined)}>确认重置</button></section></div>}

    {credential && <div className="student-drawer-backdrop"><section className="create-dialog credentials"><button className="drawer-close" onClick={() => setCredential(null)} aria-label="关闭账号结果"><X /></button><span className="teacher-kicker">仅显示这一次</span><h2>账号已准备好</h2><p>请现在复制并安全发给学生。系统不保存明文密码。</p>{credential.map(item => <div className="credential-row" key={item.account.id}><b>{item.account.displayName}</b><code>{item.account.username}</code><code>{item.initialPassword}</code></div>)}</section></div>}
    {editingLesson !== undefined && <LessonEditor lesson={editingLesson} onClose={() => setEditingLesson(undefined)} onSaved={refresh} />}
  </div>;
}
