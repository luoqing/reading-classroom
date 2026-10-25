import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  buildConfidentIssues,
  buildLessonGoals,
  buildRhythmGoal,
} from '../client/src/pages/reading/lesson-goals.js';
import { classifyMandarinTone } from '../client/src/pages/reading/prosody.js';
import {
  buildTeacherComment,
  buildTeacherSpeechKeys,
} from '../client/src/pages/reading/teacher-comment.js';
import { teacherSpeechClips } from '../client/src/pages/reading/teacher-speech-clips.js';
import {
  encodeWav,
  findAudibleRange,
} from '../client/src/pages/reading/teacher-audio.js';

const word = (content, position, options = {}) => ({
  content,
  position,
  length: 1,
  start: position * .3,
  end: position * .3 + .25,
  syllables: [{ type: 'paper', symbol: content, duration: .25, dpCode: 0 }],
  phones: [],
  leadingPause: 0,
  ...options,
});

const autumnRubric = {
  accuracyTargets: [
    { char: '秋', reading: 'qiū' },
    { char: '气', reading: 'qì' },
  ],
  natural: {
    description: '把三处轻声“了”读得轻、短',
    neutralTargets: ['天气凉了', '树叶黄了', '秋天来了'],
  },
  delivery: {
    pronunciationTargets: [
      { char: '一', phrase: '一片片', tone: 2, reading: 'yí' },
      { char: '一', phrase: '一群', tone: 4, reading: 'yì' },
      { char: '一', phrase: '一会儿', tone: 2, reading: 'yí' },
      { char: '一', phrase: '一会儿', tone: 2, reading: 'yí' },
      { char: '一', phrase: '一字', tone: 1, reading: 'yī' },
    ],
  },
  thresholds: { normalPhoneLevel: 3, targetPhoneLevel: 2 },
};

const houseRubric = {
  accuracyTargets: [{ char: '房', reading: 'fáng' }],
  delivery: { description: '“青青”和“白白”读得轻快，问句读出疑问语气' },
  thresholds: { normalPhoneLevel: 3, targetPhoneLevel: 2 },
};

const readPcm = name => {
  const file = fs.readFileSync(new URL(`../tmp/evaluation/${name}.pcm`, import.meta.url));
  return new Int16Array(file.buffer, file.byteOffset, file.byteLength / 2);
};

const readYiAnalyses = name => {
  const pcm = readPcm(name);
  const { xml } = JSON.parse(fs.readFileSync(new URL(`../tmp/evaluation/${name}.json`, import.meta.url), 'utf8'));
  return [...xml.matchAll(/<word beg_pos="(\d+)" content="一" end_pos="(\d+)"/g)].map(match => {
    const start = Number(match[1]) * 160;
    const end = Number(match[2]) * 160;
    return classifyMandarinTone(pcm.subarray(start, end));
  });
};

const hasEvaluationFixtures = fs.existsSync(new URL('../tmp/evaluation/isolated-yi1.pcm', import.meta.url))
  && fs.existsSync(new URL('../tmp/evaluation/baseline.pcm', import.meta.url));

test('isolated 一 samples are distinguished as first through fourth tones', { skip: !hasEvaluationFixtures }, () => {
  assert.equal(classifyMandarinTone(readPcm('isolated-yi1')).tone, 1);
  assert.equal(classifyMandarinTone(readPcm('isolated-yi2')).tone, 2);
  assert.equal(classifyMandarinTone(readPcm('isolated-yi3')).tone, 3);
  assert.equal(classifyMandarinTone(readPcm('isolated-yi4')).tone, 4);
});

test('lenient contextual tone checks accept generated correct Autumn reading and reject strong mismatches', { skip: !hasEvaluationFixtures }, () => {
  const evaluate = name => buildLessonGoals({
    words: deliveryWords({ tones: [2, 4, 2, 2, 1] }).map((item, index) => index < 5
      ? { ...item, toneAnalysis: readYiAnalyses(name)[index] }
      : item),
    scores: {},
    aligned: true,
    text: '一一一一一了了了',
    confidentIssues: [],
    rubric: autumnRubric,
  }).delivery;

  assert.equal(evaluate('baseline').stars, 3);
  assert.equal(evaluate('yi-correct').stars, 3);
  assert.equal(evaluate('yi-wrong').stars, 2);
  assert.ok(evaluate('yi-wrong').issues.length >= 2);
});

test('a level-2 phone warning on a non-target character is not shown as a reading error', () => {
  const words = [
    word('天', 0, { phones: [{ error: 1, level: 2 }] }),
    word('气', 1),
  ];

  assert.deepEqual(buildConfidentIssues({ words, aligned: true, rubric: autumnRubric }), []);
});

test('a level-3 phone warning on any character is shown as a reading error', () => {
  const words = [
    word('天', 0, { phones: [{ error: 1, level: 3 }] }),
    word('气', 1),
  ];

  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].word, '天');
  assert.deepEqual(issues[0].labels, ['字音需再听一次']);
});

test('a high-confidence issue on a non-target character lowers read-accurately stars', () => {
  const words = [
    word('秋', 0),
    word('天', 1, { phones: [{ error: 1, level: 3 }] }),
    word('气', 2),
  ];
  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  const goals = buildLessonGoals({
    words,
    scores: {},
    aligned: true,
    text: '秋天气',
    confidentIssues: issues,
    rubric: autumnRubric,
  });

  assert.equal(goals.accuracy.stars, 2);
  assert.equal(goals.accuracy.count, '2/3处读准确');
  assert.match(goals.accuracy.practice, /天/);
});

test('a severe phone warning on an Autumn pronunciation target remains actionable', () => {
  const words = [
    word('秋', 0, { phones: [{ error: 1, level: 3 }] }),
    word('天', 1),
  ];

  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].word, '秋');
  assert.match(issues[0].labels.join(''), /qiū/);
});

test('one level-2 phone warning on a configured target remains actionable', () => {
  const words = [word('秋', 0, { phones: [{ error: 1, level: 2 }] })];

  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  assert.equal(issues.length, 1);
  assert.match(issues[0].labels.join(''), /qiū/);
});

test('two level-2 phone warnings on an Autumn target remain actionable', () => {
  const words = [word('秋', 0, { phones: [{ error: 1, level: 2 }, { error: 2, level: 2 }] })];

  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].word, '秋');
  assert.match(issues[0].labels.join(''), /qiū/);
});

test('low-severity phone warnings do not fail an Autumn pronunciation target', () => {
  const words = [word('秋', 0, { phones: [{ error: 1, level: 1 }] })];

  assert.deepEqual(buildConfidentIssues({ words, aligned: true, rubric: autumnRubric }), []);
});

test('erhua in 一会儿 is not reported as a missing character', () => {
  const words = [
    word('会', 0),
    word('儿', 1, { syllables: [{ type: 'paper', symbol: 'er2', duration: 0, dpCode: 16 }] }),
  ];

  assert.deepEqual(buildConfidentIssues({ words, aligned: true, rubric: autumnRubric }), []);
});

test('a real omission remains visible even when pronunciation hints are filtered', () => {
  const words = [
    word('天', 0),
    word('气', 1, { syllables: [{ type: 'paper', symbol: 'qi4', duration: 0, dpCode: 16 }] }),
  ];

  const issues = buildConfidentIssues({ words, aligned: true, rubric: autumnRubric });
  assert.equal(issues.length, 1);
  assert.deepEqual(issues[0].labels, ['疑似漏读']);
});

test('rhythm uses punctuation pauses and ignores absolute voice pitch', () => {
  const words = [
    word('天', 0),
    word('气', 1),
    word('凉', 2),
    word('了', 3),
    word('树', 4, { leadingPause: .12 }),
    word('叶', 5),
    word('黄', 6),
    word('了', 7),
    word('秋', 8, { leadingPause: .52 }),
    word('天', 9),
  ];

  const goal = buildRhythmGoal({ text: '天气凉了，树叶黄了。秋天', words, aligned: true });
  assert.equal(goal.stars, 3);
  assert.equal(goal.issues.length, 0);
  assert.match(goal.good, /断句/);
});

test('a short natural comma break from the teacher-style reference is accepted', () => {
  const words = [
    word('天', 0),
    word('气', 1, { leadingPause: .03 }),
  ];

  const goal = buildRhythmGoal({ text: '天，气', words, aligned: true });
  assert.equal(goal.stars, 3);
  assert.equal(goal.issues.length, 0);
});

test('missing a sentence pause is reported once at the next phrase', () => {
  const words = [
    word('天', 0),
    word('气', 1),
    word('秋', 2, { leadingPause: .04 }),
    word('天', 3),
  ];

  const goal = buildRhythmGoal({ text: '天气。秋天', words, aligned: true });
  assert.equal(goal.stars, 1);
  assert.equal(goal.issues.length, 1);
  assert.equal(goal.issues[0].word, '秋');
  assert.match(goal.issues[0].labels.join(''), /停顿/);
});

test('an unusually long pause inside a phrase is treated as broken rhythm', () => {
  const words = [
    word('树', 0),
    word('叶', 1),
    word('黄', 2, { leadingPause: .9 }),
    word('了', 3),
  ];

  const goal = buildRhythmGoal({ text: '树叶黄了', words, aligned: true });
  assert.equal(goal.stars, 1);
  assert.equal(goal.issues.length, 1);
  assert.equal(goal.issues[0].word, '黄');
  assert.match(goal.issues[0].labels.join(''), /句中停顿/);
});

const deliveryWords = ({ tones = [2, 4, 2, 2, 1], leTones = [0, 0, 0], leDurations = [.2, .2, .2] } = {}) => {
  const words = [];
  tones.forEach((tone, index) => words.push(word('一', words.length, { toneAnalysis: { tone, confidence: .8 } })));
  leTones.forEach((tone, index) => words.push(word('了', words.length, {
    syllables: [{ type: 'paper', symbol: `le${tone}`, tone, duration: leDurations[index], dpCode: 0 }],
  })));
  return words;
};

test('Autumn rates neutral 了 under natural and 一 tone changes under delivery', () => {
  const goals = buildLessonGoals({
    words: deliveryWords(),
    scores: {},
    aligned: true,
    text: '一一一一一了了了',
    confidentIssues: [],
    rubric: autumnRubric,
  });

  assert.equal(goals.delivery.stars, 3);
  assert.equal(goals.natural.stars, 3);
  assert.equal(goals.natural.count, '3/3处轻声');
  assert.equal(goals.delivery.count, '5/5处多音字词组');
  assert.equal(goals.delivery.issues.length, 0);
});

test('legacy Autumn neutral targets remain part of read-accurately', () => {
  const legacyRubric = {
    ...autumnRubric,
    natural: { ...autumnRubric.natural, neutralTargets: undefined },
    delivery: {
      ...autumnRubric.delivery,
      neutralTargets: ['天气凉了', '树叶黄了', '秋天来了'],
    },
  };
  const goals = buildLessonGoals({
    words: deliveryWords(),
    scores: {},
    aligned: true,
    text: '一一一一一了了了',
    confidentIssues: [],
    rubric: legacyRubric,
  });

  assert.equal(goals.natural.stars, 3);
  assert.equal(goals.natural.count, '3/3处轻声');
  assert.equal(goals.correctness.stars, 3);
});

test('repeated polyphonic phrases match the corresponding occurrence in source order', () => {
  const text = '一片片一群一会儿一会儿一字';
  const expectedTones = new Map([[0, 2], [3, 4], [5, 2], [8, 2], [11, 1]]);
  const words = [...text].map((character, position) => word(character, position, {
    toneAnalysis: expectedTones.has(position)
      ? { tone: expectedTones.get(position), confidence: .8 }
      : undefined,
  }));
  const correct = buildLessonGoals({
    words, scores: {}, aligned: true, text, confidentIssues: [], rubric: autumnRubric,
  });
  assert.equal(correct.delivery.stars, 3);

  words[8].toneAnalysis = { tone: 4, confidence: .8 };
  const mismatched = buildLessonGoals({
    words, scores: {}, aligned: true, text, confidentIssues: [], rubric: autumnRubric,
  });
  assert.equal(mismatched.delivery.stars, 2);
  assert.equal(mismatched.delivery.issues.length, 1);
  assert.match(mismatched.delivery.issues[0].labels.join(''), /一会儿.*yí/u);
});

test('Autumn exposes two ratings with the requested sub-points', () => {
  const words = [
    ...deliveryWords(),
    word('秋', 8, { leadingPause: .4 }),
    word('气', 9),
  ];
  const goals = buildLessonGoals({
    words,
    scores: { fluency_score: 95 },
    aligned: true,
    text: '一一一一一了了了\n\n秋气',
    confidentIssues: [],
    rubric: autumnRubric,
  });

  assert.equal(goals.fluency.stars, 3);
  assert.equal(goals.correctness.stars, 3);
  assert.deepEqual(
    goals.fluency.details.map(detail => detail.label),
    ['自然段停顿', '每段读流利'],
  );
  assert.deepEqual(
    goals.correctness.details.map(detail => detail.label),
    ['重点字', '多音字与变调', '轻声字词'],
  );
});

test('Autumn delivery points to 一群 when its 一 is not fourth tone', () => {
  const goals = buildLessonGoals({
    words: deliveryWords({ tones: [2, 1, 2, 2, 1] }),
    scores: {},
    aligned: true,
    text: '一一一一一了了了',
    confidentIssues: [],
    rubric: autumnRubric,
  });

  assert.equal(goals.delivery.stars, 2);
  assert.equal(goals.delivery.issues.length, 1);
  assert.match(goals.delivery.issues[0].labels.join(''), /一群.*yì/u);
});

test('neutral 了 belongs to natural and punctuation pauses are ignored for Autumn', () => {
  const words = [
    word('天', 0),
    word('气', 1),
    word('秋', 2, { leadingPause: .4 }),
    ...deliveryWords({ leTones: [4, 0, 0], leDurations: [.8, .2, .2] }).map((item, index) => ({ ...item, position: index + 3 })),
  ];
  const goals = buildLessonGoals({
    words,
    scores: {},
    aligned: true,
    text: '天气。秋天',
    confidentIssues: [],
    rubric: autumnRubric,
  });

  assert.equal(goals.natural.stars, 2);
  assert.equal(goals.delivery.stars, 3);
  assert.match(goals.natural.practice, /轻声“了”/);
});

test('a lesson without neutral or polyphone targets does not invent those ratings', () => {
  const words = [
    word('房', 0),
    word('子', 1),
    word('很', 2, { leadingPause: .35 }),
    word('漂', 3),
    word('亮', 4),
  ];
  const issues = buildConfidentIssues({ words, aligned: true, rubric: houseRubric });
  const goals = buildLessonGoals({
    words,
    scores: { tone_score: 92 },
    aligned: true,
    text: '房子。很漂亮',
    confidentIssues: issues,
    rubric: houseRubric,
  });

  assert.equal(goals.targeted, true);
  assert.equal(goals.accuracy.stars, 3);
  assert.equal(goals.natural.stars, null);
  assert.equal(goals.delivery.stars, null);
});

test('teacher comment covers all three dimensions and leads with encouragement', () => {
  const report = {
    goals: {
      accuracy: { stars: 3, good: '九个重点字很清楚', practice: '继续保持' },
      natural: { stars: 3, good: '断句自然', practice: '继续保持' },
      delivery: { stars: 2, good: '多数轻声和变调到位', practice: '再练：一群读四声 yì' },
    },
    issues: [{ word: '一', labels: ['一群的“一”声调需再听（目标四声 yì）'], start: 1, end: 2 }],
  };
  const comment = buildTeacherComment(report);

  assert.match(comment.text, /^先夸夸你/);
  assert.match(comment.text, /读准确：3颗星，九个重点字很清楚/);
  assert.match(comment.text, /轻声字词：3颗星，断句自然/);
  assert.match(comment.text, /多音字与变调：2颗星，多数轻声和变调到位/);
  assert.match(comment.text, /一群读四声/);
  assert.match(comment.text, /听一听.*自己的回放.*核实/);
  assert.equal(comment.dimension, 'delivery');
});

test('teacher comment practices the lowest-rated dimension instead of the first issue', () => {
  const report = {
    goals: {
      accuracy: { stars: 2, good: '大部分字音清楚', practice: '再练：凉' },
      natural: { stars: 3, good: '三处轻声较自然', practice: '继续保持' },
      delivery: { stars: 1, good: '两处变调到位', practice: '再练：第一处“一会儿”读二声 yí' },
    },
    issues: [
      { word: '凉', labels: ['字音需再听一次'], start: 1, end: 1.3 },
      { word: '一', labels: ['第一处“一会儿”的“一”声调需再听'], start: 4, end: 4.2 },
    ],
  };
  const comment = buildTeacherComment(report);

  assert.equal(comment.dimension, 'delivery');
  assert.match(comment.text, /最值得再练的是多音字与变调/);
  assert.match(comment.text, /第一处“一会儿”/);
});

test('teacher comment does not promise a replay when there is no concrete issue', () => {
  const report = {
    goals: {
      accuracy: { stars: 3, good: '字音清楚', practice: '继续保持' },
      natural: { stars: 3, good: '断句自然', practice: '继续保持' },
      delivery: { stars: 3, good: '轻声与变调到位', practice: '继续保持' },
    },
    issues: [],
  };
  const comment = buildTeacherComment(report);

  assert.doesNotMatch(comment.text, /回放/);
  assert.equal(comment.dimension, null);
});

test('two-dimension teacher comment is warm, concrete, child-friendly, and concise', () => {
  const report = {
    goals: {
      fluency: {
        stars: 3,
        good: '自然段之间都有明显停顿；每段语句读得通顺',
      },
      correctness: {
        stars: 3,
        good: '重点字 9/9，轻声 3/3，“一”的变调 5/5',
      },
    },
    issues: [],
  };
  const comment = buildTeacherComment(report);

  assert.match(comment.text, /^你敢于完整读出来，就是成功的第一步！/u);
  assert.match(comment.text, /自然段/u);
  assert.match(comment.text, /重点字/u);
  assert.match(comment.text, /轻声/u);
  assert.match(comment.text, /多音字词组/u);
  assert.ok([...comment.text].length <= 100);
  assert.equal(comment.dimension, null);
});

test('two-dimension teacher speech uses newly generated clips', () => {
  const report = {
    goals: {
      fluency: { stars: 2 },
      correctness: { stars: 1 },
    },
    issues: [{ labels: ['轻声“了”稍拖长'], start: 1, end: 2 }],
  };

  const speechKeys = buildTeacherSpeechKeys(report);
  assert.deepEqual(speechKeys, [
    'intro',
    'fluency-2',
    'correctness-1',
    'practice-correctness',
  ]);
  assert.ok(speechKeys.every(key => teacherSpeechClips[key]?.endsWith('.mp3')));
});

test('teacher speech trimming removes long silent edges but keeps short padding', () => {
  const samples = new Float32Array(1_000);
  samples.fill(0.2, 200, 700);

  const range = findAudibleRange(samples, 1_000);

  assert.deepEqual(range, { start: 175, end: 760 });
});

test('teacher speech merge emits a playable PCM WAV header', () => {
  const wav = encodeWav([new Float32Array([0, 0.5, -0.5, 0])], 24_000);
  const view = new DataView(wav);
  const text = (offset, length) => String.fromCharCode(
    ...new Uint8Array(wav, offset, length),
  );

  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 24_000);
  assert.equal(view.getUint32(40, true), 8);
});

test('teacher summary playback prepares one proxied merged audio source with fallback', () => {
  const teacherSource = fs.readFileSync(
    new URL('../client/src/pages/reading/teacher.js', import.meta.url),
    'utf8',
  );

  assert.match(teacherSource, /buildMergedSpeechUrl\(keys, getTeacherSpeechClip\)/u);
  assert.match(teacherSource, /speechQueue = \[mergedUrl\]/u);
  assert.match(teacherSource, /回退分段播放/u);
});

test('the result exposes summary replay and keeps the minimized playing label compact', () => {
  const readingSource = fs.readFileSync(new URL('../client/src/pages/reading/reading.js', import.meta.url), 'utf8');
  const readingStyles = fs.readFileSync(new URL('../client/src/pages/reading/reading.css', import.meta.url), 'utf8');

  assert.match(readingSource, /data-teacher-summary/);
  assert.match(readingSource, /teacher\.show\(activeReport\)/);
  assert.match(
    readingStyles,
    /\.teacher-dialog\.minimized \.teacher-portrait\.speaking::after\{top:auto;[^}]*font-size:8px/,
  );
});

test('teacher comments and student recordings both wait for a user click', () => {
  const teacherSource = fs.readFileSync(
    new URL('../client/src/pages/reading/teacher.js', import.meta.url),
    'utf8',
  );
  const summaryStart = teacherSource.indexOf('function show(result)');
  const segmentStart = teacherSource.indexOf('function showSegment(segment, kind)');
  const playbackHandlersStart = teacherSource.indexOf('audio.onplay', segmentStart);
  const playbackEndStart = teacherSource.indexOf('audio.onended', playbackHandlersStart);
  const playbackEndFinish = teacherSource.indexOf('audio.onwaiting', playbackEndStart);
  const summarySource = teacherSource.slice(summaryStart, segmentStart);
  const segmentSource = teacherSource.slice(segmentStart, playbackHandlersStart);
  const playbackEndSource = teacherSource.slice(playbackEndStart, playbackEndFinish);

  assert.ok(summaryStart >= 0 && segmentStart > summaryStart);
  assert.ok(playbackHandlersStart > segmentStart);
  assert.match(summarySource, /两项讲评 · 点击播放/u);
  assert.match(summarySource, /点“听小秋说”播放评语/u);
  assert.doesNotMatch(summarySource, /void play\(\)/u);
  assert.match(segmentSource, /点“听小秋说”播放评语/u);
  assert.doesNotMatch(segmentSource, /void play\(\)/u);
  assert.doesNotMatch(playbackEndSource, /onListen/u);
  assert.doesNotMatch(teacherSource, /replayAfterComment/u);
  assert.match(teacherSource, /teacherPractice'\)\.onclick = \(\) => \{ if \(focus\) \{ stop\(\); onListen\(focus\); \}/u);
});

test('the evaluation dialog recommends Xfyun by default', () => {
  const readingSource = fs.readFileSync(
    new URL('../client/src/pages/reading/reading.js', import.meta.url),
    'utf8',
  );

  assert.match(
    readingSource,
    /class="recommended" data-evaluation-provider="xfyun"/u,
  );
  assert.doesNotMatch(
    readingSource,
    /class="recommended" data-evaluation-provider="both"/u,
  );
});

test('the dual-provider comparison shows star ratings instead of raw scores', () => {
  const readingSource = fs.readFileSync(
    new URL('../client/src/pages/reading/reading.js', import.meta.url),
    'utf8',
  );
  const start = readingSource.indexOf('function providerCard(item)');
  const end = readingSource.indexOf('function providerComparison', start);
  const providerCardSource = readingSource.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(providerCardSource, /class="provider-stars"/u);
  assert.match(providerCardSource, /读流利星级/u);
  assert.match(providerCardSource, /读准确星级/u);
  assert.doesNotMatch(providerCardSource, /scoreText|total_score|accuracy_score|fluency_score|integrity_score|provider-metrics/u);
});

test('the reading experience consistently names the teacher Xiaoqiu', () => {
  const sources = [
    '../client/src/pages/auth/LoginPage.tsx',
    '../client/src/pages/reading/reading.js',
    '../client/src/pages/reading/teacher.js',
    '../client/src/pages/reading/teacher-clips.js',
  ].map(path => fs.readFileSync(new URL(path, import.meta.url), 'utf8'));

  assert.ok(sources.every(source => !source.includes(['小秋', '评委'].join(''))));
  assert.match(sources.at(-1), /我是小秋，很高兴听见你的声音/u);
});

test('spoken teacher comment covers accuracy, naturalness, and delivery in order', () => {
  const report = {
    goals: {
      accuracy: { stars: 3 },
      natural: { stars: 2 },
      delivery: { stars: 1 },
    },
    issues: [{ labels: ['轻声“了”稍拖长'], start: 1, end: 2 }],
  };

  const speechKeys = buildTeacherSpeechKeys(report);
  assert.deepEqual(speechKeys, [
    'intro',
    'accuracy-3',
    'natural-2',
    'delivery-1',
    'practice-natural',
  ]);
  assert.ok(speechKeys.every(key => teacherSpeechClips[key]?.endsWith('.mp3')));
});

test('generated lesson illustrations keep a stable storage locator and use a signed preview', () => {
  const service = fs.readFileSync(new URL('../server/modules/lessons/lessons.service.ts', import.meta.url), 'utf8');
  const editor = fs.readFileSync(new URL('../client/src/pages/classroom/LessonEditor.tsx', import.meta.url), 'utf8');

  assert.match(service, /illustrationUrl: storageUrl,\s*previewUrl: previewUrl \|\| storageUrl/u);
  assert.match(service, /illustrationStorageUrl: page\.illustrationUrl/u);
  assert.match(editor, /illustrationUrl: page\.illustrationStorageUrl \|\| page\.illustrationUrl/u);
  assert.match(editor, /page\.illustrationPreviewUrl \|\| page\.illustrationUrl/u);
});
