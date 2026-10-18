import { classifyMandarinTone } from './prosody.js';

function objectValue(value) {
  return typeof value === 'object' && value !== null;
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value) {
  const parsed = numeric(value);
  if (parsed === null) return null;
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function parsePayload(rawResult) {
  let parsed = JSON.parse(rawResult);
  if (typeof parsed === 'string') parsed = JSON.parse(parsed);
  if (!objectValue(parsed)) throw Error('腾讯评测结果格式异常，请重试。');
  return objectValue(parsed.result) ? parsed.result : parsed;
}

function hanCharacters(text) {
  return text.match(/\p{Script=Han}/gu) || [];
}

function timing(value) {
  const parsed = numeric(value);
  return parsed === null ? null : parsed / 1000;
}

export function normalizeTencentResult(rawResult, text, pcm) {
  const payload = parsePayload(rawResult);
  const sourceWords = Array.isArray(payload.Words) ? payload.Words : [];
  const reference = hanCharacters(text);
  const pcmSamples = pcm ? new Int16Array(pcm) : null;
  let referencePosition = 0;
  let previousEnd = 0;
  const words = sourceWords.filter(objectValue).map(item => {
    const matchTag = numeric(item.MatchTag) ?? 0;
    const actual = hanCharacters(String(item.Word || '')).join('');
    const expectedFromProvider = hanCharacters(String(item.ReferenceWord || '')).join('');
    const expectedLength = Math.max(1, hanCharacters(expectedFromProvider || actual).length);
    const isExtra = matchTag === 1;
    const position = isExtra ? null : referencePosition;
    const expected = isExtra
      ? actual
      : reference.slice(referencePosition, referencePosition + expectedLength).join('')
        || expectedFromProvider
        || actual;
    if (!isExtra) referencePosition += Math.max(1, hanCharacters(expected).length);
    const start = timing(item.MemBeginTime);
    const end = timing(item.MemEndTime);
    const duration = start !== null && end !== null ? Math.max(0, end - start) : null;
    const accuracy = numeric(item.PronAccuracy);
    const level = accuracy === null || accuracy >= 75 ? 0 : accuracy < 55 ? 3 : 2;
    const dpCode = ({ 1: 32, 2: 16, 3: 128 })[matchTag] || 0;
    const word = {
      position,
      length: Math.max(1, hanCharacters(expected).length),
      content: expected || actual,
      recognized: actual,
      start,
      end,
      leadingPause: start === null ? 0 : Math.max(0, start - previousEnd),
      providerAccuracy: accuracy,
      matchTag,
      syllables: [{
        type: 'paper',
        symbol: expected || actual,
        tone: expected === '了' && accuracy !== null && accuracy >= 70 ? 0 : null,
        duration,
        dpCode,
      }],
      phones: level ? [{ error: 1, level }] : [],
    };
    if (end !== null && matchTag !== 2) previousEnd = Math.max(previousEnd, end);
    if (word.content === '一' && pcmSamples && start !== null && end !== null) {
      const from = Math.max(0, Math.floor(start * 16000));
      const to = Math.min(pcmSamples.length, Math.ceil(end * 16000));
      word.toneAnalysis = classifyMandarinTone(pcmSamples.subarray(from, to));
    }
    return word;
  });
  return {
    scores: {
      total_score: numeric(payload.SuggestedScore),
      accuracy_score: numeric(payload.PronAccuracy),
      fluency_score: percent(payload.PronFluency),
      integrity_score: percent(payload.PronCompletion),
      tone_score: null,
    },
    metrics: {
      suggestedScore: numeric(payload.SuggestedScore),
      pronunciation: numeric(payload.PronAccuracy),
      fluency: percent(payload.PronFluency),
      completion: percent(payload.PronCompletion),
    },
    words,
    aligned: referencePosition === reference.length,
  };
}
