import type { LessonDraftInput } from '@shared/api.interface';

export function countChangedPagesWithRetainedMedia(saved: LessonDraftInput, current: LessonDraftInput): number {
  const savedPages = new Map(saved.pages.filter(page => page.id).map(page => [page.id, page]));
  return current.pages.filter((page, index) => {
    const previous = page.id ? savedPages.get(page.id) : (!saved.pages[index]?.id ? saved.pages[index] : undefined);
    if (!previous) return false;
    const changed = page.text !== previous.text
      || JSON.stringify(page.pinyin.map(({ text, pinyin }) => [text, pinyin]))
        !== JSON.stringify(previous.pinyin.map(({ text, pinyin }) => [text, pinyin]));
    const retainedMedia = (previous.illustrationUrl && previous.illustrationUrl === page.illustrationUrl)
      || (previous.demoAudioUrl && previous.demoAudioUrl === page.demoAudioUrl);
    return !!(changed && retainedMedia);
  }).length;
}
