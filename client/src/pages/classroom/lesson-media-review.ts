import type { LessonDraftInput } from '@shared/api.interface';

export interface ChangedPageWithRetainedMedia {
  pageIndex: number;
  textChanged: boolean;
  pinyinChanged: boolean;
}

export function getChangedPagesWithRetainedMedia(saved: LessonDraftInput, current: LessonDraftInput): ChangedPageWithRetainedMedia[] {
  const savedPages = new Map(saved.pages.filter(page => page.id).map(page => [page.id, page]));
  return current.pages.flatMap((page, index) => {
    const previous = page.id ? savedPages.get(page.id) : (!saved.pages[index]?.id ? saved.pages[index] : undefined);
    if (!previous) return [];
    const textChanged = page.text !== previous.text;
    const pinyinChanged = JSON.stringify(page.pinyin.map(({ pinyin }) => pinyin))
      !== JSON.stringify(previous.pinyin.map(({ pinyin }) => pinyin));
    const retainedMedia = (previous.illustrationUrl && previous.illustrationUrl === page.illustrationUrl)
      || (previous.demoAudioUrl && previous.demoAudioUrl === page.demoAudioUrl);
    return (textChanged || pinyinChanged) && retainedMedia ? [{ pageIndex: index, textChanged, pinyinChanged }] : [];
  });
}
