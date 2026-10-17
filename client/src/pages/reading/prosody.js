const sampleRate = 16000;
const frameSize = 640;
const hopSize = 160;
const minimumLag = 40;
const maximumLag = 200;

function rms(samples, offset) {
  let energy = 0;
  for (let index = offset; index < offset + frameSize; index += 1) energy += samples[index] * samples[index];
  return Math.sqrt(energy / frameSize);
}

function framePitch(samples, offset) {
  const difference = new Float64Array(maximumLag + 1);
  const comparisonLength = frameSize - maximumLag;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = samples[offset + index] - samples[offset + index + lag];
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let running = 0;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    running += difference[lag];
    difference[lag] = running ? difference[lag] * lag / running : 1;
  }

  let selected = -1;
  for (let lag = minimumLag; lag < maximumLag; lag += 1) {
    if (difference[lag] < .25 && difference[lag] <= difference[lag - 1] && difference[lag] < difference[lag + 1]) {
      selected = lag;
      break;
    }
  }
  if (selected < 0) {
    let best = .45;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      if (difference[lag] < best) {
        best = difference[lag];
        selected = lag;
      }
    }
  }
  return selected < 0 ? null : sampleRate / selected;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function classifyMandarinTone(samples) {
  if (!samples || samples.length < frameSize) return { tone: null, confidence: 0, contour: [] };
  const frames = [];
  let peakEnergy = 0;
  for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
    const energy = rms(samples, offset);
    frames.push({ offset, energy });
    peakEnergy = Math.max(peakEnergy, energy);
  }
  const voicedThreshold = Math.max(180, peakEnergy * .12);
  const pitches = frames
    .filter(frame => frame.energy >= voicedThreshold)
    .map(frame => framePitch(samples, frame.offset))
    .filter(Number.isFinite)
    .slice(0, 17);
  if (pitches.length < 8) return { tone: null, confidence: 0, contour: pitches };

  const edge = Math.max(3, Math.floor(pitches.length * .25));
  const start = median(pitches.slice(1, 1 + edge));
  const end = median(pitches.slice(-edge));
  const movement = 12 * Math.log2(end / start);
  const valley = median([...pitches].sort((left, right) => left - right).slice(1, 4));
  const valleyDrop = 12 * Math.log2(Math.min(start, end) / valley);
  const tone = movement > 1.5 ? 2 : movement <= -3 ? 4 : valleyDrop > .9 ? 3 : 1;
  const distance = tone === 1 ? Math.min(1.5 - Math.abs(movement), .9 - valleyDrop)
    : tone === 2 ? movement - 1.5
      : tone === 3 ? valleyDrop - .9
        : -movement - 3;
  return { tone, confidence: Math.max(0, Math.min(1, .5 + distance / 6)), contour: pitches, movement, valleyDrop };
}
