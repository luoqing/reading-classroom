import { useEffect, useRef, useState } from 'react';
import type { LessonView } from '@shared/api.interface';
import markup from './markup';
import { initializeReading } from './reading.js';
import { getLesson, getLessonCatalog } from '../../api/lessons';
import { loadTextbookPinyinFont } from './pinyin-font.js';
import './reading.css';

export default function ReadingPage({ persistent = false }: { persistent?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getLessonCatalog()
      .then(async ({ items, pinyinFontUrl }) => {
        await loadTextbookPinyinFont(pinyinFontUrl);
        return Promise.all(items.map(item => getLesson(item.slug)));
      })
      .then(values => { if (active) setLessons(values); })
      .catch(() => { if (active) setError('课文加载失败，请刷新后重试。'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!container.current || !lessons.length) return;
    container.current.innerHTML = markup.replace(
      /<audio id="demoAudio" preload="none" src="[^"]+"><\/audio>/,
      '<audio id="demoAudio" preload="none"></audio>',
    );
    return initializeReading(lessons, { persistent });
  }, [lessons, persistent]);

  return <>
    <div ref={container} />
    {!lessons.length && <div className="reading-loading">{error || '正在加载课文…'}</div>}
  </>;
}
