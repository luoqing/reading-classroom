import { readingAssets } from './assets.js';

const autumnScenes = [
  {
    text: '天气凉了，树叶黄了，一片片叶子从树上落下来。',
    pinyin: 'tiān qì liáng le shù yè huáng le yí piàn piàn yè zi cóng shù shàng luò xià lái',
    sourceStart: 2,
    sourceEnd: 9,
  },
  {
    text: '天那么蓝，那么高。一群大雁往南飞，',
    pinyin: 'tiān nà me lán nà me gāo yì qún dà yàn wǎng nán fēi',
    sourceStart: 9,
    sourceEnd: 14,
  },
  {
    text: '一会儿排成个“人”字，',
    pinyin: 'yí huìr pái chéng gè rén zì',
    sourceStart: 14,
    sourceEnd: 19,
  },
  {
    text: '一会儿排成个“一”字。',
    pinyin: 'yí huìr pái chéng gè yī zì',
    sourceStart: 19,
    sourceEnd: 24,
  },
  {
    text: '啊！秋天来了！',
    pinyin: 'à qiū tiān lái le',
    sourceStart: 24,
    sourceEnd: 30,
  },
];

const hanLength = text => (text.match(/\p{Script=Han}/gu) || []).length;
const escapeHTML = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderAutumnDubbingScript(sceneIndex, showPinyin = true) {
  const scene = autumnScenes[sceneIndex];
  if (!scene) return '秋天';
  if (!showPinyin) return escapeHTML(scene.text);
  const syllables = scene.pinyin.split(' ');
  let syllableIndex = 0;
  const content = (scene.text.match(/会儿|[\s\S]/gu) || []).map(character => {
    if (!/\p{Script=Han}/u.test(character)) return escapeHTML(character);
    const pinyin = syllables[syllableIndex++];
    return `<ruby>${escapeHTML(character)}<rt>${pinyin}</rt></ruby><wbr>`;
  }).join('');
  if (syllableIndex !== syllables.length) throw Error('配音文字拼音数量不匹配');
  return content;
}
export const AUTUMN_VIDEO_SOURCE = readingAssets.video;
export const AUTUMN_DEMO_SOURCE = readingAssets.fullDemo;
export const AUTUMN_COVER_DEMO_SOURCE = readingAssets.coverDemo;
export const AUTUMN_DEMO_SOURCES = readingAssets.sceneDemos;

export function buildAutumnVideoTimeline({ words, aligned }) {
  if (!aligned || !Array.isArray(words) || !words.length) return [];
  let position = 0;
  const spokenScenes = autumnScenes.map((scene, index) => {
    const startPosition = position;
    position += hanLength(scene.text);
    const timedWords = words.filter(word => word.position < position && word.position + word.length > startPosition && Number.isFinite(word.start) && Number.isFinite(word.end));
    if (!timedWords.length) return null;
    return {
      ...scene,
      id: `scene-${index + 1}`,
      kind: 'spoken',
      audioStart: index === 0 ? 0 : Math.min(...timedWords.map(word => word.start)),
      audioEnd: Math.max(...timedWords.map(word => word.end)),
    };
  });
  if (spokenScenes.some(scene => !scene)) return [];
  for (let index = 0; index < spokenScenes.length - 1; index += 1) {
    spokenScenes[index].audioEnd = spokenScenes[index + 1].audioStart;
  }
  return [
    { id: 'title', kind: 'title', text: '秋天', sourceStart: 0, sourceEnd: 2, audioStart: null, audioEnd: null },
    ...spokenScenes,
  ];
}

export function buildDubbingTimeline(clips, coverClip) {
  if (!coverClip?.url || !Number.isFinite(coverClip.duration) || coverClip.duration <= 0 || !Array.isArray(clips) || clips.length !== autumnScenes.length || clips.some(clip => !clip?.url || !Number.isFinite(clip.duration) || clip.duration <= 0)) return [];
  let audioPosition = coverClip.duration;
  const spokenScenes = autumnScenes.map((scene, index) => {
    const audioStart = audioPosition;
    audioPosition = Number((audioPosition + clips[index].duration).toFixed(3));
    return {
      ...scene,
      id: `scene-${index + 1}`,
      kind: 'spoken',
      audioUrl: clips[index].url,
      audioStart,
      audioEnd: audioPosition,
    };
  });
  return [
    { id: 'title', kind: 'title', text: '秋天', sourceStart: 0, sourceEnd: 2, audioUrl: coverClip.url, audioStart: 0, audioEnd: coverClip.duration },
    ...spokenScenes,
  ];
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const formatSeconds = value => `${Math.max(0, value).toFixed(1)}秒`;

export function setupVideoPreview({ sourceUrl = AUTUMN_VIDEO_SOURCE, onStatus = () => {} } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'video-preview-dialog';
  dialog.setAttribute('aria-labelledby', 'videoPreviewTitle');
  dialog.innerHTML = `
    <div class="video-preview-head">
      <div><span class="eyebrow">讯飞逐句对齐</span><h2 id="videoPreviewTitle">把朗读做成小视频</h2></div>
      <button class="video-preview-close" type="button" aria-label="关闭视频预览">×</button>
    </div>
    <div class="video-preview-stage">
      <video muted playsinline preload="metadata"></video>
      <div class="video-preview-caption" aria-live="polite"></div>
    </div>
    <div class="video-scene-strip" aria-label="画面时间轴"></div>
    <p class="video-preview-status" role="status">准备好后，点击预览查看画面如何跟着朗读切换。</p>
    <audio preload="metadata"></audio>
    <div class="video-preview-actions">
      <button class="secondary" type="button" data-video-close>返回评测</button>
      <button class="primary" type="button" data-video-play>▷ 预览自动切画面</button>
    </div>
    <p class="small video-preview-note">当前先验证讯飞切句效果；孩子原声不变速，只调整画面播放速度。</p>`;
  document.body.append(dialog);
  const video = dialog.querySelector('video');
  const audio = dialog.querySelector('audio');
  const playButton = dialog.querySelector('[data-video-play]');
  const status = dialog.querySelector('.video-preview-status');
  const caption = dialog.querySelector('.video-preview-caption');
  const strip = dialog.querySelector('.video-scene-strip');
  let timeline = [];
  let animationFrame = null;
  let phase = 'idle';
  let activeSceneIndex = -1;

  const setStatus = message => {
    status.textContent = message;
    onStatus(message);
  };
  const setActiveScene = index => {
    if (index === activeSceneIndex) return;
    activeSceneIndex = index;
    strip.querySelectorAll('button').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === index));
    caption.textContent = timeline[index]?.text || '';
  };
  const stopFrame = () => {
    if (animationFrame !== null) cancelAnimationFrame(animationFrame);
    animationFrame = null;
  };
  const pause = () => {
    video.pause();
    audio.pause();
    stopFrame();
    if (phase !== 'idle' && phase !== 'ended') {
      phase = 'paused';
      playButton.textContent = '▷ 继续预览';
      setStatus('已暂停，再点一下继续。');
    }
  };
  const spokenSceneIndex = time => {
    for (let index = 1; index < timeline.length; index += 1) {
      const end = index === timeline.length - 1 ? audio.duration : timeline[index].audioEnd;
      if (time < end || index === timeline.length - 1) return index;
    }
    return timeline.length - 1;
  };
  const syncSpokenScene = () => {
    if (audio.ended) {
      phase = 'ended';
      video.pause();
      video.currentTime = timeline.at(-1).sourceEnd - .05;
      setActiveScene(timeline.length - 1);
      playButton.textContent = '↻ 再看一遍';
      setStatus('预览完成。画面切换均来自本次讯飞的逐句时间。');
      stopFrame();
      return;
    }
    const index = spokenSceneIndex(audio.currentTime);
    const scene = timeline[index];
    const sceneEnd = index === timeline.length - 1 ? audio.duration : scene.audioEnd;
    const audioDuration = Math.max(.2, sceneEnd - scene.audioStart);
    const videoDuration = scene.sourceEnd - scene.sourceStart;
    const rate = clamp(videoDuration / audioDuration, .25, 4);
    const desiredTime = scene.sourceStart + Math.min(videoDuration, Math.max(0, audio.currentTime - scene.audioStart) * rate);
    if (index !== activeSceneIndex || Math.abs(video.currentTime - desiredTime) > .24) video.currentTime = desiredTime;
    video.playbackRate = rate;
    setActiveScene(index);
    if (video.paused) void video.play().catch(() => {});
    setStatus(`正在对齐第 ${index} 幅插画 · 这句 ${formatSeconds(audioDuration)}`);
    animationFrame = requestAnimationFrame(syncSpokenScene);
  };
  const syncTitle = () => {
    if (video.currentTime >= timeline[0].sourceEnd - .04) {
      video.pause();
      video.currentTime = timeline[1].sourceStart;
      audio.currentTime = 0;
      phase = 'spoken';
      void Promise.all([video.play(), audio.play()]).then(syncSpokenScene).catch(() => {
        pause();
        setStatus('预览未能播放，请再点一次。');
      });
      return;
    }
    animationFrame = requestAnimationFrame(syncTitle);
  };
  const start = async () => {
    if (!timeline.length || !sourceUrl) {
      setStatus('视频母版还没有接入，暂时无法预览。');
      return;
    }
    stopFrame();
    audio.pause();
    video.pause();
    audio.currentTime = 0;
    video.currentTime = timeline[0].sourceStart;
    video.playbackRate = 1;
    phase = 'title';
    setActiveScene(0);
    playButton.textContent = 'Ⅱ 暂停预览';
    setStatus('片头播放中，接下来会按讯飞时间自动切画面。');
    try {
      await video.play();
      animationFrame = requestAnimationFrame(syncTitle);
    } catch {
      phase = 'idle';
      playButton.textContent = '▷ 预览自动切画面';
      setStatus('预览未能播放，请检查视频母版后重试。');
    }
  };
  const resume = async () => {
    playButton.textContent = 'Ⅱ 暂停预览';
    if (audio.currentTime > 0) {
      phase = 'spoken';
      await Promise.all([video.play(), audio.play()]);
      animationFrame = requestAnimationFrame(syncSpokenScene);
    } else {
      phase = 'title';
      await video.play();
      animationFrame = requestAnimationFrame(syncTitle);
    }
  };
  const close = () => {
    pause();
    phase = 'idle';
    dialog.close();
  };

  playButton.addEventListener('click', () => {
    if (phase === 'title' || phase === 'spoken') pause();
    else if (phase === 'paused') void resume();
    else void start();
  });
  dialog.querySelector('.video-preview-close').addEventListener('click', close);
  dialog.querySelector('[data-video-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

  return {
    open(report) {
      timeline = buildAutumnVideoTimeline(report);
      if (!timeline.length) {
        onStatus('这次评测没有完成逐字对齐，暂时不能自动切画面。');
        return false;
      }
      video.src = sourceUrl;
      audio.src = report.url;
      strip.innerHTML = timeline.map((scene, index) => `<button type="button" tabindex="-1"><span>${index + 1}</span><strong>${scene.kind === 'title' ? '片头' : `画面 ${index}`}</strong><small>${scene.kind === 'title' ? '2.0秒' : formatSeconds(scene.audioEnd - scene.audioStart)}</small></button>`).join('');
      phase = 'idle';
      activeSceneIndex = -1;
      setActiveScene(0);
      playButton.textContent = '▷ 预览自动切画面';
      setStatus('已找到 5 个朗读片段，将按讯飞时间自动切换插画。');
      dialog.showModal();
      return true;
    },
    close,
    destroy() {
      close();
      dialog.remove();
    },
  };
}
export function setupIllustrationDubbing({
  sourceUrl = AUTUMN_VIDEO_SOURCE,
  coverDemoSourceUrl = AUTUMN_COVER_DEMO_SOURCE,
  demoSourceUrls = AUTUMN_DEMO_SOURCES,
  onEvaluate = async () => {},
  onStatus = () => {},
} = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dubbing-dialog';
  dialog.setAttribute('aria-labelledby', 'dubbingTitle');
  dialog.innerHTML = `
    <div class="dubbing-head">
      <div><span class="eyebrow">给插画配音</span><h2 id="dubbingTitle">一页一页，读出你的《秋天》</h2></div>
      <button class="dubbing-close" type="button" aria-label="关闭逐页配音">×</button>
    </div>
    <div class="dubbing-workspace">
      <div class="dubbing-visual">
        <video muted playsinline preload="metadata"></video>
        <div class="dubbing-caption"></div>
        <span class="dubbing-page-badge"></span>
      </div>
      <div class="dubbing-panel">
        <div class="dubbing-progress"><span></span><strong></strong></div>
        <div class="dubbing-script-tools">
          <span class="small">看着这句读</span>
          <button class="dubbing-pinyin-toggle" type="button" data-dubbing-pinyin aria-pressed="true">拼音已显示</button>
        </div>
        <p class="dubbing-script"></p>
        <p class="small dubbing-hint">先听示范，再看着插画读这一句。</p>
        <audio preload="metadata"></audio>
        <div class="dubbing-audio-actions">
          <button class="secondary" type="button" data-dubbing-own hidden>▷ 听我的配音</button>
          <button class="secondary" type="button" data-dubbing-demo>▷ 听本句示范</button>
        </div>
        <button class="primary dubbing-record" type="button" data-dubbing-record>● 开始录这一页</button>
        <p class="dubbing-status" role="status"></p>
        <div class="dubbing-dots" aria-label="配音进度"></div>
        <div class="dubbing-nav">
          <button class="secondary" type="button" data-dubbing-prev>← 上一页</button>
          <button class="secondary" type="button" data-dubbing-next>下一页 →</button>
        </div>
        <div class="dubbing-finish-actions">
          <button class="primary dubbing-evaluate" type="button" data-dubbing-evaluate disabled>提交讯飞评测</button>
          <button class="secondary dubbing-compose" type="button" data-dubbing-compose disabled>✦ 合成朗读视频</button>
        </div>
      </div>
    </div>
    <p class="small dubbing-privacy">配音暂存在当前页面，刷新后清除。</p>`;
  document.body.append(dialog);
  const video = dialog.querySelector('video');
  const audio = dialog.querySelector('audio');
  const caption = dialog.querySelector('.dubbing-caption');
  const pageBadge = dialog.querySelector('.dubbing-page-badge');
  const progress = dialog.querySelector('.dubbing-progress span');
  const progressLabel = dialog.querySelector('.dubbing-progress strong');
  const script = dialog.querySelector('.dubbing-script');
  const scriptTools = dialog.querySelector('.dubbing-script-tools');
  const pinyinButton = dialog.querySelector('[data-dubbing-pinyin]');
  const hint = dialog.querySelector('.dubbing-hint');
  const status = dialog.querySelector('.dubbing-status');
  const dots = dialog.querySelector('.dubbing-dots');
  const audioActions = dialog.querySelector('.dubbing-audio-actions');
  const demoButton = dialog.querySelector('[data-dubbing-demo]');
  const ownButton = dialog.querySelector('[data-dubbing-own]');
  const recordButton = dialog.querySelector('[data-dubbing-record]');
  const previousButton = dialog.querySelector('[data-dubbing-prev]');
  const nextButton = dialog.querySelector('[data-dubbing-next]');
  const evaluateButton = dialog.querySelector('[data-dubbing-evaluate]');
  const composeButton = dialog.querySelector('[data-dubbing-compose]');
  const clips = Array(autumnScenes.length).fill(null);
  let coverClip = null;
  let currentIndex = -1;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let timer = null;
  let recordingStartedAt = 0;
  let audioMode = null;
  let composing = false;
  let composeIndex = -1;
  let evaluating = false;
  let showPinyin = true;

  const setStatus = message => {
    status.textContent = message;
    onStatus(message);
  };
  const stopAudio = () => {
    audioMode = null;
    audio.pause();
    demoButton.textContent = currentIndex < 0 ? '▷ 听课题示范' : '▷ 听本句示范';
    ownButton.textContent = '▷ 听我的配音';
  };
  const showStill = () => {
    video.pause();
    video.playbackRate = 1;
    if (currentIndex < 0) video.currentTime = 1;
    else {
      const scene = autumnScenes[currentIndex];
      video.currentTime = (scene.sourceStart + scene.sourceEnd) / 2;
    }
  };
  const renderScript = () => {
    const isCover = currentIndex < 0;
    script.innerHTML = renderAutumnDubbingScript(currentIndex, showPinyin);
    scriptTools.hidden = isCover;
    pinyinButton.disabled = evaluating;
    pinyinButton.setAttribute('aria-pressed', String(showPinyin));
    pinyinButton.textContent = showPinyin ? '拼音已显示' : '显示拼音';
  };
  const render = () => {
    const isCover = currentIndex < 0;
    const scene = isCover ? null : autumnScenes[currentIndex];
    const currentClip = isCover ? coverClip : clips[currentIndex];
    const completed = clips.filter(Boolean).length + Number(Boolean(coverClip));
    const totalPages = autumnScenes.length + 1;
    renderScript();
    caption.textContent = isCover ? '秋天' : scene.text;
    pageBadge.textContent = `${currentIndex + 2}/${totalPages}`;
    hint.textContent = isCover ? '先听示范，再读出课题“秋天”。封面录音会放在成片开头。' : '先听示范，再看着插画读这一句。';
    audioActions.hidden = false;
    recordButton.hidden = false;
    progress.style.width = `${completed / totalPages * 100}%`;
    progressLabel.textContent = `已完成 ${completed}/${totalPages} 页`;
    previousButton.disabled = evaluating || currentIndex < 0;
    nextButton.disabled = evaluating || currentIndex === autumnScenes.length - 1;
    ownButton.hidden = !currentClip;
    demoButton.textContent = isCover ? '▷ 听课题示范' : '▷ 听本句示范';
    demoButton.disabled = evaluating;
    ownButton.disabled = evaluating;
    recordButton.disabled = evaluating;
    recordButton.textContent = currentClip ? '● 重新录这一页' : '● 开始录这一页';
    evaluateButton.disabled = completed !== totalPages || evaluating;
    composeButton.disabled = completed !== totalPages || evaluating;
    evaluateButton.textContent = evaluating ? '正在提交讯飞…' : '提交讯飞评测';
    composeButton.textContent = completed === totalPages ? '✦ 合成朗读视频' : `还有 ${totalPages - completed} 页未录`;
    dots.innerHTML = `<button type="button" aria-label="封面" data-dubbing-page="-1" class="${isCover ? 'active ' : ''}${coverClip ? 'done' : ''}"><span>${coverClip ? '✓' : '秋'}</span></button>` + autumnScenes.map((_, index) => `<button type="button" aria-label="第 ${index + 2} 页" data-dubbing-page="${index}" class="${index === currentIndex ? 'active ' : ''}${clips[index] ? 'done' : ''}"><span>${clips[index] ? '✓' : index + 2}</span></button>`).join('');
    setStatus(currentClip ? `这一页已录好 · ${formatSeconds(currentClip.duration)}` : isCover ? '封面还没有配音，请先读出课题“秋天”。' : '这一页还没有配音。');
    showStill();
  };
  const selectPage = index => {
    if (recorder?.state === 'recording' || composing || evaluating) return;
    stopAudio();
    currentIndex = clamp(index, -1, autumnScenes.length - 1);
    render();
  };
  const releaseStream = () => {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };
  const stopRecording = () => {
    if (recorder?.state === 'recording') recorder.stop();
  };
  const startRecording = async () => {
    if (evaluating) return;
    const currentClip = currentIndex < 0 ? coverClip : clips[currentIndex];
    if (currentClip && !confirm('重新录音会替换这一页的配音，是否继续？')) return;
    stopAudio();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('当前浏览器不支持配音，请用 HTTPS 打开并允许麦克风。');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      recorder = new MediaRecorder(stream);
      chunks = [];
      const recordingIndex = currentIndex;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        clearInterval(timer);
        releaseStream();
        recordButton.textContent = '● 重新录这一页';
        setStatus('这一页没有录好，请再试一次。');
      };
      recorder.onstop = () => {
        clearInterval(timer);
        releaseStream();
        const previous = recordingIndex < 0 ? coverClip : clips[recordingIndex];
        if (previous?.url) URL.revokeObjectURL(previous.url);
        const clipBlob = new Blob(chunks, { type: recorder.mimeType });
        const recordedClip = {
          blob: clipBlob,
          url: URL.createObjectURL(clipBlob),
          duration: Math.max(.5, (performance.now() - recordingStartedAt) / 1000),
        };
        if (recordingIndex < 0) coverClip = recordedClip;
        else clips[recordingIndex] = recordedClip;
        recorder = null;
        render();
        if (recordingIndex < 0) {
          setStatus('封面已录好，可以继续录第 2/6 页。');
        } else if (recordingIndex < autumnScenes.length - 1) {
          setStatus(`第 ${recordingIndex + 2}/6 页已录好，可以继续下一页。`);
        } else {
          setStatus('最后一页已录好，现在可以合成朗读视频。');
        }
      };
      recorder.start();
      recordingStartedAt = performance.now();
      recordButton.textContent = '■ 读完了';
      setStatus('正在录这一页……');
      timer = setInterval(() => {
        const elapsed = (performance.now() - recordingStartedAt) / 1000;
        setStatus(`正在录这一页 · ${formatSeconds(elapsed)}`);
        if (elapsed >= 30) stopRecording();
      }, 200);
    } catch (error) {
      releaseStream();
      setStatus(error?.name === 'NotAllowedError' ? '请允许麦克风后再录这一页。' : '无法启动麦克风，请稍后重试。');
    }
  };
  const playDemo = async () => {
    if (evaluating) return;
    const demoSourceUrl = currentIndex < 0 ? coverDemoSourceUrl : demoSourceUrls[currentIndex];
    if (!demoSourceUrl) return setStatus('本句示范音频还没有准备好。');
    if (!audio.paused && audioMode === 'demo') return stopAudio();
    stopAudio();
    audio.src = demoSourceUrl;
    audio.currentTime = 0;
    audioMode = 'demo';
    demoButton.textContent = currentIndex < 0 ? 'Ⅱ 暂停课题示范' : 'Ⅱ 暂停本句示范';
    setStatus(currentIndex < 0 ? '正在播放课题示范。' : '正在播放这一句的示范。');
    try { await audio.play(); } catch { setStatus(currentIndex < 0 ? '课题示范暂时无法播放，请稍后重试。' : '本句示范暂时无法播放，请稍后重试。'); }
  };
  const playOwn = async () => {
    if (evaluating) return;
    const clip = currentIndex < 0 ? coverClip : clips[currentIndex];
    if (!clip) return;
    if (!audio.paused && audioMode === 'own') return stopAudio();
    stopAudio();
    audioMode = 'own';
    audio.src = clip.url;
    audio.currentTime = 0;
    ownButton.textContent = 'Ⅱ 暂停我的配音';
    setStatus('正在回听我的这一页配音。');
    try { await audio.play(); } catch { setStatus('这一页的配音暂时无法播放。'); }
  };
  const playComposeScene = async index => {
    if (!composing) return;
    if (index >= autumnScenes.length) {
      composing = false;
      video.pause();
      video.currentTime = autumnScenes.at(-1).sourceEnd - .05;
      dialog.classList.remove('composing');
      render();
      composeButton.textContent = '↻ 再看合成视频';
      setStatus('播放完成！六页画面和配音已按顺序连在一起。');
      return;
    }
    composeIndex = index;
    const scene = autumnScenes[index];
    const clip = clips[index];
    currentIndex = index;
    caption.textContent = scene.text;
    pageBadge.textContent = `${index + 2}/${autumnScenes.length + 1}`;
    video.currentTime = scene.sourceStart;
    video.playbackRate = clamp((scene.sourceEnd - scene.sourceStart) / clip.duration, .25, 4);
    audio.src = clip.url;
    audio.currentTime = 0;
    setStatus(`正在播放第 ${index + 2}/${autumnScenes.length + 1} 页配音`);
    try {
      await Promise.all([video.play(), audio.play()]);
    } catch {
      composing = false;
      setStatus('暂时无法播放，请重试。');
    }
  };
  const compose = async () => {
    if (!buildDubbingTimeline(clips, coverClip).length || evaluating) return;
    stopAudio();
    composing = true;
    composeIndex = -1;
    dialog.classList.add('composing');
    caption.textContent = '秋天';
    pageBadge.textContent = `1/${autumnScenes.length + 1}`;
    video.currentTime = 0;
    video.playbackRate = 1;
    audio.src = coverClip.url;
    audio.currentTime = 0;
    composeButton.textContent = 'Ⅱ 正在播放';
    setStatus(`正在播放第 1/${autumnScenes.length + 1} 页 · 《秋天》封面`);
    try { await Promise.all([video.play(), audio.play()]); } catch { composing = false; }
  };
  const stopCompose = () => {
    composing = false;
    composeIndex = -1;
    video.pause();
    stopAudio();
    dialog.classList.remove('composing');
    if (dialog.open) render();
  };
  const close = () => {
    stopRecording();
    stopCompose();
    if (dialog.open) dialog.close();
  };
  const evaluate = async () => {
    if (!buildDubbingTimeline(clips, coverClip).length || evaluating) return;
    stopAudio();
    evaluating = true;
    render();
    setStatus('正在合并五页正文配音并提交讯飞评测；封面不计分。');
    let errorMessage = '';
    try {
      await onEvaluate({ coverClip, clips: clips.slice() });
    } catch (error) {
      errorMessage = error?.message || '讯飞评测失败，五页录音已保留，可以重试。';
    } finally {
      evaluating = false;
      if (dialog.open) {
        render();
        if (errorMessage) setStatus(errorMessage);
      }
    }
  };

  video.addEventListener('timeupdate', () => {
    if (composing && composeIndex === -1 && video.currentTime >= 1.95) {
      video.pause();
      void playComposeScene(0);
    }
  });
  audio.addEventListener('ended', () => {
    if (composing && composeIndex >= 0) void playComposeScene(composeIndex + 1);
    else {
      const finishedMode = audioMode;
      stopAudio();
      if (finishedMode === 'demo') setStatus('本句示范播放完了，试着读一遍吧。');
    }
  });
  recordButton.addEventListener('click', () => recorder?.state === 'recording' ? stopRecording() : void startRecording());
  demoButton.addEventListener('click', () => void playDemo());
  ownButton.addEventListener('click', () => void playOwn());
  pinyinButton.addEventListener('click', () => {
    showPinyin = !showPinyin;
    renderScript();
  });
  previousButton.addEventListener('click', () => selectPage(currentIndex - 1));
  nextButton.addEventListener('click', () => selectPage(currentIndex + 1));
  evaluateButton.addEventListener('click', () => void evaluate());
  composeButton.addEventListener('click', () => composing ? stopCompose() : void compose());
  dots.addEventListener('click', event => {
    const button = event.target.closest('[data-dubbing-page]');
    if (button) selectPage(Number(button.dataset.dubbingPage));
  });
  dialog.querySelector('.dubbing-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

  return {
    open() {
      if (!sourceUrl) {
        onStatus('视频母版还没有接入，暂时无法给插画配音。');
        return false;
      }
      stopCompose();
      video.src = sourceUrl;
      currentIndex = -1;
      render();
      dialog.showModal();
      return true;
    },
    close,
    destroy() {
      close();
      if (coverClip?.url) URL.revokeObjectURL(coverClip.url);
      clips.forEach(clip => { if (clip?.url) URL.revokeObjectURL(clip.url); });
      dialog.remove();
    },
  };
}
// End of the video preview module.
