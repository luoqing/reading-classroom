import type { LessonDraftPageInput, LessonView, PinyinToken } from '@shared/api.interface';

const isChinese = (character: string) => /\p{Script=Han}/u.test(character);

function expandPinyin(text: string, syllables: string[]): PinyinToken[] | null {
  const tokens: PinyinToken[] = [];
  let syllableIndex = 0;
  for (const character of text) {
    if (!isChinese(character)) {
      tokens.push({ text: character, pinyin: '' });
    } else if (character === '儿' && tokens.at(-1)?.pinyin.endsWith('r')
      && syllables.length < [...text].filter(isChinese).length) {
      const previous = tokens[tokens.length - 1];
      previous.pinyin = previous.pinyin.slice(0, -1);
      tokens.push({ text: character, pinyin: 'r' });
    } else {
      const pinyin = syllables[syllableIndex++];
      if (!pinyin) return null;
      tokens.push({ text: character, pinyin });
    }
  }
  return syllableIndex === syllables.length ? tokens : null;
}

export function restoreLegacyPagePinyin(lesson: Pick<LessonView, 'fullText' | 'pinyin' | 'pages'>): PinyinToken[][] {
  const fullTextPinyin = new Map<number, string>();
  let paragraphStart = 0;
  for (const [index, paragraph] of lesson.fullText.split(/\n\s*\n/u).entries()) {
    const start = lesson.fullText.indexOf(paragraph, paragraphStart);
    if (start < 0) continue;
    paragraphStart = start + paragraph.length;
    const expanded = expandPinyin(paragraph, lesson.pinyin.paragraphs[index]?.trim().split(/\s+/u) || []);
    expanded?.forEach((token, offset) => fullTextPinyin.set(start + offset, token.pinyin));
  }

  let searchFrom = 0;
  return lesson.pages.map(page => {
    const characters = [...page.text];
    if (page.pinyin.length === characters.length
      && page.pinyin.every((token, index) => token.text === characters[index] && (!isChinese(token.text) || token.pinyin))) {
      return page.pinyin;
    }

    const start = page.pageType === 'cover' ? -1 : lesson.fullText.indexOf(page.text, searchFrom);
    if (start >= 0) searchFrom = start + page.text.length;
    const packed = page.pinyin.length === 1 && page.pinyin[0].text === page.text
      ? expandPinyin(page.text, page.pinyin[0].pinyin.trim().split(/\s+/u))
      : null;
    return characters.map((character, index) => {
      const stored = page.pinyin[index];
      const pinyin = stored?.text === character && stored.pinyin
        ? stored.pinyin
        : start >= 0 ? fullTextPinyin.get(start + index) || packed?.[index]?.pinyin || '' : packed?.[index]?.pinyin || '';
      return { text: character, pinyin, needsReview: isChinese(character) && !pinyin };
    });
  });
}

export function paragraphsFromPagePinyin(fullText: string, pages: LessonDraftPageInput[]): string[] {
  const tokensByPosition = new Map<number, PinyinToken>();
  let searchFrom = 0;
  for (const page of pages) {
    if (page.pageType === 'cover') continue;
    const start = fullText.indexOf(page.text, searchFrom);
    if (start < 0) continue;
    searchFrom = start + page.text.length;
    page.pinyin.forEach((token, index) => tokensByPosition.set(start + index, token));
  }

  let paragraphStart = 0;
  return fullText.split(/\n\s*\n/u).map(paragraph => {
    const start = fullText.indexOf(paragraph, paragraphStart);
    paragraphStart = start + paragraph.length;
    const syllables: string[] = [];
    for (const [index, character] of [...paragraph].entries()) {
      if (!isChinese(character)) continue;
      const pinyin = tokensByPosition.get(start + index)?.pinyin || character;
      if (character === '儿' && pinyin === 'r' && syllables.length) syllables[syllables.length - 1] += 'r';
      else syllables.push(pinyin);
    }
    return syllables.join(' ');
  });
}
