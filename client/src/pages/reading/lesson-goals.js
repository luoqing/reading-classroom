const autumnAccuracyTargets = [
  { char: '秋', reading: 'qiū' },
  { char: '气', reading: 'qì' },
  { char: '树', reading: 'shù' },
  { char: '叶', reading: 'yè' },
  { char: '黄', reading: 'huáng' },
  { char: '片', reading: 'piàn' },
  { char: '从', reading: 'cóng' },
  { char: '来', reading: 'lái' },
  { char: '飞', reading: 'fēi' },
];

const autumnTargetByChar = new Map(autumnAccuracyTargets.map(target => [target.char, target]));
const dpLabels = new Map([
  [16, '疑似漏读'],
  [32, '疑似增读'],
  [64, '疑似重复'],
  [128, '疑似替换'],
]);

const number = value => Number.isFinite(value) ? value : null;
const starFromRatio = (passed, total) => passed === total ? 3 : passed / total >= .5 ? 2 : 1;

function mainSyllable(word) {
  return word?.syllables?.find(syllable => syllable.type === 'paper' && syllable.symbol);
}

function timedIssue(word, label) {
  if (!word || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return null;
  return { position: word.position, length: word.length, word: word.content, labels: [label], start: word.start, end: word.end };
}

function structuralLabels(word) {
  return [...new Set((word?.syllables || [])
    .filter(syllable => syllable.type === 'paper' && dpLabels.has(Number(syllable.dpCode)))
    .map(syllable => dpLabels.get(Number(syllable.dpCode))))];
}

function isErhuaOmission(words, index, labels) {
  return words[index]?.content === '儿' && words[index - 1]?.content === '会' && labels.length === 1 && labels[0] === '疑似漏读';
}

function pronunciationLabel(lessonId, word) {
  const target = lessonId === 'autumn' ? autumnTargetByChar.get(word.content) : null;
  const phoneErrors = (word?.phones || []).filter(phone => [1, 2, 3].includes(Number(phone.error)));
  const severe = phoneErrors.some(phone => Number(phone.level) >= 3);
  const repeatedModerate = target && phoneErrors.filter(phone => Number(phone.level) >= 2).length >= 2;
  const confidentPhoneError = severe || repeatedModerate;
  if (!confidentPhoneError) return null;
  return target ? `字音需再听一次（目标 ${target.reading}）` : '字音需再听一次';
}

export function buildConfidentIssues({ lessonId, words, aligned }) {
  const issues = [];
  words.forEach((word, index) => {
    const labels = structuralLabels(word);
    if (isErhuaOmission(words, index, labels)) labels.length = 0;
    const pronunciation = pronunciationLabel(lessonId, word);
    if (pronunciation) labels.push(pronunciation);
    if (!labels.length || !Number.isFinite(word.start) || !Number.isFinite(word.end)) return;
    issues.push({
      position: aligned && word.length ? word.position : null,
      length: word.length,
      word: word.content,
      labels: [...new Set(labels)],
      start: word.start,
      end: word.end,
    });
  });
  return issues;
}

function punctuationBoundaries(text) {
  let position = 0;
  const boundaries = [];
  for (const character of [...text]) {
    if (/\p{Script=Han}/u.test(character)) position += 1;
    else if (/[，。！？；]/u.test(character)) boundaries.push({ nextPosition: position, punctuation: character });
  }
  return boundaries;
}

export function buildRhythmGoal({ text, words, aligned }) {
  if (!aligned) return { stars: null, count: '断句待复核', good: '逐字结果未对齐，暂不自动判断断句', practice: '请回听完整录音确认停顿和节奏', issues: [] };
  const boundaries = punctuationBoundaries(text);
  const boundaryPositions = new Set(boundaries.map(boundary => boundary.nextPosition));
  const checks = boundaries
    .map(boundary => ({ ...boundary, word: words.find(word => word.position === boundary.nextPosition) }))
    .filter(check => check.word);
  const boundaryResults = checks.map(check => {
    const sentenceEnd = /[。！？]/u.test(check.punctuation);
    const minimum = sentenceEnd ? .25 : .025;
    const pause = number(check.word.leadingPause) ?? 0;
    return { ...check, pause, passed: pause >= minimum, sentenceEnd, label: `${sentenceEnd ? '句末' : '逗号'}后停顿稍短` };
  });
  const internalBreaks = words.slice(1)
    .filter(word => !boundaryPositions.has(word.position) && (number(word.leadingPause) ?? 0) >= .65)
    .map(word => ({ word, pause: word.leadingPause, passed: false, sentenceEnd: false, label: '句中停顿稍长' }));
  const results = [...boundaryResults, ...internalBreaks];
  if (!results.length) return { stars: null, count: '暂无断句点', good: '这段文字没有可自动检查的断句点', practice: '请结合完整回放确认节奏', issues: [] };
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  const issues = failed.slice(0, 3).map(result => timedIssue(result.word, result.label)).filter(Boolean);
  return {
    stars: starFromRatio(passed.length, results.length),
    count: `${passed.length}/${results.length}处断句`,
    good: passed.length ? `AI确认 ${passed.length} 处断句节奏自然` : '这次先不着急，跟着示范分句读一遍',
    practice: failed.length ? `再练：${failed.length} 处标点后稍停一下` : '标点处的停顿均在自然范围内',
    issues,
    passedCount: passed.length,
    totalCount: results.length,
  };
}

function accuracyGoal(words, confidentIssues) {
  const results = autumnAccuracyTargets.map(target => {
    const matches = words.filter(word => word.content === target.char);
    const failed = matches.some(word => confidentIssues.some(issue => issue.position === word.position));
    return { ...target, matches, passed: matches.length > 0 && matches.every(word => Boolean(mainSyllable(word))) && !failed };
  });
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  return {
    stars: starFromRatio(passed.length, results.length),
    count: `${passed.length}/${results.length}个字音`,
    good: passed.length ? `AI未发现明显字音问题：${passed.map(result => result.char).join('、')}` : '这次先不着急，跟着示范读一遍',
    practice: failed.length ? `再练：${failed.map(result => `${result.char}（${result.reading}）`).join('、')}` : '九个重点字均未发现明显问题',
    issues: [],
  };
}

function neutralGoal(words) {
  const labels = ['天气凉了', '树叶黄了', '秋天来了'];
  const matches = words.filter(word => word.content === '了');
  const durations = words.flatMap(word => word.syllables || []).filter(syllable => syllable.type === 'paper' && Number.isFinite(syllable.duration)).map(syllable => syllable.duration).sort((a, b) => a - b);
  const median = durations.length ? durations[Math.floor(durations.length / 2)] : .3;
  const maxDuration = Math.min(.7, Math.max(.45, median * 1.6));
  const results = labels.map((label, index) => {
    const word = matches[index];
    const syllable = mainSyllable(word);
    const neutral = Boolean(syllable) && structuralLabels(word).length === 0
      && (Number(syllable.tone) === 0 || syllable.symbol === 'le0');
    const short = number(syllable?.duration) !== null && syllable.duration <= maxDuration;
    return { label, word, neutral, short, passed: neutral && short };
  });
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  return {
    stars: starFromRatio(passed.length, results.length),
    count: `${passed.length}/${results.length}处轻声`,
    good: passed.length ? `AI确认轻声自然：${passed.map(result => result.label).join('、')}` : '这次先不着急，跟着示范读一遍',
    practice: failed.length ? `再练：${failed.map(result => result.label).join('、')}里的“了”要轻、短` : '三处“了”均未发现明显拖长或重复',
    issues: failed.map(result => timedIssue(result.word, !result.neutral ? '轻声“了”疑似漏读或重复' : '轻声“了”稍拖长')).filter(Boolean),
    passedCount: passed.length,
    totalCount: results.length,
  };
}

function naturalGoal(text, words, aligned) {
  return buildRhythmGoal({ text, words, aligned });
}

const yiTargets = [
  { label: '一片片', tone: 2, reading: '二声 yí' },
  { label: '一群', tone: 4, reading: '四声 yì' },
  { label: '第一处“一会儿”', tone: 2, reading: '二声 yí' },
  { label: '第二处“一会儿”', tone: 2, reading: '二声 yí' },
  { label: '“一”字', tone: 1, reading: '一声 yī' },
];

function deliveryGoal(words) {
  const yiWords = words.filter(word => word.content === '一');
  const yiResults = yiTargets.map((target, index) => {
    const word = yiWords[index];
    const measured = word?.toneAnalysis;
    const hasContour = Number.isFinite(measured?.movement) && measured?.contour?.length >= 8;
    const reliable = hasContour || (Number.isFinite(measured?.tone) && (measured.confidence ?? 0) >= .35);
    const contourMatches = target.tone === 2 ? measured?.movement > -3
      : target.tone === 4 ? measured?.movement < -1.5
        : true;
    const passed = reliable && (hasContour ? contourMatches : measured.tone === target.tone);
    return { ...target, word, measured, passed };
  });
  const neutral = neutralGoal(words);
  const passedYi = yiResults.filter(result => result.passed);
  const passedCount = passedYi.length + neutral.passedCount;
  const totalCount = yiResults.length + neutral.totalCount;
  const yiIssues = yiResults
    .filter(result => !result.passed && result.word)
    .map(result => timedIssue(result.word, `${result.label}的“一”声调需再听（目标${result.reading}）`))
    .filter(Boolean);
  const failedYi = yiResults.filter(result => !result.passed);
  return {
    stars: starFromRatio(passedCount, totalCount),
    count: `${passedCount}/${totalCount}处轻声与变调`,
    good: passedCount ? `AI确认 ${passedYi.length} 处“一”的变调、${neutral.passedCount} 处轻声读到位` : '这次先不着急，跟着示范读一遍',
    practice: failedYi.length || neutral.passedCount < neutral.totalCount
      ? `再练：${failedYi.map(result => `${result.label}读${result.reading}`).join('、')}${failedYi.length && neutral.passedCount < neutral.totalCount ? '；' : ''}${neutral.passedCount < neutral.totalCount ? '轻声“了”读得轻、短' : ''}`
      : '五处“一”的声调和三处轻声“了”均读到位',
    issues: [...yiIssues, ...neutral.issues],
    passedCount,
    totalCount,
  };
}

const scoreStars = score => score === null ? null : score >= 90 ? 3 : score >= 70 ? 2 : 1;

export function buildLessonGoals({ lessonId, words, scores, aligned, text, confidentIssues = [] }) {
  if (lessonId === 'autumn' && aligned) {
    const accuracy = accuracyGoal(words, confidentIssues);
    const natural = naturalGoal(text, words, aligned);
    const delivery = deliveryGoal(words);
    return { targeted: true, accuracy, natural, delivery, issues: [...accuracy.issues, ...natural.issues, ...delivery.issues] };
  }
  const fallback = (score, label) => ({ stars: scoreStars(score), count: score === null ? '暂未评分' : '整篇参考', good: score === null ? '本轮没有可用结果' : `${label}参考整篇讯飞评分`, practice: aligned ? '可结合原文中的逐字提示练习' : '逐字结果未能对齐，请回听确认' });
  return {
    targeted: false,
    accuracy: fallback(scores.accuracy_score, '读准确'),
    natural: fallback(scores.fluency_score, '读自然'),
    delivery: fallback(scores.tone_score, '读到位'),
    issues: [],
  };
}

export function starsText(stars) {
  return stars === null ? '—' : '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
