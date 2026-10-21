const primarySchoolA = {
  a: 'ɑ',
  ā: 'ɑ̄',
  á: 'ɑ́',
  ǎ: 'ɑ̌',
  à: 'ɑ̀',
};

export function primarySchoolPinyin(value) {
  return String(value || '')
    .replace(/[aāáǎà]/gu, character => primarySchoolA[character])
    .replace(/g/gu, 'ɡ');
}
