export const TEXTBOOK_PINYIN_FONT_FAMILY = 'Textbook Pinyin';

/**
 * Load the app-stored pinyin font from the short-lived URL returned by the
 * backend. Runtime loading keeps the storage signature fresh on every visit.
 *
 * @param {string | null | undefined} url
 * @param {typeof globalThis} [environment]
 */
export async function loadTextbookPinyinFont(url, environment = globalThis) {
  const FontFaceClass = environment.FontFace;
  const fonts = environment.document?.fonts;
  if (!url || !FontFaceClass || !fonts) return false;

  const alreadyLoaded = Array.from(fonts).some(font => (
    font.family.replace(/^['"]|['"]$/g, '') === TEXTBOOK_PINYIN_FONT_FAMILY
    && font.status === 'loaded'
  ));
  if (alreadyLoaded) return true;

  const face = new FontFaceClass(
    TEXTBOOK_PINYIN_FONT_FAMILY,
    `url(${JSON.stringify(url)}) format("truetype")`,
    { style: 'normal', weight: '400', display: 'swap' },
  );
  const loadedFace = await face.load();
  fonts.add(loadedFace);
  return loadedFace.status === 'loaded';
}
