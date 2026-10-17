import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAutumnVideoTimeline,
  buildDubbingTimeline,
  renderAutumnDubbingScript,
} from '../client/src/pages/reading/video-preview.js';

const lessonText = '天气凉了，树叶黄了，一片片叶子从树上落下来。\n\n天那么蓝，那么高。一群大雁往南飞，一会儿排成个“人”字，一会儿排成个“一”字。\n\n啊！秋天来了！';
const characters = lessonText.match(/\p{Script=Han}/gu) || [];
const words = characters.map((content, position) => ({
  content,
  position,
  length: 1,
  start: .4 + position * .3,
  end: .65 + position * .3,
}));

test('Autumn video scenes follow the sentence boundaries returned by Xunfei', () => {
  const timeline = buildAutumnVideoTimeline({ words, aligned: true });

  assert.equal(timeline.length, 6);
  assert.deepEqual(timeline.map(scene => [scene.sourceStart, scene.sourceEnd]), [
    [0, 2],
    [2, 9],
    [9, 14],
    [14, 19],
    [19, 24],
    [24, 30],
  ]);
  assert.equal(timeline[0].kind, 'title');
  assert.equal(timeline[1].audioStart, 0);
  assert.equal(timeline[1].audioEnd, timeline[2].audioStart);
  assert.equal(timeline[5].text, '啊！秋天来了！');
  assert.ok(timeline[2].audioStart > timeline[1].audioStart);
});

test('picture-book dubbing includes the recorded cover before all five body pages', () => {
  const coverClip = { url: 'blob:cover', duration: 1.4 };
  const clips = [4.8, 4.2, 2.4, 2.6, 3.1].map((duration, index) => ({
    url: `blob:scene-${index + 1}`,
    duration,
  }));

  const timeline = buildDubbingTimeline(clips, coverClip);

  assert.equal(timeline.length, 6);
  assert.equal(timeline[0].kind, 'title');
  assert.equal(timeline[0].audioUrl, coverClip.url);
  assert.deepEqual(timeline[0], {
    id: 'title',
    kind: 'title',
    text: '秋天',
    sourceStart: 0,
    sourceEnd: 2,
    audioUrl: coverClip.url,
    audioStart: 0,
    audioEnd: 1.4,
  });
  assert.deepEqual(timeline.slice(1).map(scene => scene.audioUrl), clips.map(clip => clip.url));
  assert.deepEqual(timeline.slice(1).map(scene => scene.audioStart), [1.4, 6.2, 10.4, 12.8, 15.4]);
  assert.equal(timeline.at(-1).audioEnd, 18.5);
  assert.deepEqual(buildDubbingTimeline(clips), []);
  assert.deepEqual(buildDubbingTimeline(clips.slice(0, 4), coverClip), []);
});

test('picture-book dubbing can show or hide first-grade pinyin', () => {
  const withPinyin = renderAutumnDubbingScript(2);
  const withoutPinyin = renderAutumnDubbingScript(2, false);

  assert.match(withPinyin, /<ruby>会儿<rt>huìr<\/rt><\/ruby>/u);
  assert.match(withPinyin, /<ruby>一<rt>yí<\/rt><\/ruby>/u);
  assert.equal(withoutPinyin, '一会儿排成个“人”字，');
});
