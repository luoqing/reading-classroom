const MERGE_GAP_SECONDS = 0.08;
const LEADING_PADDING_SECONDS = 0.025;
const TRAILING_PADDING_SECONDS = 0.06;
const WINDOW_SECONDS = 0.01;
const MIN_SOUND_THRESHOLD = 0.002;
const speechCache = new Map();

const audioContextClass = () => globalThis.AudioContext
  || globalThis.webkitAudioContext;

export function findAudibleRange(samples, sampleRate) {
  if (!samples.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { start: 0, end: samples.length };
  }
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    peak = Math.max(peak, Math.abs(samples[index]));
  }
  if (peak < MIN_SOUND_THRESHOLD) return { start: 0, end: samples.length };
  const threshold = Math.max(MIN_SOUND_THRESHOLD, peak * 0.018);
  const windowSize = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));
  let firstWindow = -1;
  let lastWindow = -1;
  for (let offset = 0; offset < samples.length; offset += windowSize) {
    const limit = Math.min(samples.length, offset + windowSize);
    let energy = 0;
    for (let index = offset; index < limit; index += 1) {
      energy += samples[index] * samples[index];
    }
    const rms = Math.sqrt(energy / Math.max(1, limit - offset));
    if (rms < threshold) continue;
    if (firstWindow < 0) firstWindow = offset;
    lastWindow = limit;
  }
  if (firstWindow < 0 || lastWindow < 0) {
    return { start: 0, end: samples.length };
  }
  const leadingPadding = Math.round(sampleRate * LEADING_PADDING_SECONDS);
  const trailingPadding = Math.round(sampleRate * TRAILING_PADDING_SECONDS);
  return {
    start: Math.max(0, firstWindow - leadingPadding),
    end: Math.min(samples.length, lastWindow + trailingPadding),
  };
}

function combinedAudibleRange(buffer) {
  let start = buffer.length;
  let end = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const range = findAudibleRange(
      buffer.getChannelData(channel),
      buffer.sampleRate,
    );
    start = Math.min(start, range.start);
    end = Math.max(end, range.end);
  }
  return end > start ? { start, end } : { start: 0, end: buffer.length };
}

export function encodeWav(channels, sampleRate) {
  const channelCount = channels.length;
  const frameCount = channels[0]?.length || 0;
  const bytesPerSample = 2;
  const dataLength = frameCount * channelCount * bytesPerSample;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeText(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(
        offset,
        Math.round(sample * (sample < 0 ? 32768 : 32767)),
        true,
      );
      offset += bytesPerSample;
    }
  }
  return output;
}

function toDataUrl(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:audio/wav;base64,${globalThis.btoa(binary)}`;
}

async function mergeSpeech(keys, loadClip) {
  const AudioContextConstructor = audioContextClass();
  if (!AudioContextConstructor) throw new Error('当前浏览器不支持音频合并');
  const context = new AudioContextConstructor();
  try {
    const encodedClips = await Promise.all(keys.map(loadClip));
    const buffers = await Promise.all(encodedClips.map(encoded =>
      context.decodeAudioData(encoded)));
    const ranges = buffers.map(combinedAudibleRange);
    const channelCount = Math.max(...buffers.map(buffer => buffer.numberOfChannels));
    const gapFrames = Math.round(context.sampleRate * MERGE_GAP_SECONDS);
    const contentFrames = ranges.reduce(
      (total, range) => total + range.end - range.start,
      0,
    );
    const frameCount = contentFrames + gapFrames * Math.max(0, buffers.length - 1);
    const channels = Array.from(
      { length: channelCount },
      () => new Float32Array(frameCount),
    );
    let writeOffset = 0;
    buffers.forEach((buffer, bufferIndex) => {
      const range = ranges[bufferIndex];
      channels.forEach((target, channelIndex) => {
        const sourceChannel = Math.min(channelIndex, buffer.numberOfChannels - 1);
        target.set(
          buffer.getChannelData(sourceChannel).subarray(range.start, range.end),
          writeOffset,
        );
      });
      writeOffset += range.end - range.start;
      if (bufferIndex < buffers.length - 1) writeOffset += gapFrames;
    });
    return toDataUrl(encodeWav(channels, context.sampleRate));
  } finally {
    await context.close();
  }
}

export function buildMergedSpeechUrl(keys, loadClip) {
  const cacheKey = keys.join('|');
  if (!speechCache.has(cacheKey)) {
    const pending = mergeSpeech(keys, loadClip).catch(error => {
      speechCache.delete(cacheKey);
      throw error;
    });
    speechCache.set(cacheKey, pending);
  }
  return speechCache.get(cacheKey);
}
