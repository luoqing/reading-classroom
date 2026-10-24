import { useEffect, useRef, useState } from 'react';
import type { LessonView } from '@shared/api.interface';
import markup from './markup';
import { initializeReading } from './reading.js';
import { getLesson, getLessonCatalog } from '../../api/lessons';
import { isStandaloneRuntime } from '../../lib/runtime';
import { loadTextbookPinyinFont } from './pinyin-font.js';
import { localLessons, localPinyinFontUrl, mergeWithLocalLessons } from './local-lessons';
import './reading.css';

export default function ReadingPage({ persistent = false }: { persistent?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const [lessons, setLessons] = useState<LessonView[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (isStandaloneRuntime()) {
        await loadTextbookPinyinFont(localPinyinFontUrl);
        if (active) setLessons(localLessons);
        return;
      }
      try {
        const { items, pinyinFontUrl } = await getLessonCatalog();
        try {
          await loadTextbookPinyinFont(pinyinFontUrl);
        } catch {
          await loadTextbookPinyinFont(localPinyinFontUrl);
        }
        const remoteLessons = await Promise.all(items.map(item => getLesson(item.slug)));
        if (active) setLessons(mergeWithLocalLessons(remoteLessons));
      } catch {
        await loadTextbookPinyinFont(localPinyinFontUrl);
        if (active) {
          setError('');
          setLessons(localLessons);
        }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!container.current || !lessons.length) return;
    container.current.innerHTML = markup;
    return initializeReading(lessons, { persistent });
  }, [lessons, persistent]);

  return <>
    <div ref={container} />
    {!lessons.length && <div className="reading-loading">{error || '正在加载课文…'}</div>}
  </>;
}
