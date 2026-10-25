import { BarChart3, BookOpen, FileText, KeyRound, UsersRound } from 'lucide-react';
import ReadingCottageMark from './ReadingCottageMark';

export type WorkspaceView = 'overview' | 'students' | 'lessons' | 'resources' | 'accounts';

const navItems = [
  { key: 'overview', label: '学情总览', icon: BarChart3 },
  { key: 'students', label: '学生档案', icon: UsersRound },
  { key: 'lessons', label: '课文管理', icon: BookOpen },
  { key: 'resources', label: '我的资源', icon: FileText },
  { key: 'accounts', label: '账号管理', icon: KeyRound },
] as const;

export default function TeacherWorkspaceSidebar({ active, onNavigate }: {
  active: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}) {
  return <aside className="classroom-sidebar" aria-label="教师工作台">
    <div className="classroom-sidebar-brand"><ReadingCottageMark /><strong>朗读小屋</strong><span>让每一篇课文，<br />都读进孩子的心里</span></div>
    <nav aria-label="老师工作台导航">{navItems.map(item => {
      const Icon = item.icon;
      return <button key={item.key} type="button" className={active === item.key ? 'active' : ''} aria-current={active === item.key ? 'page' : undefined} onClick={() => onNavigate(item.key)}><Icon size={19} />{item.label}</button>;
    })}</nav>
    <div className="classroom-sidebar-art"><p>在文字的阳光下，<br />看见更大的世界。</p></div>
  </aside>;
}
