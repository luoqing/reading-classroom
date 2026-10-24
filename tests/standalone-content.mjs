import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFileSync(path.join(root, relative), 'utf8');

test('standalone content includes both lessons and every referenced local media file', () => {
  const lessonSource = read('client/src/pages/reading/local-lessons.ts');
  assert.match(lessonSource, /slug: 'autumn'/);
  assert.match(lessonSource, /slug: 'prettiest-house'/);
  assert.match(lessonSource, /天气凉了，树叶黄了/);
  assert.match(lessonSource, /哪座房子最漂亮/);

  const sources = [
    lessonSource,
    read('client/src/pages/reading/assets.js'),
    read('client/src/pages/reading/teacher-clips.js'),
    read('client/src/pages/reading/teacher-speech-clips.js'),
    read('client/src/pages/reading/teacher.js'),
  ];
  const referenced = new Set(
    sources.flatMap(source => [...source.matchAll(/\b(\d{16}\.(?:jpg|jpeg|png|webp|mp3|mp4|ttf))\b/g)]
      .map(match => match[1])),
  );
  assert.ok(referenced.size >= 60);
  for (const file of referenced) {
    assert.equal(
      existsSync(path.join(root, 'client/public/content/media', file)),
      true,
      `missing local media: ${file}`,
    );
  }
});

test('standalone runtime sources do not depend on Miaoda storage URLs', () => {
  const sources = [
    read('client/src/pages/reading/local-lessons.ts'),
    read('client/src/pages/reading/assets.js'),
    read('client/src/pages/reading/markup.ts'),
  ].join('\n');
  assert.doesNotMatch(sources, /bytedance\.feishuapp\.cn/);
  assert.match(sources, /\/content\/media\//);
});

test('standalone guest entry does not initialize the Miaoda client runtime', () => {
  const sources = [
    read('client/src/index.tsx'),
    read('client/src/api/auth.ts'),
    read('client/src/api/classroom.ts'),
    read('client/src/api/lessons.ts'),
    read('client/src/api/reading.ts'),
    read('client/src/pages/reading/teacher.js'),
  ].join('\n');
  assert.doesNotMatch(sources, /@lark-apaas\/client-toolkit/);
  assert.match(read('client/src/api/http.ts'), /axios\.request/);
});
