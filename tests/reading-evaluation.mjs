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
  delivery: {
    yiTargets: [
      { label: '一片片', tone: 2, reading: 'yí' },
      { label: '一群', tone: 4, reading: 'yì' },
      { label: '第一处“一会儿”', tone: 2, reading: 'yí' },
      { label: '第二处“一会儿”', tone: 2, reading: 'yí' },
      { label: '“一”字', tone: 1, reading: 'yī' },
    ],
    neutralTargets: ['天气凉了', '树叶黄了', '秋天来了'],
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

test('Autumn delivery gives three stars when all five 一 tones and three neutral 了 are in place', () => {
  const goals = buildLessonGoals({
    words: deliveryWords(),
    scores: {},
    aligned: true,
    text: '一一一一一了了了',
    confidentIssues: [],
    rubric: autumnRubric,
  });

  assert.equal(goals.delivery.stars, 3);
  assert.equal(goals.delivery.count, '8/8处轻声与变调');
  assert.equal(goals.delivery.issues.length, 0);
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
  assert.match(goals.delivery.issues[0].labels.join(''), /一群.*四声/);
});

test('neutral 了 belongs to delivery instead of natural rhythm', () => {
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

  assert.equal(goals.natural.stars, 3);
  assert.equal(goals.delivery.stars, 2);
  assert.match(goals.delivery.practice, /轻声“了”/);
});

test('a lesson with its own rubric receives all three targeted ratings', () => {
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
  assert.equal(goals.natural.stars, 3);
  assert.equal(goals.delivery.stars, 3);
  assert.match(goals.delivery.practice, /疑问语气/);
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
  assert.match(comment.text, /读自然：3颗星，断句自然/);
  assert.match(comment.text, /读到位：2颗星，多数轻声和变调到位/);
  assert.match(comment.text, /一群读四声/);
  assert.match(comment.text, /听一听.*自己的回放.*核实/);
  assert.equal(comment.dimension, 'delivery');
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
    'practice-delivery',
  ]);
  assert.ok(speechKeys.every(key => teacherSpeechClips[key]?.endsWith('.mp3')));
});
