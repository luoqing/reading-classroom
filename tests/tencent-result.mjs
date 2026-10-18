import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTencentResult } from '../client/src/pages/reading/tencent-result.js';

test('Tencent scores and MatchTag values normalize into the common reading model', () => {
  const rawResult = JSON.stringify({
    SuggestedScore: 88.6,
    PronAccuracy: 82.5,
    PronFluency: 0.91,
    PronCompletion: 0.8,
    Words: [
      { Word: '天', MatchTag: 0, PronAccuracy: 95, MemBeginTime: 100, MemEndTime: 350 },
      { Word: '真', MatchTag: 1, PronAccuracy: 90, MemBeginTime: 360, MemEndTime: 500 },
      { Word: '气', MatchTag: 2, PronAccuracy: 0, MemBeginTime: 500, MemEndTime: 500 },
      { Word: '凉', MatchTag: 3, PronAccuracy: 30, MemBeginTime: 510, MemEndTime: 760 },
    ],
  });
  const result = normalizeTencentResult(rawResult, '天气凉', new ArrayBuffer(32000));

  assert.equal(result.scores.total_score, 88.6);
  assert.equal(result.scores.fluency_score, 91);
  assert.equal(result.scores.integrity_score, 80);
  assert.equal(result.aligned, true);
  assert.deepEqual(result.words.map(word => word.position), [0, null, 1, 2]);
  assert.deepEqual(result.words.map(word => word.syllables[0].dpCode), [0, 32, 16, 128]);
  assert.equal(result.words[2].phones[0].level, 3);
});

test('Tencent high-confidence 了 can provide neutral-tone evidence for this lesson', () => {
  const rawResult = JSON.stringify({
    Words: [
      { Word: '了', MatchTag: 0, PronAccuracy: 92, MemBeginTime: 0, MemEndTime: 180 },
    ],
  });
  const result = normalizeTencentResult(rawResult, '了', new ArrayBuffer(16000));

  assert.equal(result.words[0].syllables[0].tone, 0);
  assert.equal(result.words[0].syllables[0].duration, 0.18);
});
