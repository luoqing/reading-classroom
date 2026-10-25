const dpLabels = new Map([
  [16, '疑似漏读'],
  [32, '疑似增读'],
  [64, '疑似重复'],
  [128, '疑似替换'],
]);

const number = value => Number.isFinite(value) ? value : null;
const starFromRatio = (passed, total) => total <= 0 ? null : passed === total ? 3 : passed / total >= .5 ? 2 : 1;
const averageStars = goals => {
  const values = goals.map(goal => goal?.stars).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
};

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

function pronunciationLabel(rubric, word) {
  const target = (rubric?.accuracyTargets || []).find(item => item.char === word.content);
  const thresholds = rubric?.thresholds || {};
  const minimumLevel = target ? Number(thresholds.targetPhoneLevel ?? 2) : Number(thresholds.normalPhoneLevel ?? 3);
  const phoneErrors = (word?.phones || []).filter(phone => [1, 2, 3].includes(Number(phone.error)));
  const confidentPhoneError = phoneErrors.some(phone => Number(phone.level) >= minimumLevel);
  if (!confidentPhoneError) return null;
  return target ? `字音需再听一次（目标 ${target.reading}）` : '字音需再听一次';
}

export function buildConfidentIssues({ words, aligned, rubric = {} }) {
  const issues = [];
  words.forEach((word, index) => {
    const labels = structuralLabels(word);
    if (isErhuaOmission(words, index, labels)) labels.length = 0;
    const pronunciation = pronunciationLabel(rubric, word);
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

function accuracyGoal(words, confidentIssues, targets) {
  const results = targets.map(target => {
    const matches = words.filter(word => word.content === target.char);
    const failed = matches.some(word => confidentIssues.some(issue => issue.position === word.position));
    return { ...target, matches, passed: matches.length > 0 && matches.every(word => Boolean(mainSyllable(word))) && !failed };
  });
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  const referencePositions = new Set();
  words.forEach(word => {
    if (!Number.isInteger(word.position) || !Number.isInteger(word.length)) return;
    for (let offset = 0; offset < word.length; offset += 1) referencePositions.add(word.position + offset);
  });
  const failureKeys = new Set(confidentIssues.map((issue, index) =>
    Number.isInteger(issue.position) ? `position:${issue.position}` : `unpositioned:${index}`));
  const totalCount = referencePositions.size;
  const failedCount = Math.min(totalCount, failureKeys.size);
  const passedCount = Math.max(0, totalCount - failedCount);
  const practiceWords = [...new Set(confidentIssues.map(issue => {
    const target = targets.find(item => item.char === issue.word);
    return target ? `${target.char}（${target.reading}）` : issue.word;
  }).filter(Boolean))];
  return {
    stars: starFromRatio(passedCount, totalCount),
    count: `${passedCount}/${totalCount}处读准确`,
    good: confidentIssues.length
      ? `${passedCount}/${totalCount}处读准确，${passed.length}/${results.length}个重点字未发现明显问题`
      : `整篇未发现高置信度错读、漏读或多读，${targets.length}个重点字均读准`,
    practice: practiceWords.length
      ? `再练：${practiceWords.join('、')}`
      : failed.length
        ? `再练：${failed.map(result => `${result.char}（${result.reading}）`).join('、')}`
        : '继续保持每个字都读清楚、读完整',
    issues: [],
    targetPassedCount: passed.length,
    targetTotalCount: results.length,
  };
}

function neutralGoal(words, labels = []) {
  const neutralCharacter = [...(labels[0] || '')].filter(character => /\p{Script=Han}/u.test(character)).at(-1);
  const matches = neutralCharacter ? words.filter(word => word.content === neutralCharacter) : [];
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
    good: passed.length ? `AI未发现明显重读或拖长：${passed.map(result => result.label).join('、')}` : '这次先不着急，跟着示范读一遍',
    practice: failed.length ? `再练：${failed.map(result => result.label).join('、')}里的轻声“${neutralCharacter}”要轻、短` : `${labels.length}处轻声“${neutralCharacter}”均读得较轻、较短`,
    issues: failed.map(result => timedIssue(result.word, !result.neutral ? `轻声“${neutralCharacter}”需再听一次` : `轻声“${neutralCharacter}”稍拖长`)).filter(Boolean),
    passedCount: passed.length,
    totalCount: results.length,
  };
}

function naturalGoal(text, words, aligned, natural) {
  if (natural?.neutralTargets?.length) return neutralGoal(words, natural.neutralTargets);
  return {
    stars: null,
    count: '未设置轻声词组',
    good: '本课没有单独设置轻声词组',
    practice: '',
    issues: [],
    passedCount: 0,
    totalCount: 0,
  };
}

function toneFromReading(reading = '') {
  const numbered = reading.match(/([1-4])(?:\s|$)/u);
  if (numbered) return Number(numbered[1]);
  const toneMarks = [
    /[āēīōūǖ]/u,
    /[áéíóúǘ]/u,
    /[ǎěǐǒǔǚ]/u,
    /[àèìòùǜ]/u,
  ];
  const index = toneMarks.findIndex(pattern => pattern.test(reading));
  return index < 0 ? null : index + 1;
}

function pronunciationTargets(delivery) {
  if (delivery?.pronunciationTargets?.length) return delivery.pronunciationTargets;
  return (delivery?.yiTargets || []).map(target => ({
    char: '一',
    phrase: target.label.replace(/^第[一二三四五六七八九十]+处/u, '').replace(/[“”]/gu, ''),
    reading: target.reading,
    tone: target.tone,
  }));
}

function configuredNeutralTargets(natural, delivery) {
  if (natural?.neutralTargets?.length) return natural.neutralTargets;
  return delivery?.neutralTargets || [];
}

function pronunciationGoal(text, words, delivery) {
  const targets = pronunciationTargets(delivery);
  const hanText = [...text].filter(character => /\p{Script=Han}/u.test(character)).join('');
  const phraseCursors = new Map();
  const usedPositions = new Set();
  const results = targets.map(target => {
    const phrase = [...(target.phrase || '')].filter(character => /\p{Script=Han}/u.test(character)).join('');
    const startFrom = phraseCursors.get(phrase) || 0;
    const phrasePosition = phrase ? hanText.indexOf(phrase, startFrom) : -1;
    if (phrasePosition >= 0) phraseCursors.set(phrase, phrasePosition + phrase.length);
    const charOffset = phrase.indexOf(target.char);
    const expectedPosition = phrasePosition >= 0 && charOffset >= 0 ? phrasePosition + charOffset : null;
    let word = Number.isInteger(expectedPosition)
      ? words.find(item => item.position === expectedPosition)
      : null;
    if (!word) word = words.find(item => item.content === target.char && !usedPositions.has(item.position));
    if (word && Number.isInteger(word.position)) usedPositions.add(word.position);
    const measured = word?.toneAnalysis;
    const syllable = mainSyllable(word);
    const expectedTone = Number(target.tone) || toneFromReading(target.reading);
    const hasContour = Number.isFinite(measured?.movement) && measured?.contour?.length >= 8;
    const measuredTone = Number.isFinite(measured?.tone) ? Number(measured.tone) : Number(syllable?.tone);
    const reliable = hasContour
      || (Number.isFinite(measured?.tone) && (measured.confidence ?? 0) >= .35)
      || Number.isFinite(syllable?.tone);
    const contourMatches = expectedTone === 2 ? measured?.movement > -3
      : expectedTone === 4 ? measured?.movement < -1.5
        : measuredTone === expectedTone;
    const passed = Boolean(word && expectedTone && reliable)
      && (hasContour ? contourMatches : measuredTone === expectedTone);
    return { ...target, expectedTone, word, measured, passed };
  });
  const passedTargets = results.filter(result => result.passed);
  const passedCount = passedTargets.length;
  const totalCount = results.length;
  const issues = results
    .filter(result => !result.passed && result.word)
    .map(result => timedIssue(result.word, `${result.phrase}中的“${result.char}”需再听（目标 ${result.reading}）`))
    .filter(Boolean);
  const failedTargets = results.filter(result => !result.passed);
  return {
    stars: starFromRatio(passedCount, totalCount),
    count: `${passedCount}/${totalCount}处多音字词组`,
    good: passedCount ? `AI确认 ${passedTargets.length} 处词组中的目标读音` : '这次先不着急，跟着示范读一遍',
    practice: failedTargets.length
      ? `再练：${failedTargets.map(result => `${result.phrase}中的“${result.char}”读 ${result.reading}`).join('、')}`
      : `${targets.length}处多音字或变调均读准确`,
    issues,
    passedCount,
    totalCount,
  };
}

function paragraphBoundaries(text) {
  const paragraphs = text.split(/\n\s*\n/u);
  let position = 0;
  return paragraphs.slice(0, -1).map(paragraph => {
    position += (paragraph.match(/\p{Script=Han}/gu) || []).length;
    return position;
  });
}

function paragraphGoal(text, words, aligned) {
  if (!aligned) {
    return {
      stars: null,
      count: '自然段停顿待复核',
      good: '逐字结果未对齐，暂不自动判断自然段停顿',
      practice: '请回听自然段之间有没有明显停顿',
      issues: [],
    };
  }
  const results = paragraphBoundaries(text)
    .map(position => words.find(word => word.position === position))
    .filter(Boolean)
    .map(word => ({ word, passed: (number(word.leadingPause) ?? 0) >= .3 }));
  const passed = results.filter(result => result.passed);
  const failed = results.filter(result => !result.passed);
  return {
    stars: starFromRatio(passed.length, results.length),
    count: `${passed.length}/${results.length}处自然段停顿`,
    good: passed.length === results.length
      ? '自然段之间都有明显停顿'
      : `${passed.length}处自然段切换有明显停顿`,
    practice: failed.length
      ? `再练：${failed.length}处自然段之间停一停再读`
      : '继续保持自然段之间的清楚停顿',
    issues: failed.map(result => timedIssue(result.word, '自然段之间停顿稍短')).filter(Boolean),
    passedCount: passed.length,
    totalCount: results.length,
  };
}

function fluencyGoal({ text, words, aligned, score }) {
  const paragraphs = paragraphGoal(text, words, aligned);
  const sentenceStars = scoreStars(score);
  const sentences = {
    stars: sentenceStars,
    count: sentenceStars === null ? '每段流利待复核' : '整篇连贯度',
    good: sentenceStars === 3
      ? '每段语句读得流利'
      : sentenceStars === 2
        ? '大部分语句读得比较流利'
        : '愿意完整读下来，就是很好的开始',
    practice: sentenceStars === 3 ? '继续保持连贯朗读' : '放慢一点，把每句话连起来读',
    issues: [],
  };
  const stars = averageStars([paragraphs, sentences]);
  return {
    stars,
    count: stars === null ? '读流利待复核' : '自然段与整篇连贯度',
    good: [paragraphs.good, sentences.good].join('；'),
    practice: [paragraphs, sentences].filter(goal => goal.stars !== null && goal.stars < 3)
      .map(goal => goal.practice.replace(/^再练：/u, '')).join('；') || '继续保持自然段清楚、语句连贯',
    issues: paragraphs.issues,
    details: [
      { label: '自然段停顿', ...paragraphs },
      { label: '每段读流利', ...sentences },
    ],
  };
}

function correctnessGoal(accuracy, neutral, delivery) {
  const stars = averageStars([accuracy, neutral, delivery]);
  const practiceGoals = [accuracy, neutral, delivery]
    .filter(goal => goal.stars !== null && goal.stars < 3);
  return {
    stars,
    count: stars === null ? '读准确待复核' : '重点字、轻声字和多音字词组',
    good: `重点字 ${accuracy.targetPassedCount}/${accuracy.targetTotalCount}，多音字词组 ${delivery.passedCount}/${delivery.totalCount}，轻声词组 ${neutral.passedCount}/${neutral.totalCount}`,
    practice: practiceGoals.map(goal => goal.practice.replace(/^再练：/u, '')).join('；')
      || '重点字、轻声字和多音字词组都读得很准确',
    issues: [...accuracy.issues, ...neutral.issues, ...delivery.issues],
    details: [
      { label: '重点字', ...accuracy },
      { label: '多音字与变调', ...delivery },
      { label: '轻声字词', ...neutral },
    ],
  };
}

const scoreStars = score => score === null ? null : score >= 90 ? 3 : score >= 70 ? 2 : 1;

export function buildLessonGoals({ words, scores, aligned, text, confidentIssues = [], rubric = {} }) {
  const accuracyTargets = rubric?.accuracyTargets || [];
  const naturalRubric = rubric?.natural || {};
  const deliveryRubric = rubric?.delivery || {};
  const neutralTargets = configuredNeutralTargets(naturalRubric, deliveryRubric);
  const hasConfiguredTargets = accuracyTargets.length
    || neutralTargets.length
    || pronunciationTargets(deliveryRubric).length;
  if (hasConfiguredTargets && aligned) {
    const accuracy = accuracyGoal(words, confidentIssues, accuracyTargets);
    const natural = naturalGoal(text, words, aligned, {
      ...naturalRubric,
      neutralTargets,
    });
    const delivery = pronunciationGoal(text, words, deliveryRubric);
    const fluency = fluencyGoal({ text, words, aligned, score: scores.fluency_score });
    const correctness = correctnessGoal(accuracy, natural, delivery);
    return {
      targeted: true,
      fluency,
      correctness,
      accuracy,
      natural,
      delivery,
      issues: [...fluency.issues, ...correctness.issues],
    };
  }
  const fallback = (score, label) => ({ stars: scoreStars(score), count: score === null ? '暂未评分' : '整篇参考', good: score === null ? '本轮没有可用结果' : `${label}参考整篇讯飞评分`, practice: aligned ? '可结合原文中的逐字提示练习' : '逐字结果未能对齐，请回听确认' });
  const fluency = fallback(scores.fluency_score, '读流利');
  const correctness = fallback(scores.accuracy_score, '读准确');
  return {
    targeted: false,
    fluency,
    correctness,
    accuracy: fallback(scores.accuracy_score, '读准确'),
    natural: fallback(null, '轻声字词'),
    delivery: fallback(null, '多音字词组'),
    issues: [],
  };
}

export function starsText(stars) {
  return stars === null ? '—' : '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
