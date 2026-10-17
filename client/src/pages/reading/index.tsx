import { useEffect, useRef, useState } from 'react';
import type { LessonView } from '@shared/api.interface';
import markup from './markup';
import { initializeReading } from './reading.js';
import { getLesson } from '../../api/lessons';
import './reading.css';

export default function ReadingPage() {
  const container = useRef<HTMLDivElement>(null);
  const [lesson, setLesson] = useState<LessonView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getLesson('autumn')
      .then(value => { if (active) setLesson(value); })
      .catch(() => { if (active) setError('课文加载失败，请刷新后重试。'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!container.current || !lesson) return;
    container.current.innerHTML = markup.replace(
      /<audio id="demoAudio" preload="none" src="[^"]+"><\/audio>/,
      '<audio id="demoAudio" preload="none"></audio>',
    );
    return initializeReading(lesson);
  }, [lesson]);

  return <div ref={container}>{!lesson && <div className="reading-loading">{error || '正在加载课文…'}</div>}</div>;
}
