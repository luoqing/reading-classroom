import { logger } from '@lark-apaas/client-toolkit/logger';
import { getTeacherSpeechClip } from '../../api/reading';
import { teacherClips } from './teacher-clips';
import {
  buildTeacherComment,
  buildTeacherSpeechKeys,
  selectPracticeIssue,
} from './teacher-comment';
import { teacherSpeechClips } from './teacher-speech-clips';
import { buildMergedSpeechUrl } from './teacher-audio';
import { assetRoot, readingAssets } from './assets';

const poses = readingAssets.teacher;
const segmentClips = {
  missing: { url: assetRoot + '1879289121639482.mp3', text: '这句话里有字可能没有读出来。先把橙色的重点字读完整，再把整句话连起来。' },
  extra: { url: assetRoot + '1879289121639450.mp3', text: '这句话可能多读或重复了字。看清原句，放慢一点，只读课文里有的字。' },
  tone: { url: assetRoot + '1879289121640538.mp3', text: '这句话的声调可以再稳一点。先听回放，再留意橙色重点字的声调和变调。' },
  pronunciation: { url: assetRoot + '1879289136252938.mp3', text: '这句话有几个字音可以更清楚。先把橙色重点字读准，再连贯地读完整句话。' },
};
export const playableIssue = report => selectPracticeIssue(report);

export function selectTeacherClip(report) {
  if (!report) return 'welcome';
  const { scores } = report;
  const complete = scores.integrity_score !== null && scores.integrity_score >= 90;
  const praise = complete && scores.accuracy_score >= 90 ? 'clear'
    : complete && scores.fluency_score >= 90 ? 'smooth' : 'effort';
  return praise + (playableIssue(report) ? '-practice' : '-explore');
}

export function setupTeacher({ getReport, onPractice, onListen }) {
  const $ = id => document.getElementById(id);
  const dialog = $('teacherDialog');
  const audio = $('teacherAudio');
  const portrait = $('teacherPortrait');
  const avatar = $('teacherAvatar');
  let report = null;
  let focus = null;
  let request = 0;
  let celebrated = false;
  let minimizeTimer;
  let replayAfterComment = false;
  let speechQueue = [];
  let speechIndex = 0;
  let speechVersion = 0;
  let speechPreparation = Promise.resolve();
  let unlocking = false;
  let unlocked = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  avatar.loading = 'lazy';
  const pose = speaking => {
    portrait.classList.toggle('speaking', speaking);
    const src = reducedMotion.matches ? poses.still : speaking ? poses.talking : poses.idle;
    if (avatar.src !== src) avatar.src = src;
  };
  const setCheer = theme => {
    const icons = {
      clear: ['🌟', '✨', '⭐'],
      smooth: ['👍', '✨', '👍', '🌟'],
      effort: ['🌸', '🌼', '✨'],
      welcome: ['🌸', '✨', '🌼'],
    }[theme] || ['✨'];
    [...$('teacherCheer').children].forEach((particle, index) => {
      const featured = index % 3 === 0;
      particle.className = featured ? 'petal' : 'ribbon';
      particle.textContent = featured ? icons[Math.floor(index / 3) % icons.length] : '';
    });
  };
  portrait.tabIndex = 0;
  portrait.setAttribute('role', 'button');
  portrait.setAttribute('aria-label', '播放或暂停小秋评语');
  const minimizeButton = document.createElement('button');
  minimizeButton.id = 'teacherMinimize';
  minimizeButton.className = 'teacher-minimize';
  minimizeButton.type = 'button';
  minimizeButton.textContent = '− 收起';
  minimizeButton.setAttribute('aria-label', '缩小小秋');
  minimizeButton.title = '缩小为悬浮头像';
  dialog.append(minimizeButton);
  pose(false);
  const stop = () => { request++; replayAfterComment = false; clearTimeout(minimizeTimer); audio.pause(); pose(false); };
  const close = () => { stop(); $('audio')?.pause(); dialog.classList.remove('minimized'); if (dialog.open) dialog.close(); };
  const open = () => { clearTimeout(minimizeTimer); dialog.classList.remove('minimized'); if (!dialog.open) dialog.show(); };
  const setSpeechQueue = urls => {
    speechQueue = urls.filter(Boolean);
    speechIndex = 0;
    speechVersion += 1;
    speechPreparation = Promise.resolve();
    audio.src = speechQueue[0] || '';
  };
  const setMergedSpeechQueue = (urls, keys) => {
    setSpeechQueue(urls);
    if (speechQueue.length < 2) return;
    const version = speechVersion;
    speechPreparation = buildMergedSpeechUrl(keys, getTeacherSpeechClip)
      .then(mergedUrl => {
        if (version !== speechVersion) return;
        speechQueue = [mergedUrl];
        speechIndex = 0;
        audio.src = mergedUrl;
      })
      .catch(error => {
        logger.warn('总评音频合并失败，已回退分段播放', error);
      });
  };
  async function play() {
    if (!speechQueue.length) return;
    const id = ++request;
    $('demoAudio').pause(); $('audio').pause();
    document.querySelectorAll('#history audio').forEach(a => a.pause());
    $('teacherAudioStatus').textContent = '正在准备语音…';
    try {
      await speechPreparation;
      if (id !== request || !dialog.open) return;
      if (audio.ended && speechIndex === speechQueue.length - 1) {
        speechIndex = 0;
        audio.src = speechQueue[0];
      }
      await audio.play();
      if (id !== request || !dialog.open) audio.pause();
    } catch { if (id === request) $('teacherAudioStatus').textContent = '语音未能自动播放，请点“听小秋说”重试。'; }
  }
  async function unlock() {
    if (unlocked || unlocking) return;
    unlocking = true;
    const warmup = new Audio(teacherClips.welcome.url);
    warmup.muted = true;
    try {
      await warmup.play();
      warmup.pause();
      unlocked = true;
    } catch {
      // The dialog still provides an explicit play button if the browser blocks this warm-up.
    } finally {
      unlocking = false;
    }
  }
  function show(result) {
    stop(); report = result; focus = playableIssue(report); celebrated = false;
    $('teacherCheer').classList.remove('celebrating');
    const clipName = selectTeacherClip(report);
    const clip = teacherClips[clipName];
    const comment = buildTeacherComment(report);
    setCheer(clipName.split('-')[0]);
    $('teacherWords').textContent = report ? comment.text : clip.text;
    $('teacherMode').textContent = report ? '两项讲评 · 点击播放' : '见面试听 · 不是评测结果';
    $('teacherFocus').hidden = true;
    $('teacherWord').textContent = focus?.word || '';
    $('teacherPractice').textContent = focus ? '▷ 回听重点句' : '回到课文';
    const speechKeys = buildTeacherSpeechKeys(report);
    const speechUrls = speechKeys.map(key => teacherSpeechClips[key]);
    setMergedSpeechQueue(
      speechUrls.length === speechKeys.length && speechUrls.length
        ? speechUrls
        : [clip.url],
      speechKeys,
    );
    replayAfterComment = Boolean(focus);
    open();
    $('teacherReplay').textContent = '▷ 听小秋说';
    $('teacherAudioStatus').textContent = '点“听小秋说”播放评语。';
  }
  function showSegment(segment, kind) {
    const clip = segmentClips[kind] || segmentClips.pronunciation;
    stop(); focus = segment; celebrated = true;
    $('teacherCheer').classList.remove('celebrating');
    $('teacherWords').textContent = clip.text;
    $('teacherMode').textContent = '这句的小秋点评';
    $('teacherFocus').hidden = true;
    $('teacherWord').textContent = segment.issues?.map(issue => issue.word).filter(Boolean).join('、') || '';
    $('teacherPractice').textContent = '▷ 回听这句';
    setSpeechQueue([clip.url]);
    replayAfterComment = true;
    open();
    $('teacherReplay').textContent = '▷ 听小秋说';
    $('teacherAudioStatus').textContent = '点“听小秋说”播放评语。';
  }
  audio.onplay = () => { if (unlocking) return; $('teacherReplay').textContent = 'Ⅱ 暂停'; $('teacherAudioStatus').textContent = '小秋正在说…'; };
  audio.onpause = () => { if (unlocking) return; pose(false); $('teacherReplay').textContent = '▷ 再听一次'; $('teacherAudioStatus').textContent = audio.ended ? '轮到你试一试啦。' : '已暂停'; };
  audio.onended = () => {
    pose(false);
    if (speechIndex < speechQueue.length - 1) {
      speechIndex += 1;
      audio.src = speechQueue[speechIndex];
      void play();
      return;
    }
    if (replayAfterComment && focus) {
      replayAfterComment = false;
      $('teacherAudioStatus').textContent = '现在回放你的朗读，听一听、核实一下。';
      dialog.classList.add('minimized');
      onListen(focus);
      return;
    }
    $('teacherAudioStatus').textContent = '点评说完啦，点小秋可以再听。';
    minimizeTimer = setTimeout(() => { if (dialog.open && audio.ended) dialog.classList.add('minimized'); }, 700);
  };
  audio.onwaiting = () => { if (!unlocking) pose(false); };
  audio.onplaying = () => {
    if (unlocking) return;
    pose(true);
    if (!celebrated) { $('teacherCheer').classList.add('celebrating'); celebrated = true; }
  };
  audio.onerror = () => { if (unlocking || !dialog.open) return; pose(false); $('teacherReplay').textContent = '▷ 点这里听评语'; $('teacherAudioStatus').textContent = '没有自动播放，点小秋或下方按钮听评语。'; };
  $('teacherReplay').onclick = () => { dialog.classList.remove('minimized'); if (audio.paused) void play(); else stop(); };
  const togglePortrait = () => { if (!dialog.open) return; if (dialog.classList.contains('minimized')) { dialog.classList.remove('minimized'); void play(); } else if (audio.paused) void play(); else stop(); };
  $('teacherPortrait').onclick = togglePortrait;
  $('teacherPortrait').onkeydown = event => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); togglePortrait(); };
  minimizeButton.onclick = () => { clearTimeout(minimizeTimer); dialog.classList.add('minimized'); };
  $('teacherClose').onclick = close;
  dialog.onclose = () => { stop(); $('audio')?.pause(); };
  dialog.oncancel = close;
  $('teacherPractice').onclick = () => { if (focus) { stop(); onListen(focus); } else { close(); onPractice(); } };
  $('meetTeacher').onclick = () => show(getReport());
  return { show, showSegment, stop, close, unlock };
}
