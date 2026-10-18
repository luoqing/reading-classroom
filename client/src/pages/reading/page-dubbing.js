const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const formatSeconds = seconds => `${Math.max(.5, seconds).toFixed(1)} 秒`;

export function renderPageDubbingScript(page, showPinyin = true) {
  if (!showPinyin) return escapeHTML(page?.text || '');
  const pinyin = page?.pinyin?.[0]?.pinyin || '';
  const syllables = pinyin.trim().split(/\s+/u).filter(Boolean);
  const tokens = (page?.text || '').match(/会儿|[\s\S]/gu) || [];
  const hanTokens = tokens.filter(token => /\p{Script=Han}/u.test(token));
  if (!syllables.length || hanTokens.length !== syllables.length) return escapeHTML(page?.text || '');
  let index = 0;
  return tokens.map(token => /\p{Script=Han}/u.test(token)
    ? `<ruby>${escapeHTML(token)}<rt>${escapeHTML(syllables[index++])}</rt></ruby><wbr>`
    : escapeHTML(token)).join('');
}

export function setupPageDubbing({ onEvaluate = async () => {}, onStatus = () => {} } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'dubbing-dialog page-dubbing-dialog';
  dialog.setAttribute('aria-labelledby', 'pageDubbingTitle');
  dialog.innerHTML = `
    <div class="dubbing-head">
      <div><span class="eyebrow">给插画配音</span><h2 id="pageDubbingTitle"></h2></div>
      <button class="dubbing-close" type="button" aria-label="关闭逐页配音">×</button>
    </div>
    <div class="dubbing-workspace">
      <div class="dubbing-visual">
        <img alt="">
        <div class="dubbing-caption"></div>
        <span class="dubbing-page-badge"></span>
      </div>
      <div class="dubbing-panel">
        <div class="dubbing-progress"><span></span><strong></strong></div>
        <div class="dubbing-script-tools">
          <span class="small">看着这句读</span>
          <button class="dubbing-pinyin-toggle" type="button" aria-pressed="true">拼音已显示</button>
        </div>
        <p class="dubbing-script"></p>
        <p class="small dubbing-hint">先听示范，再看着插画读这一句。</p>
        <audio preload="metadata"></audio>
        <div class="dubbing-audio-actions">
          <button class="secondary" type="button" data-own hidden>▷ 听我的配音</button>
          <button class="secondary" type="button" data-demo>▷ 听本句示范</button>
        </div>
        <button class="primary dubbing-record" type="button" data-record>● 开始录这一页</button>
        <p class="dubbing-status" role="status"></p>
        <div class="dubbing-dots" aria-label="配音进度"></div>
        <div class="dubbing-nav">
          <button class="secondary" type="button" data-prev>← 上一页</button>
          <button class="secondary" type="button" data-next>下一页 →</button>
        </div>
        <div class="dubbing-finish-actions">
          <button class="primary dubbing-evaluate" type="button" data-evaluate disabled>提交评测</button>
          <button class="secondary dubbing-compose" type="button" data-compose disabled>✦ 合成朗读视频</button>
        </div>
      </div>
    </div>
    <p class="small dubbing-privacy">配音暂存在当前页面；登录后提交评测才会保存录音和结果。</p>`;
  document.body.append(dialog);

  const title = dialog.querySelector('#pageDubbingTitle');
  const image = dialog.querySelector('.dubbing-visual img');
  const caption = dialog.querySelector('.dubbing-caption');
  const badge = dialog.querySelector('.dubbing-page-badge');
  const progress = dialog.querySelector('.dubbing-progress span');
  const progressLabel = dialog.querySelector('.dubbing-progress strong');
  const script = dialog.querySelector('.dubbing-script');
  const pinyinButton = dialog.querySelector('.dubbing-pinyin-toggle');
  const audio = dialog.querySelector('audio');
  const ownButton = dialog.querySelector('[data-own]');
  const demoButton = dialog.querySelector('[data-demo]');
  const recordButton = dialog.querySelector('[data-record]');
  const previousButton = dialog.querySelector('[data-prev]');
  const nextButton = dialog.querySelector('[data-next]');
  const evaluateButton = dialog.querySelector('[data-evaluate]');
  const composeButton = dialog.querySelector('[data-compose]');
  const dots = dialog.querySelector('.dubbing-dots');
  const status = dialog.querySelector('.dubbing-status');

  let lesson = null;
  let pages = [];
  let clips = [];
  let currentIndex = 0;
  let recorder = null;
  let stream = null;
  let chunks = [];
  let recordingStartedAt = 0;
  let timer = null;
  let audioMode = null;
  let showPinyin = true;
  let evaluating = false;
  let composing = false;
  let replaceIndex = null;

  const setStatus = message => {
    status.textContent = message;
    onStatus(message);
  };
  const stopAudio = () => {
    audio.pause();
    audioMode = null;
    ownButton.textContent = '▷ 听我的配音';
    demoButton.textContent = '▷ 听本句示范';
  };
  const releaseStream = () => {
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };
  const revokeClips = () => clips.forEach(clip => { if (clip?.url) URL.revokeObjectURL(clip.url); });
  const completedCount = () => clips.filter(Boolean).length;
  const showPage = () => {
    const page = pages[currentIndex];
    image.src = page.illustrationUrl;
    image.alt = page.text;
    caption.textContent = page.text;
    badge.textContent = `${currentIndex + 1}/${pages.length}`;
    script.innerHTML = renderPageDubbingScript(page, showPinyin);
  };
  const render = () => {
    const clip = clips[currentIndex];
    const completed = completedCount();
    showPage();
    progress.style.width = `${completed / pages.length * 100}%`;
    progressLabel.textContent = `已完成 ${completed}/${pages.length} 页`;
    pinyinButton.setAttribute('aria-pressed', String(showPinyin));
    pinyinButton.textContent = showPinyin ? '拼音已显示' : '显示拼音';
    pinyinButton.disabled = evaluating || composing;
    previousButton.disabled = evaluating || composing || currentIndex === 0;
    nextButton.disabled = evaluating || composing || currentIndex === pages.length - 1;
    ownButton.hidden = !clip;
    ownButton.disabled = evaluating || composing;
    demoButton.disabled = evaluating || composing;
    recordButton.disabled = evaluating || composing;
    recordButton.textContent = replaceIndex === currentIndex ? '再点一次确认重录' : clip ? '● 重新录这一页' : '● 开始录这一页';
    evaluateButton.disabled = completed !== pages.length || evaluating || composing;
    composeButton.disabled = completed !== pages.length || evaluating;
    evaluateButton.textContent = evaluating ? '正在评测…' : '提交评测';
    composeButton.textContent = composing ? 'Ⅱ 停止播放' : completed === pages.length ? '✦ 合成朗读视频' : `还有 ${pages.length - completed} 页未录`;
    dots.innerHTML = pages.map((page, index) => `<button type="button" data-page="${index}" aria-label="第 ${index + 1} 页" class="${index === currentIndex ? 'active ' : ''}${clips[index] ? 'done' : ''}"><span>${clips[index] ? '✓' : index + 1}</span></button>`).join('');
    if (!composing) setStatus(clip ? `这一页已录好 · ${formatSeconds(clip.duration)}` : '这一页还没有配音。');
  };
  const selectPage = index => {
    if (recorder?.state === 'recording' || evaluating || composing) return;
    stopAudio();
    replaceIndex = null;
    currentIndex = clamp(index, 0, pages.length - 1);
    render();
  };
  const stopRecording = () => {
    if (recorder?.state === 'recording') recorder.stop();
  };
  const startRecording = async () => {
    const previous = clips[currentIndex];
    if (previous && replaceIndex !== currentIndex) {
      replaceIndex = currentIndex;
      render();
      setStatus('再点一次“确认重录”，就会替换这一页的配音。');
      return;
    }
    replaceIndex = null;
    stopAudio();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setStatus('当前浏览器不支持配音，请用 HTTPS 打开并允许麦克风。');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      recorder = new MediaRecorder(stream);
      chunks = [];
      const recordingIndex = currentIndex;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => {
        clearInterval(timer);
        releaseStream();
        recorder = null;
        render();
        setStatus('这一页没有录好，请再试一次。');
      };
      recorder.onstop = () => {
        clearInterval(timer);
        releaseStream();
        if (clips[recordingIndex]?.url) URL.revokeObjectURL(clips[recordingIndex].url);
        const recordedBlob = new Blob(chunks, { type: recorder.mimeType });
        clips[recordingIndex] = {
          blob: recordedBlob,
          url: URL.createObjectURL(recordedBlob),
          duration: Math.max(.5, (performance.now() - recordingStartedAt) / 1000),
          pageId: pages[recordingIndex].id,
        };
        recorder = null;
        currentIndex = recordingIndex;
        render();
        setStatus(recordingIndex < pages.length - 1 ? `第 ${recordingIndex + 1}/${pages.length} 页已录好，可以继续下一页。` : '最后一页已录好，现在可以提交评测或合成朗读视频。');
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
      recorder = null;
      setStatus(error?.name === 'NotAllowedError' ? '请允许麦克风后再录这一页。' : '无法启动麦克风，请稍后重试。');
    }
  };
  const playDemo = async () => {
    const source = pages[currentIndex].demoAudioUrl;
    if (!source) return setStatus('本句示范音频还没有准备好。');
    if (!audio.paused && audioMode === 'demo') return stopAudio();
    stopAudio();
    audioMode = 'demo';
    audio.src = source;
    demoButton.textContent = 'Ⅱ 暂停本句示范';
    setStatus('正在播放这一句的示范。');
    try { await audio.play(); } catch { setStatus('本句示范暂时无法播放，请稍后重试。'); }
  };
  const playOwn = async () => {
    const clip = clips[currentIndex];
    if (!clip) return;
    if (!audio.paused && audioMode === 'own') return stopAudio();
    stopAudio();
    audioMode = 'own';
    audio.src = clip.url;
    ownButton.textContent = 'Ⅱ 暂停我的配音';
    setStatus('正在回听我的这一页配音。');
    try { await audio.play(); } catch { setStatus('这一页的配音暂时无法播放。'); }
  };
  const playComposedPage = async index => {
    if (!composing) return;
    if (index >= pages.length) {
      composing = false;
      audioMode = null;
      render();
      setStatus('播放完成，四幅插画和配音已按顺序连在一起。');
      return;
    }
    currentIndex = index;
    showPage();
    audioMode = 'compose';
    audio.src = clips[index].url;
    setStatus(`正在播放 ${index + 1}/${pages.length}`);
    try { await audio.play(); } catch { composing = false; render(); setStatus('暂时无法播放，请重试。'); }
  };
  const toggleCompose = () => {
    if (composing) {
      composing = false;
      stopAudio();
      render();
      return;
    }
    if (completedCount() !== pages.length) return;
    stopAudio();
    composing = true;
    render();
    void playComposedPage(0);
  };
  const evaluate = async () => {
    if (completedCount() !== pages.length || evaluating) return;
    stopAudio();
    evaluating = true;
    render();
    setStatus(`正在合并 ${pages.length} 页配音，请选择评测方式。`);
    let errorMessage = '';
    try { await onEvaluate({ coverClip: null, clips: clips.slice(), pages: pages.slice() }); }
    catch (error) { errorMessage = error?.message || '评测失败，逐页录音已保留，可以重试。'; }
    finally {
      evaluating = false;
      if (dialog.open) {
        render();
        if (errorMessage) setStatus(errorMessage);
      }
    }
  };
  const close = () => {
    stopRecording();
    composing = false;
    stopAudio();
    if (dialog.open) dialog.close();
  };

  recordButton.addEventListener('click', () => recorder?.state === 'recording' ? stopRecording() : void startRecording());
  demoButton.addEventListener('click', () => void playDemo());
  ownButton.addEventListener('click', () => void playOwn());
  previousButton.addEventListener('click', () => selectPage(currentIndex - 1));
  nextButton.addEventListener('click', () => selectPage(currentIndex + 1));
  evaluateButton.addEventListener('click', () => void evaluate());
  composeButton.addEventListener('click', toggleCompose);
  pinyinButton.addEventListener('click', () => { showPinyin = !showPinyin; render(); });
  dots.addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) selectPage(Number(button.dataset.page));
  });
  audio.addEventListener('ended', () => {
    if (audioMode === 'compose') void playComposedPage(currentIndex + 1);
    else {
      const mode = audioMode;
      stopAudio();
      if (mode === 'demo') setStatus('本句示范播放完了，试着读一遍吧。');
    }
  });
  dialog.querySelector('.dubbing-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });

  return {
    open(nextLesson) {
      const nextPages = (nextLesson?.pages || []).filter(page => page.pageType !== 'cover' && page.illustrationUrl);
      if (!nextPages.length) {
        onStatus('这篇课文还没有逐句插画，暂时无法配音。');
        return false;
      }
      if (lesson?.id !== nextLesson.id) {
        revokeClips();
        clips = Array(nextPages.length).fill(null);
      }
      lesson = nextLesson;
      pages = nextPages;
      currentIndex = 0;
      showPinyin = true;
      title.textContent = `一页一页，读出你的《${lesson.title}》`;
      render();
      dialog.showModal();
      return true;
    },
    close,
    destroy() {
      close();
      revokeClips();
      dialog.remove();
    },
  };
}
