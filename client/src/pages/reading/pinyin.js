export function primarySchoolPinyin(value) {
  return String(value || '').normalize('NFC');
}
