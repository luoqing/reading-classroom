export function safeFileName(value) {
  return String(value || '朗读').replace(/[\\/:*?"<>|\x00-\x1f]/g, '').trim() || '朗读';
}

export const downloadIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/></svg>';

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function downloadAudio(url, title = '朗读录音') {
  if (!url) throw Error('这条录音暂时无法下载。');
  const response = await fetch(url);
  if (!response.ok) throw Error('录音读取失败，请刷新后重试。');
  const blob = await response.blob();
  const extension = blob.type.includes('wav') || /[.]wav(?:[?#]|$)/i.test(url) ? 'wav' : blob.type.includes('mpeg') || blob.type.includes('mp3') || /[.]mp3(?:[?#]|$)/i.test(url) ? 'mp3' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  saveBlob(blob, `${safeFileName(title)}.${extension}`);
}

const waitForMedia = (element, event) => new Promise((resolve, reject) => {
  if (event === 'loadedmetadata' && element.readyState >= 1) return resolve();
  const done = () => { element.removeEventListener(event, done); element.removeEventListener('error', fail); resolve(); };
  const fail = () => { element.removeEventListener(event, done); element.removeEventListener('error', fail); reject(Error('视频素材读取失败，请稍后重试。')); };
  element.addEventListener(event, done, { once: true });
  element.addEventListener('error', fail, { once: true });
});

export async function exportReadingVideo({ scenes, videoUrl, fullAudioUrl, title, download = true, onProgress = () => {} }) {
  const mimeType = window.MediaRecorder && ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  if (!mimeType || !HTMLCanvasElement.prototype.captureStream) throw Error('当前浏览器不支持视频导出，请用最新版 Chrome 或 Edge。');
  if (!scenes?.length) throw Error('请先完成配音。');

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const painter = canvas.getContext('2d');
  const audioContext = new AudioContext();
  const audioDestination = audioContext.createMediaStreamDestination();
  const video = videoUrl ? document.createElement('video') : null;
  const imageUrls = [];
  const sources = [];
  let frame = null;
  let recorder = null;
  let canvasStream = null;
  let videoObjectUrl = null;
  try {
    let fullSound = null;
    if (fullAudioUrl) {
      const response = await fetch(fullAudioUrl);
      if (!response.ok) throw Error('录音读取失败，请刷新后重试。');
      fullSound = await audioContext.decodeAudioData(await response.arrayBuffer());
    }
    const prepared = [];
    for (const [index, scene] of scenes.entries()) {
      let sound = null;
      if (scene.audioUrl) {
        const response = await fetch(scene.audioUrl);
        if (!response.ok) throw Error('录音读取失败，请刷新后重试。');
        sound = await audioContext.decodeAudioData(await response.arrayBuffer());
      }
      let image = null;
      if (scene.imageUrl) {
        const response = await fetch(scene.imageUrl);
        if (!response.ok) throw Error('插画读取失败，请稍后重试。');
        const imageUrl = URL.createObjectURL(await response.blob());
        imageUrls.push(imageUrl);
        image = new Image();
        image.src = imageUrl;
        await image.decode();
      }
      const next = scenes[index + 1];
      const duration = sound?.duration || (fullSound && index > 0 ? (next?.audioStart ?? fullSound.duration) - scene.audioStart : scene.duration) || 2;
      prepared.push({ ...scene, sound, image, duration: Math.max(.2, duration) });
    }
    if (video) {
      const response = await fetch(videoUrl);
      if (!response.ok) throw Error('视频素材读取失败，请稍后重试。');
      videoObjectUrl = URL.createObjectURL(await response.blob());
      video.src = videoObjectUrl;
      video.muted = true;
      video.playsInline = true;
      await waitForMedia(video, 'loadedmetadata');
      video.currentTime = prepared[0].sourceStart || 0;
      await video.play();
    }
    await audioContext.resume();
    const total = prepared.reduce((sum, scene) => sum + scene.duration, 0);
    const startedAt = audioContext.currentTime + .15;
    let offset = 0;
    for (const scene of prepared) {
      scene.start = offset;
      offset += scene.duration;
      if (scene.sound) {
        const source = audioContext.createBufferSource();
        source.buffer = scene.sound;
        source.connect(audioDestination);
        source.start(startedAt + scene.start);
        sources.push(source);
      }
    }
    if (fullSound) {
      const source = audioContext.createBufferSource();
      source.buffer = fullSound;
      source.connect(audioDestination);
      source.start(startedAt + (prepared[0]?.kind === 'title' ? prepared[0].duration : 0));
      sources.push(source);
    }
    canvasStream = canvas.captureStream(24);
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioDestination.stream.getAudioTracks()]);
    const chunks = [];
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
    const finished = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => reject(Error('视频生成失败，请重试。'));
      recorder.onstop = () => chunks.length ? resolve(new Blob(chunks, { type: mimeType })) : reject(Error('视频生成失败，请重试。'));
    });
    const draw = () => {
      const elapsed = Math.max(0, audioContext.currentTime - startedAt);
      const scene = prepared.findLast(item => elapsed >= item.start) || prepared[0];
      painter.fillStyle = '#f5f0e5';
      painter.fillRect(0, 0, canvas.width, canvas.height);
      if (video && video.readyState >= 2) {
        const desired = scene.sourceStart + Math.min(scene.sourceEnd - scene.sourceStart, Math.max(0, elapsed - scene.start) / scene.duration * (scene.sourceEnd - scene.sourceStart));
        video.playbackRate = Math.max(.25, Math.min(4, (scene.sourceEnd - scene.sourceStart) / scene.duration));
        if (Math.abs(video.currentTime - desired) > .3) video.currentTime = desired;
        painter.drawImage(video, 0, 0, canvas.width, canvas.height);
      } else if (scene.image) {
        const scale = Math.max(canvas.width / scene.image.width, canvas.height / scene.image.height);
        const width = scene.image.width * scale, height = scene.image.height * scale;
        painter.drawImage(scene.image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      }
      if (scene.text) {
        const fontSize = scene.text.length > 75 ? 20 : scene.text.length > 45 ? 24 : 30;
        painter.font = `${fontSize}px "KaiTi", "STKaiti", sans-serif`;
        const lines = [''];
        for (const character of scene.text) {
          const last = lines.length - 1;
          if (painter.measureText(lines[last] + character).width > 880 && lines[last]) lines.push(character);
          else lines[last] += character;
        }
        const lineHeight = fontSize + 10;
        const height = lines.length * lineHeight + 20;
        painter.fillStyle = '#183c30cf';
        painter.fillRect(0, canvas.height - height, canvas.width, height);
        painter.fillStyle = '#fffdf6';
        painter.textAlign = 'center';
        lines.forEach((line, index) => painter.fillText(line, canvas.width / 2, canvas.height - height + 12 + (index + 1) * lineHeight - 6));
      }
      onProgress(Math.min(100, Math.round(elapsed / total * 100)));
      if (elapsed < total) frame = requestAnimationFrame(draw);
      else recorder.stop();
    };
    draw();
    recorder.start(1000);
    const result = await finished;
    if (download) saveBlob(result, `${safeFileName(title)}-朗读视频.webm`);
    return result;
  } finally {
    if (frame !== null) cancelAnimationFrame(frame);
    if (recorder?.state === 'recording') recorder.stop();
    sources.forEach(source => { try { source.stop(); } catch {} });
    canvasStream?.getTracks().forEach(track => track.stop());
    audioDestination.stream.getTracks().forEach(track => track.stop());
    video?.pause();
    if (videoObjectUrl) URL.revokeObjectURL(videoObjectUrl);
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    await audioContext.close();
  }
}
